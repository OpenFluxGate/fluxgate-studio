package org.fluxgate.studio.admin.audit;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.fluxgate.studio.admin.dto.response.RateBandResponse;
import org.fluxgate.studio.admin.dto.response.RuleResponse;

/** Turns rules into audit friendly maps and keeps only the fields an edit changed. */
public final class RuleDiff {

  public record Change(Map<String, Object> before, Map<String, Object> after) {}

  private RuleDiff() {}

  public static Map<String, Object> target(RuleResponse rule) {
    if (rule == null) {
      return null;
    }
    Map<String, Object> target = new LinkedHashMap<>();
    target.put("ruleSetId", rule.ruleSetId());
    target.put("ruleId", rule.id());
    return target;
  }

  public static Map<String, Object> ruleSet(String ruleSetId) {
    Map<String, Object> target = new LinkedHashMap<>();
    target.put("ruleSetId", ruleSetId);
    return target;
  }

  public static Map<String, Object> snapshot(RuleResponse rule) {
    Map<String, Object> snapshot = new LinkedHashMap<>();
    if (rule == null) {
      return snapshot;
    }
    snapshot.put("name", rule.name());
    snapshot.put("enabled", rule.enabled());
    snapshot.put("scope", rule.scope());
    snapshot.put("keyStrategyId", rule.keyStrategyId());
    snapshot.put("onLimitExceedPolicy", rule.onLimitExceedPolicy());
    snapshot.put(
        "bands",
        rule.bands() == null ? List.of() : rule.bands().stream().map(RuleDiff::band).toList());
    snapshot.put("ruleSetId", rule.ruleSetId());
    snapshot.put("tags", rule.tags());
    snapshot.put("attributes", rule.attributes());
    return snapshot;
  }

  public static Change diff(RuleResponse before, RuleResponse after) {
    Map<String, Object> previous = snapshot(before);
    Map<String, Object> next = snapshot(after);
    Set<String> fields = new LinkedHashSet<>(previous.keySet());
    fields.addAll(next.keySet());
    Map<String, Object> changedBefore = new LinkedHashMap<>();
    Map<String, Object> changedAfter = new LinkedHashMap<>();
    for (String field : fields) {
      if (!Objects.equals(previous.get(field), next.get(field))) {
        changedBefore.put(field, previous.get(field));
        changedAfter.put(field, next.get(field));
      }
    }
    return new Change(changedBefore, changedAfter);
  }

  private static Map<String, Object> band(RateBandResponse band) {
    Map<String, Object> map = new LinkedHashMap<>();
    map.put("windowSeconds", band.windowSeconds());
    map.put("capacity", band.capacity());
    if (band.label() != null) {
      map.put("label", band.label());
    }
    return map;
  }
}
