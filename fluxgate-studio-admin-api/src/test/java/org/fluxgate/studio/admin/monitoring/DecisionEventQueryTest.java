package org.fluxgate.studio.admin.monitoring;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.bson.types.ObjectId;
import org.fluxgate.studio.admin.exception.InvalidRuleException;
import org.junit.jupiter.api.Test;

class DecisionEventQueryTest {
  @Test
  void validatesRangeSizeAndOutcome() {
    assertThatThrownBy(() -> new DecisionEventQuery(-1, 10, null, 50, null))
        .isInstanceOf(InvalidRuleException.class);
    assertThatThrownBy(() -> new DecisionEventQuery(10, 10, null, 50, null))
        .isInstanceOf(InvalidRuleException.class);
    assertThatThrownBy(() -> new DecisionEventQuery(0, Long.MAX_VALUE, null, 50, null))
        .isInstanceOf(InvalidRuleException.class);
    assertThatThrownBy(() -> new DecisionEventQuery(0, 86_400_001, null, 50, null))
        .isInstanceOf(InvalidRuleException.class);
    assertThatThrownBy(() -> new DecisionEventQuery(0, 10, null, 101, null))
        .isInstanceOf(InvalidRuleException.class);
    assertThatThrownBy(() -> new DecisionEventQuery(0, 10, null, 0, null))
        .isInstanceOf(InvalidRuleException.class);
    assertThatThrownBy(() -> new DecisionEventQuery(0, 10, "$ne", 50, null))
        .isInstanceOf(InvalidRuleException.class);
    assertThat(new DecisionEventQuery(0, 86_400_000, "REJECT", 100, null).position()).isNull();
  }

  @Test
  void cursorRoundTripsAndBindsToFilters() {
    DecisionEventQuery original = new DecisionEventQuery(1, 1000, "ALLOW", 50, null);
    ObjectId id = new ObjectId();
    String cursor = original.after(200, id);
    assertThat(new DecisionEventQuery(1, 1000, "ALLOW", 50, cursor).position())
        .isEqualTo(new DecisionEventQuery.Position(200, id));
    assertThatThrownBy(() -> new DecisionEventQuery(1, 1000, "REJECT", 50, cursor).position())
        .isInstanceOf(InvalidRuleException.class);
    assertThatThrownBy(() -> new DecisionEventQuery(2, 1000, "ALLOW", 50, cursor).position())
        .isInstanceOf(InvalidRuleException.class);
    for (String bad : new String[] {"", "%%%%", "a".repeat(257), original.after(1000, id)}) {
      assertThatThrownBy(() -> new DecisionEventQuery(1, 1000, "ALLOW", 50, bad).position())
          .isInstanceOf(InvalidRuleException.class);
    }
  }
}
