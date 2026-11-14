package org.fluxgate.studio.admin.audit;

import java.time.Clock;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import org.fluxgate.studio.admin.dto.response.PageResponse;
import org.fluxgate.studio.admin.exception.StorageConnectionException;
import org.fluxgate.studio.admin.monitoring.KeyMasker;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;

/** Applies the audit policy. A change is kept even when its record fails, a lookup is not. */
@Service
public class AuditService {

  public static final String HEADER = "X-Studio-Audit";
  public static final String FAILED = "failed";

  private static final Logger log = LoggerFactory.getLogger(AuditService.class);

  private final MongoAuditStore store;
  private final Clock clock;

  public AuditService(MongoAuditStore store, Clock clock) {
    this.store = store;
    this.clock = clock;
  }

  public boolean recordChange(
      Authentication authentication,
      AuditAction action,
      Map<String, Object> target,
      Map<String, Object> before,
      Map<String, Object> after,
      Map<String, Object> detail) {
    try {
      store.insert(
          new AuditEntry(
              null,
              clock.instant(),
              AuditActor.from(authentication),
              action,
              target,
              before,
              after,
              detail));
      return true;
    } catch (RuntimeException e) {
      log.error("Audit record for {} on {} was not stored", action, target, e);
      return false;
    }
  }

  public void recordKeyLookup(
      Authentication authentication, String value, String transform, String window) {
    Map<String, Object> detail = new LinkedHashMap<>();
    detail.put("value", value);
    detail.put("transform", transform);
    detail.put("window", window);
    try {
      store.insert(
          new AuditEntry(
              null,
              clock.instant(),
              AuditActor.from(authentication),
              AuditAction.KEY_LOOKUP,
              null,
              null,
              null,
              detail));
    } catch (RuntimeException e) {
      throw new StorageConnectionException("Audit log", "key lookup was not recorded", e);
    }
  }

  public PageResponse<AuditEntry> search(AuditQuery query) {
    PageResponse<AuditEntry> page = store.search(query);
    return new PageResponse<>(
        page.content().stream().map(AuditService::masked).toList(),
        page.page(),
        page.size(),
        page.totalElements());
  }

  public Optional<AuditEntry> find(String id) {
    return store.findById(id);
  }

  static AuditEntry masked(AuditEntry entry) {
    if (entry.action() != AuditAction.KEY_LOOKUP
        || entry.detail() == null
        || !(entry.detail().get("value") instanceof String value)
        || value.equals(KeyMasker.mask(value))) {
      return entry;
    }
    Map<String, Object> detail = new LinkedHashMap<>(entry.detail());
    detail.put("value", KeyMasker.mask(value));
    return new AuditEntry(
        entry.id(),
        entry.at(),
        entry.actor(),
        entry.action(),
        entry.target(),
        entry.before(),
        entry.after(),
        detail);
  }

  public static <B extends ResponseEntity.HeadersBuilder<B>> B flag(B builder, boolean audited) {
    return audited ? builder : builder.header(HEADER, FAILED);
  }
}
