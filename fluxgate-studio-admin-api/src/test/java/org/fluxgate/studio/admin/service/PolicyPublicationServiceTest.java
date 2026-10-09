package org.fluxgate.studio.admin.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.mongodb.MongoException;
import java.util.*;
import org.bson.Document;
import org.fluxgate.adapter.mongo.policy.MongoPolicyRepository;
import org.fluxgate.control.notify.RuleChangeNotifier;
import org.fluxgate.studio.admin.dto.request.PublishPolicyRequest;
import org.fluxgate.studio.admin.dto.request.RollbackPolicyRequest;
import org.fluxgate.studio.admin.exception.PolicyApiException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;

class PolicyPublicationServiceTest {
  final MongoPolicyRepository repository = mock(MongoPolicyRepository.class);
  final ObjectProvider<MongoPolicyRepository> repositories = provider(repository);
  final RuleChangeNotifier notifier = mock(RuleChangeNotifier.class);
  final PolicyPublicationService service =
      new PolicyPublicationService(repositories, provider(notifier));
  final String op = "b3604c15-05e6-429e-a65a-ed03d3a6e482";

  static <T> ObjectProvider<T> provider(T value) {
    ObjectProvider<T> provider = mock(ObjectProvider.class);
    when(provider.getIfAvailable()).thenReturn(value);
    return provider;
  }

  @Test
  void forwardsWholePayloadWithoutConsultingDrafts() {
    Map<String, Object> rule =
        Map.of(
            "id",
            "r",
            "ruleSetId",
            "set",
            "bands",
            List.of(Map.of("label", "stable", "capacity", 50L)),
            "attributes",
            Map.of("custom", true));
    Map<String, Object> acl = Map.of("deniedIps", List.of("10.0.0.0/8"));
    Document stored = new Document("revision", 1L);
    when(repository.publish(
            anyString(),
            anyLong(),
            anyList(),
            any(),
            anyBoolean(),
            any(),
            anyString(),
            anyString()))
        .thenReturn(stored);
    assertSame(
        stored,
        service.publish(
            "set", new PublishPolicyRequest(0L, op, List.of(rule), acl, false, null), "alice"));
    Document expectedRule =
        new Document("id", "r")
            .append("ruleSetId", "set")
            .append("bands", List.of(new Document("label", "stable").append("capacity", 50L)))
            .append("attributes", new Document("custom", true));
    verify(repository)
        .publish(
            eq("set"),
            eq(0L),
            eq(List.of(expectedRule)),
            eq(new Document("deniedIps", List.of("10.0.0.0/8"))),
            eq(false),
            isNull(),
            eq(op),
            eq("alice"));
    verify(notifier).notifyChange("set");
    verifyNoMoreInteractions(repository);
  }

  @Test
  void notificationFailureCannotUndoDurablePublicationOrReplay() {
    Document stored = new Document("revision", 7L);
    when(repository.publish(
            anyString(),
            anyLong(),
            anyList(),
            any(),
            anyBoolean(),
            any(),
            anyString(),
            anyString()))
        .thenReturn(stored);
    doThrow(new IllegalStateException("private redis uri")).when(notifier).notifyChange("set");
    PublishPolicyRequest request =
        new PublishPolicyRequest(6L, op, List.of(), Map.of(), false, null);
    assertSame(stored, service.publish("set", request, "alice"));
    assertSame(stored, service.publish("set", request, "alice"));
    verify(repository, times(2))
        .publish("set", 6L, List.of(), new Document(), false, null, op, "alice");
  }

  @Test
  void rollbackForwardsRevisionResetAndVerifiedActor() {
    Document stored = new Document("revision", 8L);
    when(repository.rollback("set", 7L, 3L, true, "reviewed rollback", op, "alice"))
        .thenReturn(stored);
    assertSame(
        stored,
        service.rollback(
            "set", new RollbackPolicyRequest(7L, op, 3L, true, "reviewed rollback"), "alice"));
    verify(notifier).notifyChange("set");
  }

  @Test
  void mapsOnlyActualConflictsTo409AndSanitizesErrors() {
    doThrow(new IllegalStateException("Active policy revision conflict"))
        .when(repository)
        .findActive("set");
    assertEquals(
        409, assertThrows(PolicyApiException.class, () -> service.active("set")).status().value());
    doThrow(new IllegalStateException("private integrity detail"))
        .when(repository)
        .findActive("set");
    PolicyApiException ex = assertThrows(PolicyApiException.class, () -> service.active("set"));
    assertEquals(503, ex.status().value());
    assertFalse(ex.getMessage().contains("private"));
    doThrow(new MongoException("private connection")).when(repository).findActive("set");
    assertEquals(
        503, assertThrows(PolicyApiException.class, () -> service.active("set")).status().value());
  }

  @Test
  void unavailableStoreAndMissingActiveAreExplicit() {
    assertEquals(
        503,
        assertThrows(
                PolicyApiException.class,
                () -> new PolicyPublicationService(provider(null), provider(null)).active("set"))
            .status()
            .value());
    when(repository.findActive("set")).thenReturn(Optional.empty());
    assertEquals(
        404, assertThrows(PolicyApiException.class, () -> service.active("set")).status().value());
  }

  @Test
  void invalidPayloadAndMissingRollbackRevisionDoNotNotify() {
    when(repository.rollback(
            anyString(), anyLong(), anyLong(), anyBoolean(), any(), anyString(), anyString()))
        .thenThrow(new IllegalArgumentException("Target revision is not published history"));
    assertEquals(
        404,
        assertThrows(
                PolicyApiException.class,
                () ->
                    service.rollback(
                        "set", new RollbackPolicyRequest(1L, op, 9L, false, null), "alice"))
            .status()
            .value());
    when(repository.history("set", 0))
        .thenThrow(new IllegalArgumentException("history limit must be 1..100"));
    assertEquals(
        400,
        assertThrows(PolicyApiException.class, () -> service.history("set", 0)).status().value());
    verifyNoInteractions(notifier);
  }
}
