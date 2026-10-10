package org.fluxgate.studio.admin.repository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.mongodb.client.DistinctIterable;
import com.mongodb.client.FindIterable;
import com.mongodb.client.ListIndexesIterable;
import com.mongodb.client.MongoCollection;
import com.mongodb.client.MongoCursor;
import com.mongodb.client.result.UpdateResult;
import java.time.Duration;
import java.util.Arrays;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import org.bson.Document;
import org.bson.conversions.Bson;
import org.fluxgate.core.config.LimitScope;
import org.fluxgate.core.config.OnLimitExceedPolicy;
import org.fluxgate.core.config.RateLimitBand;
import org.fluxgate.core.config.RateLimitRule;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class MongoStudioRuleRepositoryTest {

  private MongoCollection<Document> collection;
  private MongoStudioRuleRepository repository;

  @BeforeEach
  @SuppressWarnings("unchecked")
  void setUp() {
    collection = mock(MongoCollection.class);
    ListIndexesIterable<Document> indexes = mock(ListIndexesIterable.class);
    MongoCursor<Document> cursor = mock(MongoCursor.class);
    when(collection.listIndexes()).thenReturn(indexes);
    when(indexes.iterator()).thenReturn(cursor);
    repository = new MongoStudioRuleRepository(collection);
  }

  private static Document ruleDocument(String id, boolean enabled, Long version) {
    Document document =
        new Document()
            .append("id", id)
            .append("name", "Rule " + id)
            .append("enabled", enabled)
            .append("scope", "PER_IP")
            .append("keyStrategyId", "ip")
            .append("onLimitExceedPolicy", "REJECT_REQUEST")
            .append("ruleSetId", "set-1")
            .append(
                "bands",
                List.of(
                    new Document()
                        .append("windowSeconds", 60L)
                        .append("capacity", 100L)
                        .append("label", "per-minute")));
    if (version != null) {
      document.append("attributes", new Document("version", version));
    }
    return document;
  }

  private static RateLimitRule rule(String id, long version) {
    return RateLimitRule.builder(id)
        .name("Rule " + id)
        .enabled(true)
        .scope(LimitScope.PER_IP)
        .keyStrategyId("ip")
        .onLimitExceedPolicy(OnLimitExceedPolicy.REJECT_REQUEST)
        .ruleSetId("set-1")
        .attributes(Map.of(RuleVersions.VERSION_ATTRIBUTE, version))
        .addBand(RateLimitBand.builder(Duration.ofSeconds(60), 100).label("per-minute").build())
        .build();
  }

  @SuppressWarnings("unchecked")
  private FindIterable<Document> stubFind(List<Document> documents) {
    FindIterable<Document> iterable = mock(FindIterable.class);
    when(collection.find(any(Bson.class))).thenReturn(iterable);
    when(iterable.first()).thenReturn(documents.isEmpty() ? null : documents.getFirst());
    when(iterable.sort(any(Bson.class))).thenReturn(iterable);
    when(iterable.skip(anyInt())).thenReturn(iterable);
    when(iterable.limit(anyInt())).thenReturn(iterable);
    when(iterable.into(any(Collection.class)))
        .thenAnswer(
            invocation -> {
              Collection<Document> target = invocation.getArgument(0);
              target.addAll(documents);
              return target;
            });
    return iterable;
  }

  @SuppressWarnings("unchecked")
  private void stubDistinct(String... ruleSetIds) {
    DistinctIterable<String> iterable = mock(DistinctIterable.class);
    when(collection.distinct("ruleSetId", String.class)).thenReturn(iterable);
    when(iterable.into(any(Collection.class)))
        .thenAnswer(
            invocation -> {
              Collection<String> target = invocation.getArgument(0);
              target.addAll(Arrays.asList(ruleSetIds));
              return target;
            });
  }

  @Test
  @DisplayName("should page with skip and limit")
  void shouldPageWithSkipAndLimit() {
    // given
    FindIterable<Document> iterable = stubFind(List.of(ruleDocument("rule-1", true, 2L)));

    // when
    List<RateLimitRule> rules = repository.findPage(null, 40, 20);

    // then
    assertThat(rules).hasSize(1);
    assertThat(rules.get(0).getId()).isEqualTo("rule-1");
    assertThat(RuleVersions.versionOf(rules.get(0))).isEqualTo(2L);
    verify(iterable).skip(40);
    verify(iterable).limit(20);
  }

  @Test
  @DisplayName("should filter the page by rule set")
  void shouldFilterPageByRuleSet() {
    // given
    stubFind(List.of());

    // when
    repository.findPage("set-1", 0, 10);

    // then
    ArgumentCaptor<Bson> filter = ArgumentCaptor.forClass(Bson.class);
    verify(collection).find(filter.capture());
    assertThat(filter.getValue().toString()).contains("set-1");
  }

  @Test
  @DisplayName("should count with countDocuments")
  void shouldCountWithCountDocuments() {
    // given
    when(collection.countDocuments(any(Bson.class))).thenReturn(7L);

    // when/then
    assertThat(repository.count(null)).isEqualTo(7L);
    assertThat(repository.count("  ")).isEqualTo(7L);
    assertThat(repository.count("set-1")).isEqualTo(7L);
  }

  @Test
  @DisplayName("should compute statistics without loading the rules")
  void shouldComputeStatistics() {
    // given
    when(collection.countDocuments(any(Bson.class))).thenReturn(10L, 6L);
    stubDistinct("set-a", "set-b", null, "", "set-a");

    // when
    RuleStatistics statistics = repository.statistics();

    // then
    assertThat(statistics.totalRules()).isEqualTo(10L);
    assertThat(statistics.activeRules()).isEqualTo(6L);
    assertThat(statistics.disabledRules()).isEqualTo(4L);
    assertThat(statistics.totalRuleSets()).isEqualTo(2L);
  }

  @Test
  @DisplayName("should replace the rule when the stored version matches")
  void shouldReplaceWhenVersionMatches() {
    // given
    stubFind(List.of(ruleDocument("rule-1", true, 2L)));
    UpdateResult result = mock(UpdateResult.class);
    when(result.getMatchedCount()).thenReturn(1L);
    when(collection.replaceOne(any(Bson.class), any(Document.class))).thenReturn(result);

    // when
    boolean replaced = repository.replaceIfVersionMatches(rule("rule-1", 3L), 2L);

    // then
    assertThat(replaced).isTrue();
    ArgumentCaptor<Bson> filter = ArgumentCaptor.forClass(Bson.class);
    verify(collection).replaceOne(filter.capture(), any(Document.class));
    assertThat(filter.getValue().toString()).contains("$expr").contains("$literal");
  }

  @Test
  @DisplayName("should report a mismatch when nothing was replaced")
  void shouldReportMismatch() {
    // given
    stubFind(List.of(ruleDocument("rule-1", true, 2L)));
    UpdateResult result = mock(UpdateResult.class);
    when(result.getMatchedCount()).thenReturn(0L);
    when(collection.replaceOne(any(Bson.class), any(Document.class))).thenReturn(result);

    // when/then
    assertThat(repository.replaceIfVersionMatches(rule("rule-1", 3L), 2L)).isFalse();
  }

  @Test
  @DisplayName("should adopt rules written before versioning was introduced")
  void shouldAdoptUnversionedRules() {
    // given
    stubFind(List.of(ruleDocument("rule-1", true, null)));
    UpdateResult hit = mock(UpdateResult.class);
    when(hit.getMatchedCount()).thenReturn(1L);
    when(collection.replaceOne(any(Bson.class), any(Document.class))).thenReturn(hit);

    // when
    boolean replaced =
        repository.replaceIfVersionMatches(rule("rule-1", 1L), RuleVersions.INITIAL_VERSION);

    // then
    assertThat(replaced).isTrue();
  }
}
