package org.fluxgate.studio.admin.service;

import com.mongodb.MongoException;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Supplier;
import org.bson.Document;
import org.fluxgate.adapter.mongo.policy.MongoPolicyRepository;
import org.fluxgate.control.notify.RuleChangeNotifier;
import org.fluxgate.studio.admin.dto.request.PublishPolicyRequest;
import org.fluxgate.studio.admin.dto.request.RollbackPolicyRequest;
import org.fluxgate.studio.admin.exception.PolicyApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/** Coordinates the shared authoritative snapshot store; draft collections are never read. */
@Service
public class PolicyPublicationService {
  private static final Logger log = LoggerFactory.getLogger(PolicyPublicationService.class);
  private final ObjectProvider<MongoPolicyRepository> repositories;
  private final ObjectProvider<RuleChangeNotifier> notifiers;

  public PolicyPublicationService(
      ObjectProvider<MongoPolicyRepository> repositories,
      ObjectProvider<RuleChangeNotifier> notifiers) {
    this.repositories = repositories;
    this.notifiers = notifiers;
  }

  public Document active(String id) {
    return store(
        () ->
            repository()
                .findActive(id)
                .orElseThrow(
                    () ->
                        new PolicyApiException(
                            HttpStatus.NOT_FOUND, "Published policy not found")));
  }

  public List<Document> history(String id, int limit) {
    return store(() -> repository().history(id, limit));
  }

  public Document publish(String id, PublishPolicyRequest request, String actor) {
    Document snapshot =
        store(
            () ->
                repository()
                    .publish(
                        id,
                        request.expectedRevision(),
                        request.rules().stream().map(PolicyPublicationService::document).toList(),
                        document(request.accessControl()),
                        request.resetCounters(),
                        request.resetReason(),
                        request.operationId(),
                        actor));
    hint(id);
    return snapshot;
  }

  public Document rollback(String id, RollbackPolicyRequest request, String actor) {
    Document snapshot =
        store(
            () ->
                repository()
                    .rollback(
                        id,
                        request.expectedRevision(),
                        request.targetRevision(),
                        request.resetCounters(),
                        request.resetReason(),
                        request.operationId(),
                        actor));
    hint(id);
    return snapshot;
  }

  private MongoPolicyRepository repository() {
    MongoPolicyRepository value = repositories.getIfAvailable();
    if (value == null)
      throw new PolicyApiException(HttpStatus.SERVICE_UNAVAILABLE, "Policy storage unavailable");
    return value;
  }

  private <T> T store(Supplier<T> operation) {
    try {
      return operation.get();
    } catch (IllegalArgumentException ex) {
      if ("Target revision is not published history".equals(ex.getMessage()))
        throw new PolicyApiException(HttpStatus.NOT_FOUND, "Published revision not found");
      throw new PolicyApiException(HttpStatus.BAD_REQUEST, "Invalid policy publication request");
    } catch (IllegalStateException ex) {
      if (Set.of("Active policy revision conflict", "Operation id payload conflict")
          .contains(ex.getMessage() == null ? "" : ex.getMessage()))
        throw new PolicyApiException(HttpStatus.CONFLICT, "Policy revision or operation conflict");
      throw new PolicyApiException(HttpStatus.SERVICE_UNAVAILABLE, "Policy storage unavailable");
    } catch (MongoException ex) {
      throw new PolicyApiException(HttpStatus.SERVICE_UNAVAILABLE, "Policy storage unavailable");
    } catch (PolicyApiException ex) {
      throw ex;
    } catch (RuntimeException ex) {
      throw new PolicyApiException(HttpStatus.SERVICE_UNAVAILABLE, "Policy storage unavailable");
    }
  }

  /** The notification is a hint after commit. Readers recover by checking the durable pointer. */
  private void hint(String id) {
    try {
      RuleChangeNotifier notifier = notifiers.getIfAvailable();
      if (notifier != null) notifier.notifyChange(id);
    } catch (RuntimeException ex) {
      log.warn(
          "Policy committed; reload hint unavailable. Readers recover from the active pointer.");
    }
  }

  private static Document document(Map<String, Object> input) {
    Document result = new Document();
    input.forEach((key, value) -> result.put(key, bsonValue(value)));
    return result;
  }

  private static Object bsonValue(Object value) {
    if (value instanceof Map<?, ?> map) {
      Document result = new Document();
      map.forEach((key, nested) -> result.put((String) key, bsonValue(nested)));
      return result;
    }
    if (value instanceof List<?> list)
      return list.stream().map(PolicyPublicationService::bsonValue).toList();
    return value;
  }
}
