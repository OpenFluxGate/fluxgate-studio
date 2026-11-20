package org.fluxgate.studio.admin.monitoring;

import java.time.Clock;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import org.fluxgate.studio.admin.audit.AuditService;
import org.fluxgate.studio.admin.exception.InvalidRuleException;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;

/** Answers whether one key is blocked, based on the last recorded decision per rule set. */
@Service
public class KeyLookupService {

  static final int RECENT_LIMIT = 100;

  private final MongoEventStore store;
  private final AuditService auditService;
  private final MonitoringProperties properties;
  private final Clock clock;

  public KeyLookupService(
      MongoEventStore store,
      AuditService auditService,
      MonitoringProperties properties,
      Clock clock) {
    this.store = store;
    this.auditService = auditService;
    this.properties = properties;
    this.clock = clock;
  }

  public List<String> transforms() {
    return properties.keyTransforms();
  }

  public KeyLookupResponse lookup(KeyLookupRequest request, Authentication authentication) {
    MonitoringWindow window = MonitoringWindow.parse(request.window(), MonitoringWindow.KEY_LOOKUP);
    KeyTransform transform = KeyTransform.parse(request.transform(), properties.keyTransforms());
    String value = request.value() == null ? "" : request.value().trim();
    if (value.isEmpty()) {
      throw new InvalidRuleException("value", "must not be blank");
    }

    auditService.recordKeyLookup(authentication, value, transform.code(), window.code());

    String key = transform.apply(value);
    long to = clock.millis();
    long from = to - window.lengthMillis();
    long bucket = window.bucketMillis();

    Map<String, KeyDecision> last = store.lastDecisionByRuleSet(key, from, to);
    List<KeyRuleSetStatus> statuses = new ArrayList<>();
    for (RuleSetActivity activity : store.activityByRuleSet(from, to, key)) {
      KeyDecision decision = last.get(activity.ruleSetId());
      if (decision != null) {
        statuses.add(status(activity, decision, to));
      }
    }
    statuses.sort(Comparator.comparingLong(KeyRuleSetStatus::lastDecisionAt).reversed());

    return new KeyLookupResponse(
        key,
        transform.code(),
        window.code(),
        from,
        to,
        bucket,
        statuses,
        MonitoringService.fill(store.buckets(from, to, bucket, null, key), from, to, bucket),
        store.recentDecisions(key, from, to, RECENT_LIMIT));
  }

  static KeyRuleSetStatus status(RuleSetActivity activity, KeyDecision last, long now) {
    Long blockedUntil = last.allowed() ? null : last.timestamp() + last.retryAfterMs();
    KeyStatus status;
    if (last.allowed()) {
      status = KeyStatus.ALLOWED;
    } else if (now < blockedUntil) {
      status = KeyStatus.BLOCKED;
    } else {
      status = KeyStatus.RECOVERED;
    }
    return new KeyRuleSetStatus(
        activity.ruleSetId(),
        status,
        last.timestamp(),
        last.allowed(),
        last.remainingTokens(),
        blockedUntil,
        activity.total() - activity.rejected(),
        activity.rejected());
  }
}
