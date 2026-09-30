package org.fluxgate.studio.admin.repository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.fluxgate.core.config.LimitScope;
import org.fluxgate.core.config.OnLimitExceedPolicy;
import org.fluxgate.core.config.RateLimitBand;
import org.fluxgate.core.config.RateLimitRule;
import org.fluxgate.core.spi.RateLimitRuleRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class DelegatingStudioRuleRepositoryTest {

  @Mock private RateLimitRuleRepository ruleRepository;

  private DelegatingStudioRuleRepository repository;

  @BeforeEach
  void setUp() {
    repository = new DelegatingStudioRuleRepository(ruleRepository);
  }

  private RateLimitRule rule(String id, boolean enabled, String ruleSetId, Long version) {
    RateLimitRule.Builder builder =
        RateLimitRule.builder(id)
            .name("Rule " + id)
            .enabled(enabled)
            .scope(LimitScope.PER_IP)
            .keyStrategyId("ip")
            .onLimitExceedPolicy(OnLimitExceedPolicy.REJECT_REQUEST)
            .ruleSetId(ruleSetId)
            .addBand(RateLimitBand.builder(Duration.ofSeconds(60), 100).build());
    if (version != null) {
      builder.attributes(Map.of(RuleVersions.VERSION_ATTRIBUTE, version));
    }
    return builder.build();
  }

  @Test
  @DisplayName("should page in memory ordered by rule id")
  void shouldPageInMemory() {
    // given
    when(ruleRepository.findAll())
        .thenReturn(
            List.of(
                rule("rule-3", true, "set-a", 1L),
                rule("rule-1", true, "set-a", 1L),
                rule("rule-2", true, "set-a", 1L)));

    // when
    List<RateLimitRule> page = repository.findPage(null, 1, 1);

    // then
    assertThat(page).extracting(RateLimitRule::getId).containsExactly("rule-2");
  }

  @Test
  @DisplayName("should page within a rule set")
  void shouldPageWithinRuleSet() {
    // given
    when(ruleRepository.findByRuleSetId("set-a"))
        .thenReturn(List.of(rule("rule-1", true, "set-a", 1L)));

    // when
    List<RateLimitRule> page = repository.findPage("set-a", 0, 10);

    // then
    assertThat(page).hasSize(1);
    verify(ruleRepository, never()).findAll();
  }

  @Test
  @DisplayName("should count all rules or the rules of a rule set")
  void shouldCount() {
    // given
    when(ruleRepository.findAll()).thenReturn(List.of(rule("rule-1", true, "set-a", 1L)));
    when(ruleRepository.findByRuleSetId("set-b")).thenReturn(List.of());

    // when/then
    assertThat(repository.count(null)).isEqualTo(1L);
    assertThat(repository.count("set-b")).isZero();
  }

  @Test
  @DisplayName("should compute statistics in memory")
  void shouldComputeStatistics() {
    // given
    when(ruleRepository.findAll())
        .thenReturn(
            List.of(
                rule("rule-1", true, "set-a", 1L),
                rule("rule-2", true, "set-a", 1L),
                rule("rule-3", false, "set-b", 1L),
                rule("rule-4", true, null, 1L),
                rule("rule-5", false, "", 1L)));

    // when
    RuleStatistics statistics = repository.statistics();

    // then
    assertThat(statistics.totalRules()).isEqualTo(5L);
    assertThat(statistics.activeRules()).isEqualTo(3L);
    assertThat(statistics.disabledRules()).isEqualTo(2L);
    assertThat(statistics.totalRuleSets()).isEqualTo(2L);
  }

  @Test
  @DisplayName("should replace when the stored version matches")
  void shouldReplaceWhenVersionMatches() {
    // given
    when(ruleRepository.findById("rule-1"))
        .thenReturn(Optional.of(rule("rule-1", true, "set-a", 2L)));

    // when
    boolean replaced = repository.replaceIfVersionMatches(rule("rule-1", true, "set-a", 3L), 2L);

    // then
    assertThat(replaced).isTrue();
    verify(ruleRepository).save(any(RateLimitRule.class));
  }

  @Test
  @DisplayName("should refuse to replace when the stored version differs")
  void shouldRefuseOnVersionMismatch() {
    // given
    when(ruleRepository.findById("rule-1"))
        .thenReturn(Optional.of(rule("rule-1", true, "set-a", 5L)));

    // when/then
    assertThat(repository.replaceIfVersionMatches(rule("rule-1", true, "set-a", 3L), 2L)).isFalse();
    verify(ruleRepository, never()).save(any());
  }

  @Test
  @DisplayName("should refuse to replace a rule that no longer exists")
  void shouldRefuseWhenRuleIsGone() {
    // given
    when(ruleRepository.findById("rule-1")).thenReturn(Optional.empty());

    // when/then
    assertThat(repository.replaceIfVersionMatches(rule("rule-1", true, "set-a", 3L), 2L)).isFalse();
    verify(ruleRepository, never()).save(any());
  }
}
