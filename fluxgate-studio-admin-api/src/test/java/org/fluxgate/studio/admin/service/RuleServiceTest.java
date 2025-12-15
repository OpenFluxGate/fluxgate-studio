package org.fluxgate.studio.admin.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.util.List;
import java.util.Optional;
import org.fluxgate.core.config.LimitScope;
import org.fluxgate.core.config.OnLimitExceedPolicy;
import org.fluxgate.core.config.RateLimitBand;
import org.fluxgate.core.config.RateLimitRule;
import org.fluxgate.core.spi.RateLimitRuleRepository;
import org.fluxgate.studio.admin.dto.request.CreateRuleRequest;
import org.fluxgate.studio.admin.dto.request.RateBandRequest;
import org.fluxgate.studio.admin.dto.request.UpdateRuleRequest;
import org.fluxgate.studio.admin.dto.response.RuleResponse;
import org.fluxgate.studio.admin.exception.RuleAlreadyExistsException;
import org.fluxgate.studio.admin.exception.RuleNotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class RuleServiceTest {

  @Mock private RateLimitRuleRepository ruleRepository;

  private RuleService ruleService;

  @BeforeEach
  void setUp() {
    ruleService = new RuleService(ruleRepository);
  }

  private RateLimitRule createTestRule(String id, String name, boolean enabled) {
    RateLimitRule.Builder builder =
        RateLimitRule.builder(id)
            .name(name)
            .enabled(enabled)
            .scope(LimitScope.PER_IP)
            .keyStrategyId("ip")
            .onLimitExceedPolicy(OnLimitExceedPolicy.REJECT_REQUEST)
            .ruleSetId("test-ruleset");
    builder.addBand(
        RateLimitBand.builder(Duration.ofSeconds(60), 100).label("100-per-minute").build());
    return builder.build();
  }

  @Nested
  @DisplayName("getAllRules")
  class GetAllRulesTests {

    @Test
    @DisplayName("should return all rules")
    void shouldReturnAllRules() {
      // given
      List<RateLimitRule> rules =
          List.of(
              createTestRule("rule-1", "Rule 1", true), createTestRule("rule-2", "Rule 2", false));
      when(ruleRepository.findAll()).thenReturn(rules);

      // when
      List<RuleResponse> result = ruleService.getAllRules();

      // then
      assertThat(result).hasSize(2);
      assertThat(result.get(0).id()).isEqualTo("rule-1");
      assertThat(result.get(1).id()).isEqualTo("rule-2");
      verify(ruleRepository).findAll();
    }

    @Test
    @DisplayName("should return empty list when no rules exist")
    void shouldReturnEmptyListWhenNoRulesExist() {
      // given
      when(ruleRepository.findAll()).thenReturn(List.of());

      // when
      List<RuleResponse> result = ruleService.getAllRules();

      // then
      assertThat(result).isEmpty();
    }
  }

  @Nested
  @DisplayName("getRuleById")
  class GetRuleByIdTests {

    @Test
    @DisplayName("should return rule when found")
    void shouldReturnRuleWhenFound() {
      // given
      RateLimitRule rule = createTestRule("test-rule", "Test Rule", true);
      when(ruleRepository.findById("test-rule")).thenReturn(Optional.of(rule));

      // when
      RuleResponse result = ruleService.getRuleById("test-rule");

      // then
      assertThat(result.id()).isEqualTo("test-rule");
      assertThat(result.name()).isEqualTo("Test Rule");
      assertThat(result.enabled()).isTrue();
    }

    @Test
    @DisplayName("should throw RuleNotFoundException when not found")
    void shouldThrowWhenNotFound() {
      // given
      when(ruleRepository.findById("non-existent")).thenReturn(Optional.empty());

      // when/then
      assertThatThrownBy(() -> ruleService.getRuleById("non-existent"))
          .isInstanceOf(RuleNotFoundException.class)
          .hasMessageContaining("non-existent");
    }
  }

  @Nested
  @DisplayName("createRule")
  class CreateRuleTests {

    @Test
    @DisplayName("should create rule successfully")
    void shouldCreateRuleSuccessfully() {
      // given
      CreateRuleRequest request =
          new CreateRuleRequest(
              "new-rule",
              "New Rule",
              true,
              "PER_IP",
              "ip",
              "REJECT_REQUEST",
              List.of(new RateBandRequest(60L, 100L, "100-per-minute")),
              "test-ruleset",
              List.of("api", "v1"),
              null);
      when(ruleRepository.existsById("new-rule")).thenReturn(false);

      // when
      RuleResponse result = ruleService.createRule(request);

      // then
      assertThat(result.id()).isEqualTo("new-rule");
      assertThat(result.name()).isEqualTo("New Rule");
      verify(ruleRepository).save(any(RateLimitRule.class));
    }

    @Test
    @DisplayName("should throw RuleAlreadyExistsException when rule exists")
    void shouldThrowWhenRuleExists() {
      // given
      CreateRuleRequest request =
          new CreateRuleRequest(
              "existing-rule",
              "Existing Rule",
              true,
              "PER_IP",
              "ip",
              "REJECT_REQUEST",
              List.of(new RateBandRequest(60L, 100L, "100-per-minute")),
              null,
              null,
              null);
      when(ruleRepository.existsById("existing-rule")).thenReturn(true);

      // when/then
      assertThatThrownBy(() -> ruleService.createRule(request))
          .isInstanceOf(RuleAlreadyExistsException.class)
          .hasMessageContaining("existing-rule");
      verify(ruleRepository, never()).save(any());
    }
  }

  @Nested
  @DisplayName("updateRule")
  class UpdateRuleTests {

    @Test
    @DisplayName("should update rule successfully")
    void shouldUpdateRuleSuccessfully() {
      // given
      UpdateRuleRequest request =
          new UpdateRuleRequest(
              "Updated Rule",
              false,
              "PER_USER",
              "userId",
              "REJECT_REQUEST",
              List.of(new RateBandRequest(120L, 50L, "50-per-2minutes")),
              "updated-ruleset",
              null,
              null);
      when(ruleRepository.existsById("test-rule")).thenReturn(true);

      // when
      RuleResponse result = ruleService.updateRule("test-rule", request);

      // then
      assertThat(result.id()).isEqualTo("test-rule");
      assertThat(result.name()).isEqualTo("Updated Rule");
      assertThat(result.enabled()).isFalse();
      verify(ruleRepository).save(any(RateLimitRule.class));
    }

    @Test
    @DisplayName("should throw RuleNotFoundException when rule does not exist")
    void shouldThrowWhenRuleDoesNotExist() {
      // given
      UpdateRuleRequest request =
          new UpdateRuleRequest(
              "Updated Rule",
              true,
              "PER_IP",
              "ip",
              "REJECT_REQUEST",
              List.of(new RateBandRequest(60L, 100L, "100-per-minute")),
              null,
              null,
              null);
      when(ruleRepository.existsById("non-existent")).thenReturn(false);

      // when/then
      assertThatThrownBy(() -> ruleService.updateRule("non-existent", request))
          .isInstanceOf(RuleNotFoundException.class);
      verify(ruleRepository, never()).save(any());
    }
  }

  @Nested
  @DisplayName("deleteRule")
  class DeleteRuleTests {

    @Test
    @DisplayName("should delete rule successfully")
    void shouldDeleteRuleSuccessfully() {
      // given
      when(ruleRepository.deleteById("test-rule")).thenReturn(true);

      // when
      ruleService.deleteRule("test-rule");

      // then
      verify(ruleRepository).deleteById("test-rule");
    }

    @Test
    @DisplayName("should throw RuleNotFoundException when rule does not exist")
    void shouldThrowWhenRuleDoesNotExist() {
      // given
      when(ruleRepository.deleteById("non-existent")).thenReturn(false);

      // when/then
      assertThatThrownBy(() -> ruleService.deleteRule("non-existent"))
          .isInstanceOf(RuleNotFoundException.class);
    }
  }

  @Nested
  @DisplayName("toggleRule")
  class ToggleRuleTests {

    @Test
    @DisplayName("should toggle rule from enabled to disabled")
    void shouldToggleFromEnabledToDisabled() {
      // given
      RateLimitRule rule = createTestRule("test-rule", "Test Rule", true);
      when(ruleRepository.findById("test-rule")).thenReturn(Optional.of(rule));

      // when
      RuleResponse result = ruleService.toggleRule("test-rule");

      // then
      assertThat(result.enabled()).isFalse();
      verify(ruleRepository).save(any(RateLimitRule.class));
    }

    @Test
    @DisplayName("should toggle rule from disabled to enabled")
    void shouldToggleFromDisabledToEnabled() {
      // given
      RateLimitRule rule = createTestRule("test-rule", "Test Rule", false);
      when(ruleRepository.findById("test-rule")).thenReturn(Optional.of(rule));

      // when
      RuleResponse result = ruleService.toggleRule("test-rule");

      // then
      assertThat(result.enabled()).isTrue();
    }
  }

  @Nested
  @DisplayName("getRulesByRuleSetId")
  class GetRulesByRuleSetIdTests {

    @Test
    @DisplayName("should return rules for rule set")
    void shouldReturnRulesForRuleSet() {
      // given
      List<RateLimitRule> rules =
          List.of(
              createTestRule("rule-1", "Rule 1", true), createTestRule("rule-2", "Rule 2", true));
      when(ruleRepository.findByRuleSetId("test-ruleset")).thenReturn(rules);

      // when
      List<RuleResponse> result = ruleService.getRulesByRuleSetId("test-ruleset");

      // then
      assertThat(result).hasSize(2);
    }
  }

  @Nested
  @DisplayName("deleteByRuleSetId")
  class DeleteByRuleSetIdTests {

    @Test
    @DisplayName("should delete all rules in rule set")
    void shouldDeleteAllRulesInRuleSet() {
      // given
      when(ruleRepository.deleteByRuleSetId("test-ruleset")).thenReturn(3);

      // when
      int count = ruleService.deleteByRuleSetId("test-ruleset");

      // then
      assertThat(count).isEqualTo(3);
      verify(ruleRepository).deleteByRuleSetId("test-ruleset");
    }
  }
}
