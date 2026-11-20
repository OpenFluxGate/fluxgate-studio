package org.fluxgate.studio.admin.audit;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import org.fluxgate.studio.admin.dto.response.RateBandResponse;
import org.fluxgate.studio.admin.dto.response.RuleResponse;
import org.junit.jupiter.api.Test;

class RuleDiffTest {

  private static RuleResponse rule(boolean enabled, long capacity) {
    return new RuleResponse(
        "r1",
        "Rule",
        enabled,
        "PER_USER",
        "userId",
        "REJECT_REQUEST",
        List.of(new RateBandResponse(60, capacity, null)),
        "set",
        List.of("t"),
        Map.of(),
        3L);
  }

  @Test
  void keepsOnlyTheFieldsThatChanged() {
    RuleDiff.Change change = RuleDiff.diff(rule(true, 30), rule(false, 20));

    assertThat(change.before()).containsOnlyKeys("enabled", "bands");
    assertThat(change.before().get("enabled")).isEqualTo(true);
    assertThat(change.after().get("enabled")).isEqualTo(false);
    assertThat(change.after().get("bands"))
        .isEqualTo(List.of(Map.of("windowSeconds", 60L, "capacity", 20L)));
  }

  @Test
  void treatsAMissingRuleAsEmpty() {
    RuleDiff.Change change = RuleDiff.diff(null, rule(true, 30));

    assertThat(change.after()).containsKeys("name", "bands", "ruleSetId");
    assertThat(change.before()).containsEntry("name", null);
  }

  @Test
  void describesTheTarget() {
    assertThat(RuleDiff.target(rule(true, 1)))
        .containsEntry("ruleSetId", "set")
        .containsEntry("ruleId", "r1");
    assertThat(RuleDiff.ruleSet("set")).containsOnlyKeys("ruleSetId");
    assertThat(RuleDiff.snapshot(null)).isEmpty();
  }
}
