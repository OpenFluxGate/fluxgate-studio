package org.fluxgate.studio.admin.monitoring;

import java.util.List;

/** Deliberately excludes identity, credentials, endpoint, headers and arbitrary attributes. */
public record DecisionEventPage(List<Item> items, String nextCursor) {
  public record Item(
      String id,
      long occurredAt,
      String ruleSetId,
      String ruleId,
      boolean allowed,
      Long remainingTokens,
      Long retryAfterMillis) {}
}
