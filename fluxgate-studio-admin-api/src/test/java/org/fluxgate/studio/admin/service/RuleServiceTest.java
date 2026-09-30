package org.fluxgate.studio.admin.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
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
import org.fluxgate.studio.admin.dto.request.CreateRuleRequest;
import org.fluxgate.studio.admin.dto.request.RateBandRequest;
import org.fluxgate.studio.admin.dto.request.SimulateRequest;
import org.fluxgate.studio.admin.dto.request.UpdateRuleRequest;
import org.fluxgate.studio.admin.dto.response.ImportResultResponse;
import org.fluxgate.studio.admin.dto.response.PageResponse;
import org.fluxgate.studio.admin.dto.response.RuleResponse;
import org.fluxgate.studio.admin.dto.response.SimulationResponse;
import org.fluxgate.studio.admin.exception.InvalidRuleException;
import org.fluxgate.studio.admin.exception.RuleAlreadyExistsException;
import org.fluxgate.studio.admin.exception.RuleNotFoundException;
import org.fluxgate.studio.admin.exception.RuleVersionMismatchException;
import org.fluxgate.studio.admin.exception.StorageOperationException;
import org.fluxgate.studio.admin.repository.RuleVersions;
import org.fluxgate.studio.admin.repository.StudioRuleRepository;
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
  @Mock private StudioRuleRepository studioRuleRepository;

  private RuleService ruleService;

  @BeforeEach
  void setUp() {
    ruleService = new RuleService(ruleRepository, studioRuleRepository);
  }

  private RateLimitRule createTestRule(String id, String name, boolean enabled) {
    return createTestRule(id, name, enabled, 1L);
  }

  private RateLimitRule createTestRule(String id, String name, boolean enabled, Long version) {
    RateLimitRule.Builder builder =
        RateLimitRule.builder(id)
            .name(name)
            .enabled(enabled)
            .scope(LimitScope.PER_IP)
            .keyStrategyId("ip")
            .onLimitExceedPolicy(OnLimitExceedPolicy.REJECT_REQUEST)
            .ruleSetId("test-ruleset");
    if (version != null) {
      builder.attribute(RuleVersions.VERSION_ATTRIBUTE, version);
    }
    builder.addBand(
        RateLimitBand.builder(Duration.ofSeconds(60), 100).label("100-per-minute").build());
    return builder.build();
  }

  private CreateRuleRequest createRequest(String id, List<RateBandRequest> bands) {
    return new CreateRuleRequest(
        id,
        "Rule " + id,
        true,
        "PER_IP",
        "ip",
        "REJECT_REQUEST",
        bands,
        "test-ruleset",
        null,
        null);
  }

  private UpdateRuleRequest updateRequest(Long version) {
    return new UpdateRuleRequest(
        "Updated Rule",
        false,
        "PER_USER",
        "userId",
        "REJECT_REQUEST",
        List.of(new RateBandRequest(120L, 50L, "50-per-2minutes")),
        "updated-ruleset",
        null,
        null,
        version);
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

    @Test
    @DisplayName("should wrap storage failures")
    void shouldWrapStorageFailures() {
      // given
      when(ruleRepository.findAll()).thenThrow(new IllegalStateException("mongo down"));

      // when/then
      assertThatThrownBy(() -> ruleService.getAllRules())
          .isInstanceOf(StorageOperationException.class);
    }

    @Test
    @DisplayName("should expose the version and hide it from attributes")
    void shouldExposeVersionAndHideItFromAttributes() {
      // given
      when(ruleRepository.findAll())
          .thenReturn(List.of(createTestRule("rule-1", "Rule 1", true, 7L)));

      // when
      RuleResponse result = ruleService.getAllRules().get(0);

      // then
      assertThat(result.version()).isEqualTo(7L);
      assertThat(result.attributes()).doesNotContainKey(RuleVersions.VERSION_ATTRIBUTE);
    }
  }

  @Nested
  @DisplayName("getRulesPage")
  class GetRulesPageTests {

    @Test
    @DisplayName("should return the requested page")
    void shouldReturnRequestedPage() {
      // given
      when(studioRuleRepository.findPage(null, 20, 10))
          .thenReturn(List.of(createTestRule("rule-1", "Rule 1", true)));
      when(studioRuleRepository.count(null)).thenReturn(42L);

      // when
      PageResponse<RuleResponse> page = ruleService.getRulesPage(null, 2, 10);

      // then
      assertThat(page.content()).hasSize(1);
      assertThat(page.page()).isEqualTo(2);
      assertThat(page.size()).isEqualTo(10);
      assertThat(page.totalElements()).isEqualTo(42L);
    }

    @Test
    @DisplayName("should reject a negative page index")
    void shouldRejectNegativePage() {
      assertThatThrownBy(() -> ruleService.getRulesPage(null, -1, 10))
          .isInstanceOf(InvalidRuleException.class)
          .hasMessageContaining("page");
    }

    @Test
    @DisplayName("should reject a size above the maximum")
    void shouldRejectSizeAboveMaximum() {
      assertThatThrownBy(() -> ruleService.getRulesPage(null, 0, RuleService.MAX_PAGE_SIZE + 1))
          .isInstanceOf(InvalidRuleException.class)
          .hasMessageContaining("size");
    }

    @Test
    @DisplayName("should reject a size below one")
    void shouldRejectSizeBelowOne() {
      assertThatThrownBy(() -> ruleService.getRulesPage(null, 0, 0))
          .isInstanceOf(InvalidRuleException.class)
          .hasMessageContaining("size");
    }

    @Test
    @DisplayName("should wrap storage failures")
    void shouldWrapStorageFailures() {
      // given
      when(studioRuleRepository.findPage("set", 0, 50))
          .thenThrow(new IllegalStateException("mongo down"));

      // when/then
      assertThatThrownBy(() -> ruleService.getRulesPage("set", 0, 50))
          .isInstanceOf(StorageOperationException.class);
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

    @Test
    @DisplayName("should wrap storage failures")
    void shouldWrapStorageFailures() {
      // given
      when(ruleRepository.findById("test-rule")).thenThrow(new IllegalStateException("mongo down"));

      // when/then
      assertThatThrownBy(() -> ruleService.getRuleById("test-rule"))
          .isInstanceOf(StorageOperationException.class);
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
      assertThat(result.version()).isEqualTo(1L);
      assertThat(result.tags()).containsExactly("api", "v1");
      verify(ruleRepository).save(any(RateLimitRule.class));
    }

    @Test
    @DisplayName("should throw RuleAlreadyExistsException when rule exists")
    void shouldThrowWhenRuleExists() {
      // given
      CreateRuleRequest request =
          createRequest("existing-rule", List.of(new RateBandRequest(60L, 100L, null)));
      when(ruleRepository.existsById("existing-rule")).thenReturn(true);

      // when/then
      assertThatThrownBy(() -> ruleService.createRule(request))
          .isInstanceOf(RuleAlreadyExistsException.class)
          .hasMessageContaining("existing-rule");
      verify(ruleRepository, never()).save(any());
    }

    @Test
    @DisplayName("should reject duplicate band windows")
    void shouldRejectDuplicateBandWindows() {
      // given
      CreateRuleRequest request =
          createRequest(
              "dup-rule",
              List.of(new RateBandRequest(60L, 100L, "a"), new RateBandRequest(60L, 10L, "b")));

      // when/then
      assertThatThrownBy(() -> ruleService.createRule(request))
          .isInstanceOf(InvalidRuleException.class)
          .hasMessageContaining("duplicate band window");
      verify(ruleRepository, never()).save(any());
    }

    @Test
    @DisplayName("should wrap storage failures")
    void shouldWrapStorageFailures() {
      // given
      CreateRuleRequest request =
          createRequest("new-rule", List.of(new RateBandRequest(60L, 100L, null)));
      when(ruleRepository.existsById("new-rule"))
          .thenThrow(new IllegalStateException("mongo down"));

      // when/then
      assertThatThrownBy(() -> ruleService.createRule(request))
          .isInstanceOf(StorageOperationException.class);
    }
  }

  @Nested
  @DisplayName("updateRule")
  class UpdateRuleTests {

    @Test
    @DisplayName("should update rule when the version matches")
    void shouldUpdateRuleWhenVersionMatches() {
      // given
      when(ruleRepository.findById("test-rule"))
          .thenReturn(Optional.of(createTestRule("test-rule", "Test Rule", true, 3L)));
      when(studioRuleRepository.replaceIfVersionMatches(any(RateLimitRule.class), eq(3L)))
          .thenReturn(true);

      // when
      RuleResponse result = ruleService.updateRule("test-rule", updateRequest(3L), null);

      // then
      assertThat(result.id()).isEqualTo("test-rule");
      assertThat(result.name()).isEqualTo("Updated Rule");
      assertThat(result.enabled()).isFalse();
      assertThat(result.version()).isEqualTo(4L);
    }

    @Test
    @DisplayName("should accept the version from the If-Match header")
    void shouldAcceptVersionFromIfMatchHeader() {
      // given
      when(ruleRepository.findById("test-rule"))
          .thenReturn(Optional.of(createTestRule("test-rule", "Test Rule", true, 2L)));
      when(studioRuleRepository.replaceIfVersionMatches(any(RateLimitRule.class), eq(2L)))
          .thenReturn(true);

      // when
      RuleResponse result = ruleService.updateRule("test-rule", updateRequest(null), 2L);

      // then
      assertThat(result.version()).isEqualTo(3L);
    }

    @Test
    @DisplayName("should require a version")
    void shouldRequireAVersion() {
      assertThatThrownBy(() -> ruleService.updateRule("test-rule", updateRequest(null), null))
          .isInstanceOf(InvalidRuleException.class)
          .hasMessageContaining("version");
      verify(studioRuleRepository, never()).replaceIfVersionMatches(any(), anyLong());
    }

    @Test
    @DisplayName("should return 409 semantics when the stored version differs")
    void shouldThrowWhenStoredVersionDiffers() {
      // given
      when(ruleRepository.findById("test-rule"))
          .thenReturn(Optional.of(createTestRule("test-rule", "Test Rule", true, 5L)));

      // when/then
      assertThatThrownBy(() -> ruleService.updateRule("test-rule", updateRequest(3L), null))
          .isInstanceOf(RuleVersionMismatchException.class)
          .hasMessageContaining("expected version 3")
          .hasMessageContaining("current version 5");
      verify(studioRuleRepository, never()).replaceIfVersionMatches(any(), anyLong());
    }

    @Test
    @DisplayName("should report the mismatch when the conditional write loses the race")
    void shouldReportMismatchWhenConditionalWriteFails() {
      // given
      when(ruleRepository.findById("test-rule"))
          .thenReturn(
              Optional.of(createTestRule("test-rule", "Test Rule", true, 3L)),
              Optional.of(createTestRule("test-rule", "Test Rule", true, 9L)));
      when(studioRuleRepository.replaceIfVersionMatches(any(RateLimitRule.class), eq(3L)))
          .thenReturn(false);

      // when/then
      assertThatThrownBy(() -> ruleService.updateRule("test-rule", updateRequest(3L), null))
          .isInstanceOf(RuleVersionMismatchException.class)
          .hasMessageContaining("current version 9");
    }

    @Test
    @DisplayName("should throw RuleNotFoundException when rule does not exist")
    void shouldThrowWhenRuleDoesNotExist() {
      // given
      when(ruleRepository.findById("non-existent")).thenReturn(Optional.empty());

      // when/then
      assertThatThrownBy(() -> ruleService.updateRule("non-existent", updateRequest(1L), null))
          .isInstanceOf(RuleNotFoundException.class);
      verify(studioRuleRepository, never()).replaceIfVersionMatches(any(), anyLong());
    }

    @Test
    @DisplayName("should reject duplicate band windows")
    void shouldRejectDuplicateBandWindows() {
      // given
      UpdateRuleRequest request =
          new UpdateRuleRequest(
              "Updated Rule",
              true,
              "PER_IP",
              "ip",
              "REJECT_REQUEST",
              List.of(new RateBandRequest(60L, 100L, "a"), new RateBandRequest(60L, 5L, "b")),
              null,
              null,
              null,
              1L);

      // when/then
      assertThatThrownBy(() -> ruleService.updateRule("test-rule", request, null))
          .isInstanceOf(InvalidRuleException.class)
          .hasMessageContaining("duplicate band window");
    }

    @Test
    @DisplayName("should wrap storage failures of the conditional write")
    void shouldWrapStorageFailures() {
      // given
      when(ruleRepository.findById("test-rule"))
          .thenReturn(Optional.of(createTestRule("test-rule", "Test Rule", true, 1L)));
      when(studioRuleRepository.replaceIfVersionMatches(any(RateLimitRule.class), eq(1L)))
          .thenThrow(new IllegalStateException("mongo down"));

      // when/then
      assertThatThrownBy(() -> ruleService.updateRule("test-rule", updateRequest(1L), null))
          .isInstanceOf(StorageOperationException.class);
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

    @Test
    @DisplayName("should wrap storage failures")
    void shouldWrapStorageFailures() {
      // given
      when(ruleRepository.deleteById("test-rule"))
          .thenThrow(new IllegalStateException("mongo down"));

      // when/then
      assertThatThrownBy(() -> ruleService.deleteRule("test-rule"))
          .isInstanceOf(StorageOperationException.class);
    }
  }

  @Nested
  @DisplayName("toggleRule")
  class ToggleRuleTests {

    @Test
    @DisplayName("should toggle rule from enabled to disabled and bump the version")
    void shouldToggleFromEnabledToDisabled() {
      // given
      RateLimitRule rule = createTestRule("test-rule", "Test Rule", true, 4L);
      when(ruleRepository.findById("test-rule")).thenReturn(Optional.of(rule));
      when(studioRuleRepository.replaceIfVersionMatches(any(RateLimitRule.class), eq(4L)))
          .thenReturn(true);

      // when
      RuleResponse result = ruleService.toggleRule("test-rule");

      // then
      assertThat(result.enabled()).isFalse();
      assertThat(result.version()).isEqualTo(5L);
      verify(ruleRepository, never()).save(any(RateLimitRule.class));
    }

    @Test
    @DisplayName("should toggle rule from disabled to enabled")
    void shouldToggleFromDisabledToEnabled() {
      // given
      RateLimitRule rule = createTestRule("test-rule", "Test Rule", false);
      when(ruleRepository.findById("test-rule")).thenReturn(Optional.of(rule));
      when(studioRuleRepository.replaceIfVersionMatches(any(RateLimitRule.class), eq(1L)))
          .thenReturn(true);

      // when
      RuleResponse result = ruleService.toggleRule("test-rule");

      // then
      assertThat(result.enabled()).isTrue();
    }

    @Test
    @DisplayName("should treat a rule without a version as version 0")
    void shouldTreatMissingVersionAsZero() {
      // given
      RateLimitRule rule = createTestRule("legacy-rule", "Legacy", true, null);
      when(ruleRepository.findById("legacy-rule")).thenReturn(Optional.of(rule));
      when(studioRuleRepository.replaceIfVersionMatches(
              any(RateLimitRule.class), eq(RuleVersions.INITIAL_VERSION)))
          .thenReturn(true);

      // when
      RuleResponse result = ruleService.toggleRule("legacy-rule");

      // then
      assertThat(result.version()).isEqualTo(1L);
    }

    @Test
    @DisplayName("should throw RuleNotFoundException when rule does not exist")
    void shouldThrowWhenRuleDoesNotExist() {
      // given
      when(ruleRepository.findById("non-existent")).thenReturn(Optional.empty());

      // when/then
      assertThatThrownBy(() -> ruleService.toggleRule("non-existent"))
          .isInstanceOf(RuleNotFoundException.class);
      verify(studioRuleRepository, never()).replaceIfVersionMatches(any(), anyLong());
    }

    @Test
    @DisplayName("should report 409 semantics when the compare-and-set loses the race")
    void shouldReportConflictWhenCompareAndSetFails() {
      // given - the rule is read at version 4 but stored at 7 by the time the write happens
      when(ruleRepository.findById("test-rule"))
          .thenReturn(Optional.of(createTestRule("test-rule", "Test Rule", true, 4L)))
          .thenReturn(Optional.of(createTestRule("test-rule", "Test Rule", false, 7L)));
      when(studioRuleRepository.replaceIfVersionMatches(any(RateLimitRule.class), eq(4L)))
          .thenReturn(false);

      // when/then
      assertThatThrownBy(() -> ruleService.toggleRule("test-rule"))
          .isInstanceOf(RuleVersionMismatchException.class)
          .satisfies(
              thrown -> {
                RuleVersionMismatchException mismatch = (RuleVersionMismatchException) thrown;
                assertThat(mismatch.getExpectedVersion()).isEqualTo(4L);
                assertThat(mismatch.getActualVersion()).isEqualTo(7L);
              });
      verify(ruleRepository, never()).save(any(RateLimitRule.class));
    }

    @Test
    @DisplayName("should wrap storage failures of the compare-and-set write")
    void shouldWrapStorageFailures() {
      // given
      when(ruleRepository.findById("test-rule"))
          .thenReturn(Optional.of(createTestRule("test-rule", "Test Rule", true, 4L)));
      when(studioRuleRepository.replaceIfVersionMatches(any(RateLimitRule.class), eq(4L)))
          .thenThrow(new IllegalStateException("mongo down"));

      // when/then
      assertThatThrownBy(() -> ruleService.toggleRule("test-rule"))
          .isInstanceOf(StorageOperationException.class);
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

    @Test
    @DisplayName("should wrap storage failures")
    void shouldWrapStorageFailures() {
      // given
      when(ruleRepository.findByRuleSetId("set"))
          .thenThrow(new IllegalStateException("mongo down"));

      // when/then
      assertThatThrownBy(() -> ruleService.getRulesByRuleSetId("set"))
          .isInstanceOf(StorageOperationException.class);
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

    @Test
    @DisplayName("should wrap storage failures")
    void shouldWrapStorageFailures() {
      // given
      when(ruleRepository.deleteByRuleSetId("set")).thenThrow(new IllegalStateException("boom"));

      // when/then
      assertThatThrownBy(() -> ruleService.deleteByRuleSetId("set"))
          .isInstanceOf(StorageOperationException.class);
    }
  }

  @Nested
  @DisplayName("importRules")
  class ImportRulesTests {

    @Test
    @DisplayName("should create unknown rules and update existing ones")
    void shouldCreateAndUpdate() {
      // given
      CreateRuleRequest newRule =
          createRequest("new-rule", List.of(new RateBandRequest(60L, 100L, null)));
      CreateRuleRequest existingRule =
          createRequest("existing-rule", List.of(new RateBandRequest(60L, 100L, null)));
      when(ruleRepository.findById("new-rule")).thenReturn(Optional.empty());
      when(ruleRepository.findById("existing-rule"))
          .thenReturn(Optional.of(createTestRule("existing-rule", "Existing", true, 6L)));

      // when
      ImportResultResponse result = ruleService.importRules(List.of(newRule, existingRule));

      // then
      assertThat(result.total()).isEqualTo(2);
      assertThat(result.created()).isEqualTo(1);
      assertThat(result.updated()).isEqualTo(1);
      verify(ruleRepository, org.mockito.Mockito.times(2)).save(any(RateLimitRule.class));
    }

    @Test
    @DisplayName("should reject duplicate ids inside the payload")
    void shouldRejectDuplicateIds() {
      // given
      CreateRuleRequest rule =
          createRequest("rule-1", List.of(new RateBandRequest(60L, 100L, null)));

      // when/then
      assertThatThrownBy(() -> ruleService.importRules(List.of(rule, rule)))
          .isInstanceOf(InvalidRuleException.class)
          .hasMessageContaining("duplicate rule id");
      verify(ruleRepository, never()).save(any());
    }

    @Test
    @DisplayName("should reject an entry with duplicate band windows")
    void shouldRejectDuplicateBands() {
      // given
      CreateRuleRequest rule =
          createRequest(
              "rule-1",
              List.of(new RateBandRequest(60L, 100L, "a"), new RateBandRequest(60L, 1L, "b")));

      // when/then
      assertThatThrownBy(() -> ruleService.importRules(List.of(rule)))
          .isInstanceOf(InvalidRuleException.class)
          .hasMessageContaining("duplicate band window");
    }

    @Test
    @DisplayName("should wrap storage failures")
    void shouldWrapStorageFailures() {
      // given
      CreateRuleRequest rule =
          createRequest("rule-1", List.of(new RateBandRequest(60L, 100L, null)));
      when(ruleRepository.findById("rule-1")).thenThrow(new IllegalStateException("mongo down"));

      // when/then
      assertThatThrownBy(() -> ruleService.importRules(List.of(rule)))
          .isInstanceOf(StorageOperationException.class);
    }
  }

  @Nested
  @DisplayName("simulate")
  class SimulateTests {

    private RateLimitRule multiBandRule() {
      RateLimitRule.Builder builder =
          RateLimitRule.builder("multi")
              .name("Multi band")
              .enabled(true)
              .scope(LimitScope.PER_IP)
              .keyStrategyId("ip")
              .onLimitExceedPolicy(OnLimitExceedPolicy.REJECT_REQUEST)
              .attributes(Map.of(RuleVersions.VERSION_ATTRIBUTE, 1L));
      builder.addBand(RateLimitBand.builder(Duration.ofSeconds(1), 10).label("burst").build());
      builder.addBand(RateLimitBand.builder(Duration.ofSeconds(60), 100).label("minute").build());
      return builder.build();
    }

    @Test
    @DisplayName("should allow a burst that fits into every band")
    void shouldAllowBurstWithinCapacity() {
      // given
      when(ruleRepository.findById("multi")).thenReturn(Optional.of(multiBandRule()));

      // when - 1 second window: burst band offers 10 + 10 = 20 tokens, minute band 100 + 1 = 101
      SimulationResponse result = ruleService.simulate("multi", new SimulateRequest(15L, 1L));

      // then
      assertThat(result.allowed()).isTrue();
      assertThat(result.bands()).hasSize(2);
      assertThat(result.bands().get(0).available()).isEqualTo(20L);
      assertThat(result.bands().get(0).exceeded()).isFalse();
      assertThat(result.consumed()).isEqualTo(15L);
      assertThat(result.remaining()).isEqualTo(5L);
    }

    @Test
    @DisplayName("should deny a burst that exceeds the most restrictive band")
    void shouldDenyBurstAboveCapacity() {
      // given
      when(ruleRepository.findById("multi")).thenReturn(Optional.of(multiBandRule()));

      // when
      SimulationResponse result = ruleService.simulate("multi", new SimulateRequest(50L, 1L));

      // then
      assertThat(result.allowed()).isFalse();
      assertThat(result.bands().get(0).exceeded()).isTrue();
      assertThat(result.bands().get(1).exceeded()).isFalse();
      assertThat(result.consumed()).isEqualTo(20L);
      assertThat(result.remaining()).isZero();
    }

    @Test
    @DisplayName("should scale the allowance with the simulated window")
    void shouldScaleWithWindow() {
      // given
      when(ruleRepository.findById("multi")).thenReturn(Optional.of(multiBandRule()));

      // when - 60 seconds: burst band refills 600 tokens, minute band 100
      SimulationResponse result = ruleService.simulate("multi", new SimulateRequest(150L, 60L));

      // then
      assertThat(result.bands().get(0).available()).isEqualTo(610L);
      assertThat(result.bands().get(1).available()).isEqualTo(200L);
      assertThat(result.allowed()).isTrue();
    }

    @Test
    @DisplayName("should throw RuleNotFoundException when rule does not exist")
    void shouldThrowWhenRuleDoesNotExist() {
      // given
      when(ruleRepository.findById("missing")).thenReturn(Optional.empty());

      // when/then
      assertThatThrownBy(() -> ruleService.simulate("missing", new SimulateRequest(1L, 1L)))
          .isInstanceOf(RuleNotFoundException.class);
    }
  }
}
