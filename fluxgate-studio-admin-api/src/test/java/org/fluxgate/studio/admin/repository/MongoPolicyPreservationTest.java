package org.fluxgate.studio.admin.repository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.spy;

import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import com.mongodb.client.MongoCollection;
import com.mongodb.client.model.Filters;
import com.mongodb.client.model.IndexOptions;
import com.mongodb.client.model.Indexes;
import java.util.List;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.bson.Document;
import org.bson.conversions.Bson;
import org.fluxgate.adapter.mongo.converter.RateLimitRuleConverter;
import org.fluxgate.adapter.mongo.converter.RateLimitRuleMongoConverter;
import org.fluxgate.adapter.mongo.repository.MongoRateLimitRuleRepository;
import org.fluxgate.core.config.RateLimitRule;
import org.fluxgate.studio.admin.dto.request.CreateRuleRequest;
import org.fluxgate.studio.admin.dto.request.RateBandRequest;
import org.fluxgate.studio.admin.dto.request.SimulateRequest;
import org.fluxgate.studio.admin.dto.request.UpdateRuleRequest;
import org.fluxgate.studio.admin.exception.AmbiguousRuleException;
import org.fluxgate.studio.admin.exception.InvalidRuleException;
import org.fluxgate.studio.admin.exception.RuleAlreadyExistsException;
import org.fluxgate.studio.admin.exception.RuleVersionMismatchException;
import org.fluxgate.studio.admin.service.RuleService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.MongoDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers
class MongoPolicyPreservationTest {
  @Container static final MongoDBContainer MONGO = new MongoDBContainer("mongo:7.0");
  private MongoClient client;
  private MongoCollection<Document> collection;
  private RuleService service;

  @BeforeEach
  void setUp() {
    client = MongoClients.create(MONGO.getReplicaSetUrl());
    collection = client.getDatabase("studio_preservation").getCollection("rules");
    collection.drop();
    service =
        new RuleService(
            new MongoRateLimitRuleRepository(collection),
            new MongoStudioRuleRepository(collection));
    collection.insertOne(policy());
  }

  @AfterEach
  void close() {
    client.close();
  }

  private Document policy() {
    return new Document("id", "policy")
        .append("name", "Original")
        .append("enabled", true)
        .append("scope", "PER_IP")
        .append("keyStrategyId", "ip")
        .append("onLimitExceedPolicy", "REJECT_REQUEST")
        .append("ruleSetId", "set")
        .append("attributes", new Document("version", 1L).append("vendor", "keep"))
        .append("priority", 9)
        .append("pathPatterns", List.of("/private/**"))
        .append("methods", List.of("POST"))
        .append("excludePathPatterns", List.of("/private/status"))
        .append("headerEquals", new Document("x-tier", "paid"))
        .append("headerPresent", List.of("authorization"))
        .append("deniedIps", List.of("10.0.0.0/8"))
        .append("allowedIps", List.of("127.0.0.1"))
        .append("deniedKeys", List.of("user:blocked"))
        .append("allowedKeys", List.of("user:admin"))
        .append("futurePolicy", new Document("opaque", List.of(1, 2)))
        .append(
            "bands",
            List.of(
                new Document("label", "monthly")
                    .append("capacity", 100L)
                    .append("windowSeconds", 2592000L)
                    .append("algorithm", "FIXED_WINDOW")
                    .append("quotaPeriod", "MONTHLY")
                    .append("zoneId", "Asia/Seoul")
                    .append("slidingWindowBuckets", 10)
                    .append("vendorBand", "keep")));
  }

  private UpdateRuleRequest update(String label, long version) {
    return new UpdateRuleRequest(
        "Renamed",
        true,
        "PER_IP",
        "ip",
        "REJECT_REQUEST",
        List.of(new RateBandRequest(2592000L, 200L, label)),
        "set",
        null,
        null,
        version);
  }

  private Document stored() {
    return collection.find(Filters.eq("id", "policy")).first();
  }

  private void assertPolicyFields(Document result, Document original) {
    for (String key :
        List.of(
            "priority",
            "pathPatterns",
            "methods",
            "excludePathPatterns",
            "headerEquals",
            "headerPresent",
            "allowedIps",
            "deniedIps",
            "allowedKeys",
            "deniedKeys",
            "futurePolicy")) {
      assertThat(result.get(key)).as(key).isEqualTo(original.get(key));
    }
    Document band = result.getList("bands", Document.class).getFirst();
    Document before = original.getList("bands", Document.class).getFirst();
    for (String key :
        List.of("algorithm", "quotaPeriod", "zoneId", "slidingWindowBuckets", "vendorBand")) {
      assertThat(band.get(key)).as(key).isEqualTo(before.get(key));
    }
    assertThat(result.get("attributes", Document.class).getString("vendor")).isEqualTo("keep");
  }

  @Test
  void nameAndCapacityUpdatePreservesUnknownAndExtendedFields() {
    Document original = stored();
    service.updateRule("policy", update("monthly", 1), null);
    Document result = stored();
    assertThat(result.getString("name")).isEqualTo("Renamed");
    assertThat(result.getList("bands", Document.class).getFirst().getLong("capacity"))
        .isEqualTo(200L);
    assertPolicyFields(result, original);
  }

  @Test
  void togglePreservesWholePolicyAndIncrementsVersion() {
    Document original = stored();
    service.toggleRule("policy");
    Document result = stored();
    assertThat(result.getBoolean("enabled")).isFalse();
    assertThat(result.get("attributes", Document.class).getLong("version")).isEqualTo(2L);
    assertPolicyFields(result, original);
  }

  @Test
  void conflictingUpdateDoesNotOverwritePolicy() {
    service.updateRule("policy", update("monthly", 1), null);
    assertThatThrownBy(() -> service.updateRule("policy", update("monthly", 1), null))
        .isInstanceOf(RuleVersionMismatchException.class);
    assertThat(stored().get("attributes", Document.class).getLong("version")).isEqualTo(2L);
  }

  @Test
  void ambiguousExtendedBandRenameIsRejectedWithoutMutation() {
    Document original = stored();
    assertThatThrownBy(() -> service.updateRule("policy", update("renamed-band", 1), null))
        .isInstanceOf(InvalidRuleException.class);
    assertThat(stored()).isEqualTo(original);
  }

  @Test
  void importExistingUsesPreservingUpdate() {
    Document original = stored();
    CreateRuleRequest request =
        new CreateRuleRequest(
            "policy",
            "Imported",
            true,
            "PER_IP",
            "ip",
            "REJECT_REQUEST",
            List.of(new RateBandRequest(2592000L, 150L, "monthly")),
            "set",
            null,
            null);
    service.importRules(List.of(request));
    assertThat(stored().getString("name")).isEqualTo("Imported");
    assertPolicyFields(stored(), original);
  }

  @Test
  void duplicateCreateCannotReplacePolicy() {
    Document original = stored();
    CreateRuleRequest request =
        new CreateRuleRequest(
            "policy",
            "Replacement",
            true,
            "PER_IP",
            "ip",
            "REJECT_REQUEST",
            List.of(new RateBandRequest(60L, 1L, "other")),
            "set",
            null,
            null);
    assertThatThrownBy(() -> service.createRule(request))
        .isInstanceOf(RuleAlreadyExistsException.class);
    assertThat(stored()).isEqualTo(original);
  }

  private RateLimitRule nextVersion() {
    Document next = stored();
    next.put("name", "Concurrent");
    next.put("attributes", new Document("version", 2L));
    return RateLimitRuleConverter.toDomain(RateLimitRuleMongoConverter.fromBson(next));
  }

  @Test
  void concurrentWritesFromSameVersionHaveOnlyOneWinner() throws Exception {
    MongoCollection<Document> intercepted = spy(collection);
    CyclicBarrier barrier = new CyclicBarrier(2);
    doAnswer(
            invocation -> {
              barrier.await(10, TimeUnit.SECONDS);
              return collection.replaceOne(
                  invocation.getArgument(0, Bson.class), invocation.getArgument(1, Document.class));
            })
        .when(intercepted)
        .replaceOne(any(Bson.class), any(Document.class));
    MongoStudioRuleRepository repository = new MongoStudioRuleRepository(intercepted);
    RateLimitRule next = nextVersion();
    try (var executor = Executors.newFixedThreadPool(2)) {
      var first = executor.submit(() -> repository.replaceIfVersionMatches(next, 1));
      var second = executor.submit(() -> repository.replaceIfVersionMatches(next, 1));
      assertThat(List.of(first.get(15, TimeUnit.SECONDS), second.get(15, TimeUnit.SECONDS)))
          .containsExactlyInAnyOrder(true, false);
    }
    assertThat(stored().get("attributes", Document.class).getLong("version")).isEqualTo(2L);
  }

  @Test
  void externalWriteWithoutVersionBumpIsNotLost() {
    MongoCollection<Document> intercepted = spy(collection);
    doAnswer(
            invocation -> {
              collection.updateOne(
                  Filters.eq("id", "policy"),
                  new Document("$set", new Document("deniedKeys", List.of("user:new-block"))));
              return collection.replaceOne(
                  invocation.getArgument(0, Bson.class), invocation.getArgument(1, Document.class));
            })
        .when(intercepted)
        .replaceOne(any(Bson.class), any(Document.class));
    assertThat(new MongoStudioRuleRepository(intercepted).replaceIfVersionMatches(nextVersion(), 1))
        .isFalse();
    assertThat(stored().getList("deniedKeys", String.class)).containsExactly("user:new-block");
    assertThat(stored().getString("name")).isEqualTo("Original");
  }

  @Test
  void simultaneousInsertsCannotOverwriteOrDuplicateAnId() throws Exception {
    MongoStudioRuleRepository repository = new MongoStudioRuleRepository(collection);
    Document incoming = policy();
    incoming.put("id", "new-policy");
    RateLimitRule rule =
        RateLimitRuleConverter.toDomain(RateLimitRuleMongoConverter.fromBson(incoming));
    CyclicBarrier barrier = new CyclicBarrier(2);
    try (var executor = Executors.newFixedThreadPool(2)) {
      var first =
          executor.submit(
              () -> {
                barrier.await();
                return repository.insertIfAbsent(rule);
              });
      var second =
          executor.submit(
              () -> {
                barrier.await();
                return repository.insertIfAbsent(rule);
              });
      assertThat(List.of(first.get(15, TimeUnit.SECONDS), second.get(15, TimeUnit.SECONDS)))
          .containsExactlyInAnyOrder(true, false);
    }
    assertThat(collection.countDocuments(Filters.eq("id", "new-policy"))).isEqualTo(1);
  }

  @Test
  void mixedAlgorithmBandsKeepTheirMetadataWhenReordered() {
    Document sliding =
        new Document("label", "minute")
            .append("windowSeconds", 60L)
            .append("capacity", 10L)
            .append("algorithm", "SLIDING_WINDOW")
            .append("slidingWindowBuckets", 6)
            .append("vendorBand", "sliding");
    Document token =
        new Document("label", "second")
            .append("windowSeconds", 1L)
            .append("capacity", 2L)
            .append("algorithm", "TOKEN_BUCKET")
            .append("vendorBand", "token");
    Document monthly = stored().getList("bands", Document.class).getFirst();
    collection.updateOne(
        Filters.eq("id", "policy"),
        new Document("$set", new Document("bands", List.of(monthly, sliding, token))));
    service.updateRule(
        "policy",
        new UpdateRuleRequest(
            "Mixed",
            true,
            "PER_IP",
            "ip",
            "REJECT_REQUEST",
            List.of(
                new RateBandRequest(1L, 3L, "second"),
                new RateBandRequest(2592000L, 200L, "monthly"),
                new RateBandRequest(60L, 20L, "minute")),
            "set",
            null,
            null,
            1L),
        null);
    var bands = stored().getList("bands", Document.class);
    assertThat(bands)
        .extracting(band -> band.getString("algorithm"))
        .containsExactly("TOKEN_BUCKET", "FIXED_WINDOW", "SLIDING_WINDOW");
    assertThat(bands.get(2).getInteger("slidingWindowBuckets")).isEqualTo(6);
    assertThat(bands.get(1).getString("quotaPeriod")).isEqualTo("MONTHLY");
    assertThat(bands.get(0).getString("vendorBand")).isEqualTo("token");
  }

  @Test
  void calendarBandDurationChangeRequiresAnExtendedEditor() {
    Document original = stored();
    UpdateRuleRequest request =
        new UpdateRuleRequest(
            "Unsafe",
            true,
            "PER_IP",
            "ip",
            "REJECT_REQUEST",
            List.of(new RateBandRequest(60L, 200L, "monthly")),
            "set",
            null,
            null,
            1L);
    assertThatThrownBy(() -> service.updateRule("policy", request, null))
        .isInstanceOf(InvalidRuleException.class);
    assertThat(stored()).isEqualTo(original);
  }

  @Test
  void togglingAnUnlabelledExtendedBandDoesNotInventALabel() {
    Document band = stored().getList("bands", Document.class).getFirst();
    band.remove("label");
    collection.updateOne(
        Filters.eq("id", "policy"), new Document("$set", new Document("bands", List.of(band))));
    service.toggleRule("policy");
    assertThat(stored().getList("bands", Document.class).getFirst()).doesNotContainKey("label");
  }

  private CreateRuleRequest scopedCreate(String set) {
    return new CreateRuleRequest(
        "shared",
        "Shared",
        true,
        "GLOBAL",
        "global",
        "REJECT_REQUEST",
        List.of(new RateBandRequest(60L, 10L, "minute")),
        set,
        null,
        null);
  }

  private UpdateRuleRequest scopedUpdate(String set, long version) {
    return new UpdateRuleRequest(
        "Edited",
        true,
        "GLOBAL",
        "global",
        "REJECT_REQUEST",
        List.of(new RateBandRequest(60L, 20L, "minute")),
        set,
        null,
        null,
        version);
  }

  @Test
  void migratedIndexesSupportColdConstructorAndIndependentPairCrudWithDefaultNormalization() {
    new MongoStudioRuleRepository(collection);
    for (String set : java.util.Arrays.asList("a", "b", null))
      service.createRule(scopedCreate(set));
    assertThat(service.getRuleById("a", "shared").ruleSetId()).isEqualTo("a");
    assertThat(service.getRuleById("default", "shared").ruleSetId()).isEqualTo("default");
    service.toggleRule("a", "shared");
    assertThat(service.getRuleById("a", "shared").enabled()).isFalse();
    assertThat(service.getRuleById("b", "shared").enabled()).isTrue();
    service.updateRule("b", "shared", scopedUpdate(null, 1L), null);
    assertThat(service.getRuleById("b", "shared").ruleSetId()).isEqualTo("b");
    assertThat(service.getRuleById("b", "shared").version()).isEqualTo(2L);
    assertThat(service.getRuleById("default", "shared").version()).isEqualTo(1L);
    service.simulate("a", "shared", new SimulateRequest(5L, 1L));
    service.simulate("default", "shared", new SimulateRequest(5L, 1L));
    service.deleteRule("default", "shared");
    assertThat(service.getRuleById("b", "shared").id()).isEqualTo("shared");
    service.deleteRule("a", "shared");
    assertThat(service.getRuleById("shared").ruleSetId()).isEqualTo("b");
    Document idIndex =
        collection.listIndexes().into(new java.util.ArrayList<>()).stream()
            .filter(index -> "id_1".equals(index.getString("name")))
            .findFirst()
            .orElseThrow();
    assertThat(idIndex.getBoolean("unique", false)).isFalse();
  }

  @Test
  void ambiguousLegacyOperationsDoNotWriteAnyPair() {
    service.createRule(scopedCreate("a"));
    service.createRule(scopedCreate(null));
    List<Document> before = collection.find().into(new java.util.ArrayList<>());
    assertThatThrownBy(() -> service.getRuleById("shared"))
        .isInstanceOf(AmbiguousRuleException.class);
    assertThatThrownBy(() -> service.updateRule("shared", scopedUpdate(null, 1L), null))
        .isInstanceOf(AmbiguousRuleException.class);
    assertThatThrownBy(() -> service.toggleRule("shared"))
        .isInstanceOf(AmbiguousRuleException.class);
    assertThatThrownBy(() -> service.deleteRule("shared"))
        .isInstanceOf(AmbiguousRuleException.class);
    assertThatThrownBy(() -> service.simulate("shared", new SimulateRequest(5L, 1L)))
        .isInstanceOf(AmbiguousRuleException.class);
    assertThat(collection.find().into(new java.util.ArrayList<>()))
        .containsExactlyElementsOf(before);
  }

  @Test
  void pairUpdateRefusesMoveAndStaleVersionWithoutTouchingOtherSet() {
    service.createRule(scopedCreate("a"));
    service.createRule(scopedCreate("b"));
    assertThatThrownBy(() -> service.updateRule("a", "shared", scopedUpdate("b", 1L), null))
        .isInstanceOf(InvalidRuleException.class);
    service.toggleRule("a", "shared");
    assertThatThrownBy(() -> service.updateRule("a", "shared", scopedUpdate(null, 1L), null))
        .isInstanceOf(RuleVersionMismatchException.class);
    assertThat(service.getRuleById("b", "shared").version()).isEqualTo(1L);
  }

  @Test
  void importMatchesCompleteIdentityInsteadOfGlobalId() {
    assertThat(
            service
                .importRules(List.of(scopedCreate("a"), scopedCreate("b"), scopedCreate(null)))
                .created())
        .isEqualTo(3);
    assertThat(service.importRules(List.of(scopedCreate("b"))).updated()).isEqualTo(1);
    assertThat(service.getRuleById("b", "shared").version()).isEqualTo(2L);
    assertThat(service.getRuleById("a", "shared").version()).isEqualTo(1L);
    assertThatThrownBy(() -> service.importRules(List.of(scopedCreate("a"), scopedCreate("a"))))
        .isInstanceOf(InvalidRuleException.class);
  }

  @Test
  void coldConstructorRefusesLegacyGlobalUniqueIndexWithoutDroppingIt() {
    collection.drop();
    collection.createIndex(Indexes.ascending("id"), new IndexOptions().unique(true).name("id_1"));
    collection.insertOne(policy());
    assertThatThrownBy(() -> new MongoStudioRuleRepository(collection))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("explicit migration");
    assertThat(collection.countDocuments()).isEqualTo(1);
    assertThat(collection.listIndexes().into(new java.util.ArrayList<>()))
        .anyMatch(
            index ->
                "id_1".equals(index.getString("name"))
                    && Boolean.TRUE.equals(index.getBoolean("unique")));
  }

  @Test
  void nullCreationAndImportNormalizeBeforeIdentityChecksAndMatchCoreReader() {
    assertThat(service.createRule(scopedCreate(null)).ruleSetId()).isEqualTo("default");
    assertThatThrownBy(() -> service.createRule(scopedCreate("default")))
        .isInstanceOf(RuleAlreadyExistsException.class);
    assertThatThrownBy(
            () -> service.importRules(List.of(scopedCreate(null), scopedCreate("default"))))
        .isInstanceOf(InvalidRuleException.class);
    assertThat(new MongoRateLimitRuleRepository(collection).findById("default", "shared"))
        .isPresent();
    assertThatThrownBy(() -> service.getRuleById((String) null, "shared"))
        .isInstanceOf(org.fluxgate.studio.admin.exception.RuleNotFoundException.class);
  }

  @Test
  void actualAspectNotifiesSuccessfulDefaultAndOmittedSetWritesButNeverFailedCas() {
    var notifier = org.mockito.Mockito.mock(org.fluxgate.control.notify.RuleChangeNotifier.class);
    var aspect = new org.fluxgate.control.aop.RuleChangeAspect(notifier);
    var studio = org.mockito.Mockito.spy(new MongoStudioRuleRepository(collection));
    var factory =
        new org.springframework.aop.aspectj.annotation.AspectJProxyFactory(
            new RuleService(new MongoRateLimitRuleRepository(collection), studio));
    factory.addAspect(aspect);
    RuleService proxied = factory.getProxy();
    try {
      assertThat(proxied.createRule(scopedCreate(null)).ruleSetId()).isEqualTo("default");
      proxied.updateRule("default", "shared", scopedUpdate(null, 1L), null);
      proxied.toggleRule("default", "shared");
      org.mockito.Mockito.verify(notifier, org.mockito.Mockito.times(3)).publishFullReload();
      org.mockito.Mockito.doReturn(false)
          .when(studio)
          .replaceIfVersionMatches(any(), org.mockito.ArgumentMatchers.anyLong());
      assertThatThrownBy(
              () -> proxied.updateRule("default", "shared", scopedUpdate(null, 3L), null))
          .isInstanceOf(RuleVersionMismatchException.class);
      org.mockito.Mockito.verifyNoMoreInteractions(notifier);
    } finally {
      aspect.shutdown();
    }
  }

  @Test
  void blankCreationAndImportAreRejectedBeforeAnyWrite() {
    List<Document> before = collection.find().into(new java.util.ArrayList<>());
    for (String set : List.of("", " ")) {
      assertThatThrownBy(() -> service.createRule(scopedCreate(set)))
          .isInstanceOf(InvalidRuleException.class);
      assertThatThrownBy(() -> service.importRules(List.of(scopedCreate("new"), scopedCreate(set))))
          .isInstanceOf(InvalidRuleException.class);
    }
    assertThat(collection.find().into(new java.util.ArrayList<>()))
        .containsExactlyElementsOf(before);
  }
}
