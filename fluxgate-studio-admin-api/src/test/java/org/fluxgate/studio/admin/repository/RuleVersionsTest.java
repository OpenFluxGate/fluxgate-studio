package org.fluxgate.studio.admin.repository;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import org.fluxgate.core.config.LimitScope;
import org.fluxgate.core.config.OnLimitExceedPolicy;
import org.fluxgate.core.config.RateLimitBand;
import org.fluxgate.core.config.RateLimitRule;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class RuleVersionsTest {

  private RateLimitRule ruleWithAttributes(Map<String, Object> attributes) {
    return RateLimitRule.builder("rule-1")
        .name("Rule")
        .enabled(true)
        .scope(LimitScope.GLOBAL)
        .keyStrategyId("ip")
        .onLimitExceedPolicy(OnLimitExceedPolicy.REJECT_REQUEST)
        .attributes(attributes)
        .addBand(RateLimitBand.builder(Duration.ofSeconds(60), 10).build())
        .build();
  }

  @Test
  @DisplayName("should read an integer version")
  void shouldReadIntegerVersion() {
    assertThat(RuleVersions.versionOf(ruleWithAttributes(Map.of("version", 3)))).isEqualTo(3L);
  }

  @Test
  @DisplayName("should read a long version")
  void shouldReadLongVersion() {
    assertThat(RuleVersions.versionOf(ruleWithAttributes(Map.of("version", 12L)))).isEqualTo(12L);
  }

  @Test
  @DisplayName("should fall back to the initial version when the attribute is missing")
  void shouldFallBackWhenMissing() {
    assertThat(RuleVersions.versionOf(ruleWithAttributes(Map.of())))
        .isEqualTo(RuleVersions.INITIAL_VERSION);
  }

  @Test
  @DisplayName("should fall back to the initial version for a non numeric attribute")
  void shouldFallBackForNonNumericAttribute() {
    assertThat(RuleVersions.versionOf(ruleWithAttributes(Map.of("version", "seven"))))
        .isEqualTo(RuleVersions.INITIAL_VERSION);
  }

  @Test
  @DisplayName("should fall back to the initial version for a null attribute map")
  void shouldFallBackForNullMap() {
    assertThat(RuleVersions.versionOf((Map<String, Object>) null))
        .isEqualTo(RuleVersions.INITIAL_VERSION);
  }

  @Test
  @DisplayName("should read the version from a mutable map")
  void shouldReadFromMutableMap() {
    Map<String, Object> attributes = new HashMap<>();
    attributes.put(RuleVersions.VERSION_ATTRIBUTE, 5);

    assertThat(RuleVersions.versionOf(attributes)).isEqualTo(5L);
  }
}
