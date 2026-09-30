package org.fluxgate.studio.admin.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;
import org.fluxgate.studio.admin.dto.request.CreateRuleRequest;
import org.fluxgate.studio.admin.dto.request.ImportRulesRequest;
import org.fluxgate.studio.admin.dto.request.RateBandRequest;
import org.fluxgate.studio.admin.dto.request.SimulateRequest;
import org.fluxgate.studio.admin.dto.request.UpdateRuleRequest;
import org.fluxgate.studio.admin.dto.response.BandSimulationResponse;
import org.fluxgate.studio.admin.dto.response.ImportResultResponse;
import org.fluxgate.studio.admin.dto.response.PageResponse;
import org.fluxgate.studio.admin.dto.response.RateBandResponse;
import org.fluxgate.studio.admin.dto.response.RuleResponse;
import org.fluxgate.studio.admin.dto.response.SimulationResponse;
import org.fluxgate.studio.admin.exception.GlobalExceptionHandler;
import org.fluxgate.studio.admin.exception.RuleAlreadyExistsException;
import org.fluxgate.studio.admin.exception.RuleNotFoundException;
import org.fluxgate.studio.admin.exception.RuleVersionMismatchException;
import org.fluxgate.studio.admin.service.RuleService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

@ExtendWith(MockitoExtension.class)
class RuleControllerTest {

  @Mock private RuleService ruleService;

  private MockMvc mockMvc;
  private ObjectMapper objectMapper;

  @BeforeEach
  void setUp() {
    RuleController controller = new RuleController(ruleService);
    mockMvc =
        MockMvcBuilders.standaloneSetup(controller)
            .setControllerAdvice(new GlobalExceptionHandler())
            .build();
    objectMapper = new ObjectMapper();
  }

  private RuleResponse createTestRuleResponse(String id, String name, boolean enabled) {
    return new RuleResponse(
        id,
        name,
        enabled,
        "PER_IP",
        "ip",
        "REJECT_REQUEST",
        List.of(new RateBandResponse(60, 100, "100-per-minute")),
        "test-ruleset",
        List.of("api"),
        Map.of(),
        1L);
  }

  @Nested
  @DisplayName("GET /api/rules")
  class ListRulesTests {

    @Test
    @DisplayName("should return all rules")
    void shouldReturnAllRules() throws Exception {
      // given
      List<RuleResponse> rules =
          List.of(
              createTestRuleResponse("rule-1", "Rule 1", true),
              createTestRuleResponse("rule-2", "Rule 2", false));
      when(ruleService.getAllRules()).thenReturn(rules);

      // when/then
      mockMvc
          .perform(get("/api/rules"))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.length()").value(2))
          .andExpect(jsonPath("$[0].id").value("rule-1"))
          .andExpect(jsonPath("$[1].id").value("rule-2"));
    }

    @Test
    @DisplayName("should filter by ruleSetId")
    void shouldFilterByRuleSetId() throws Exception {
      // given
      List<RuleResponse> rules = List.of(createTestRuleResponse("rule-1", "Rule 1", true));
      when(ruleService.getRulesByRuleSetId("test-ruleset")).thenReturn(rules);

      // when/then
      mockMvc
          .perform(get("/api/rules").param("ruleSetId", "test-ruleset"))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.length()").value(1));
      verify(ruleService).getRulesByRuleSetId("test-ruleset");
    }
  }

  @Nested
  @DisplayName("GET /api/rules/{id}")
  class GetRuleTests {

    @Test
    @DisplayName("should return rule when found")
    void shouldReturnRuleWhenFound() throws Exception {
      // given
      RuleResponse rule = createTestRuleResponse("test-rule", "Test Rule", true);
      when(ruleService.getRuleById("test-rule")).thenReturn(rule);

      // when/then
      mockMvc
          .perform(get("/api/rules/test-rule"))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.id").value("test-rule"))
          .andExpect(jsonPath("$.name").value("Test Rule"));
    }

    @Test
    @DisplayName("should return 404 when not found")
    void shouldReturn404WhenNotFound() throws Exception {
      // given
      when(ruleService.getRuleById("non-existent"))
          .thenThrow(new RuleNotFoundException("non-existent"));

      // when/then
      mockMvc
          .perform(get("/api/rules/non-existent"))
          .andExpect(status().isNotFound())
          .andExpect(jsonPath("$.error").value("Not Found"));
    }
  }

  @Nested
  @DisplayName("POST /api/rules")
  class CreateRuleTests {

    @Test
    @DisplayName("should create rule successfully")
    void shouldCreateRuleSuccessfully() throws Exception {
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
              List.of("api"),
              null);
      RuleResponse response = createTestRuleResponse("new-rule", "New Rule", true);
      when(ruleService.createRule(any(CreateRuleRequest.class))).thenReturn(response);

      // when/then
      mockMvc
          .perform(
              post("/api/rules")
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(objectMapper.writeValueAsString(request)))
          .andExpect(status().isCreated())
          .andExpect(jsonPath("$.id").value("new-rule"));
    }

    @Test
    @DisplayName("should return 409 when rule exists")
    void shouldReturn409WhenRuleExists() throws Exception {
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
      when(ruleService.createRule(any(CreateRuleRequest.class)))
          .thenThrow(new RuleAlreadyExistsException("existing-rule"));

      // when/then
      mockMvc
          .perform(
              post("/api/rules")
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(objectMapper.writeValueAsString(request)))
          .andExpect(status().isConflict())
          .andExpect(jsonPath("$.error").value("Conflict"));
    }

    @Test
    @DisplayName("should return 400 for invalid request")
    void shouldReturn400ForInvalidRequest() throws Exception {
      // given - missing required fields
      String invalidRequest = "{\"name\": \"Test\"}";

      // when/then
      mockMvc
          .perform(
              post("/api/rules").contentType(MediaType.APPLICATION_JSON).content(invalidRequest))
          .andExpect(status().isBadRequest());
    }
  }

  @Nested
  @DisplayName("PUT /api/rules/{id}")
  class UpdateRuleTests {

    @Test
    @DisplayName("should update rule successfully")
    void shouldUpdateRuleSuccessfully() throws Exception {
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
              null,
              3L);
      RuleResponse response =
          new RuleResponse(
              "test-rule",
              "Updated Rule",
              false,
              "PER_USER",
              "userId",
              "REJECT_REQUEST",
              List.of(new RateBandResponse(120, 50, "50-per-2minutes")),
              "updated-ruleset",
              List.of(),
              Map.of(),
              4L);
      when(ruleService.updateRule(eq("test-rule"), any(UpdateRuleRequest.class), any()))
          .thenReturn(response);

      // when/then
      mockMvc
          .perform(
              put("/api/rules/test-rule")
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(objectMapper.writeValueAsString(request)))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.name").value("Updated Rule"));
    }
  }

  @Nested
  @DisplayName("DELETE /api/rules/{id}")
  class DeleteRuleTests {

    @Test
    @DisplayName("should delete rule successfully")
    void shouldDeleteRuleSuccessfully() throws Exception {
      // when/then
      mockMvc.perform(delete("/api/rules/test-rule")).andExpect(status().isNoContent());
      verify(ruleService).deleteRule("test-rule");
    }

    @Test
    @DisplayName("should return 404 when rule not found")
    void shouldReturn404WhenRuleNotFound() throws Exception {
      // given
      doThrow(new RuleNotFoundException("non-existent"))
          .when(ruleService)
          .deleteRule("non-existent");

      // when/then
      mockMvc.perform(delete("/api/rules/non-existent")).andExpect(status().isNotFound());
    }
  }

  @Nested
  @DisplayName("PATCH /api/rules/{id}/toggle")
  class ToggleRuleTests {

    @Test
    @DisplayName("should toggle rule successfully")
    void shouldToggleRuleSuccessfully() throws Exception {
      // given
      RuleResponse response = createTestRuleResponse("test-rule", "Test Rule", false);
      when(ruleService.toggleRule("test-rule")).thenReturn(response);

      // when/then
      mockMvc
          .perform(patch("/api/rules/test-rule/toggle"))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.enabled").value(false));
    }
  }

  @Nested
  @DisplayName("DELETE /api/rules?ruleSetId=")
  class DeleteByRuleSetIdTests {

    @Test
    @DisplayName("should delete rules by ruleSetId")
    void shouldDeleteRulesByRuleSetId() throws Exception {
      // given
      when(ruleService.deleteByRuleSetId("test-ruleset")).thenReturn(3);

      // when/then
      mockMvc
          .perform(delete("/api/rules").param("ruleSetId", "test-ruleset"))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.deletedCount").value(3))
          .andExpect(jsonPath("$.ruleSetId").value("test-ruleset"));
    }
  }

  @Nested
  @DisplayName("GET /api/rules (paged)")
  class ListRulesPagedTests {

    @Test
    @DisplayName("should return a page envelope when page is supplied")
    void shouldReturnPageEnvelope() throws Exception {
      // given
      PageResponse<RuleResponse> page =
          new PageResponse<>(List.of(createTestRuleResponse("rule-1", "Rule 1", true)), 1, 10, 42L);
      when(ruleService.getRulesPage(null, 1, 10)).thenReturn(page);

      // when/then
      mockMvc
          .perform(get("/api/rules").param("page", "1").param("size", "10"))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.content.length()").value(1))
          .andExpect(jsonPath("$.page").value(1))
          .andExpect(jsonPath("$.size").value(10))
          .andExpect(jsonPath("$.totalElements").value(42));
    }

    @Test
    @DisplayName("should default the page index and size")
    void shouldDefaultPageIndexAndSize() throws Exception {
      // given
      when(ruleService.getRulesPage(null, 0, RuleService.DEFAULT_PAGE_SIZE))
          .thenReturn(new PageResponse<>(List.of(), 0, RuleService.DEFAULT_PAGE_SIZE, 0L));

      // when/then
      mockMvc.perform(get("/api/rules").param("size", "50")).andExpect(status().isOk());
      verify(ruleService).getRulesPage(null, 0, RuleService.DEFAULT_PAGE_SIZE);
    }

    @Test
    @DisplayName("should keep returning a plain list without paging parameters")
    void shouldReturnPlainListWithoutPagingParameters() throws Exception {
      // given
      when(ruleService.getAllRules())
          .thenReturn(List.of(createTestRuleResponse("rule-1", "Rule 1", true)));

      // when/then
      mockMvc
          .perform(get("/api/rules"))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.length()").value(1))
          .andExpect(jsonPath("$[0].id").value("rule-1"));
    }
  }

  @Nested
  @DisplayName("GET /api/rules/export")
  class ExportRulesTests {

    @Test
    @DisplayName("should return every rule as a downloadable JSON array")
    void shouldExportRules() throws Exception {
      // given
      when(ruleService.getAllRules())
          .thenReturn(List.of(createTestRuleResponse("rule-1", "Rule 1", true)));

      // when/then
      mockMvc
          .perform(get("/api/rules/export"))
          .andExpect(status().isOk())
          .andExpect(
              header()
                  .string("Content-Disposition", "attachment; filename=\"fluxgate-rules.json\""))
          .andExpect(jsonPath("$.length()").value(1))
          .andExpect(jsonPath("$[0].version").value(1));
    }
  }

  @Nested
  @DisplayName("POST /api/rules/import")
  class ImportRulesTests {

    @Test
    @DisplayName("should import rules and report the summary")
    void shouldImportRules() throws Exception {
      // given
      ImportRulesRequest request =
          new ImportRulesRequest(
              List.of(
                  new CreateRuleRequest(
                      "rule-1",
                      "Rule 1",
                      true,
                      "PER_IP",
                      "ip",
                      "REJECT_REQUEST",
                      List.of(new RateBandRequest(60L, 100L, null)),
                      null,
                      null,
                      null)));
      when(ruleService.importRules(any())).thenReturn(new ImportResultResponse(1, 1, 0));

      // when/then
      mockMvc
          .perform(
              post("/api/rules/import")
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(objectMapper.writeValueAsString(request)))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.total").value(1))
          .andExpect(jsonPath("$.created").value(1))
          .andExpect(jsonPath("$.updated").value(0));
    }

    @Test
    @DisplayName("should return 400 for an empty import")
    void shouldReturn400ForEmptyImport() throws Exception {
      mockMvc
          .perform(
              post("/api/rules/import")
                  .contentType(MediaType.APPLICATION_JSON)
                  .content("{\"rules\": []}"))
          .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("should return 400 for an invalid enum value")
    void shouldReturn400ForInvalidEnumValue() throws Exception {
      String body =
          "{\"rules\": [{\"id\": \"rule-1\", \"name\": \"Rule\", \"enabled\": true,"
              + " \"scope\": \"PER_GALAXY\", \"keyStrategyId\": \"ip\","
              + " \"onLimitExceedPolicy\": \"REJECT_REQUEST\","
              + " \"bands\": [{\"windowSeconds\": 60, \"capacity\": 100}]}]}";

      mockMvc
          .perform(post("/api/rules/import").contentType(MediaType.APPLICATION_JSON).content(body))
          .andExpect(status().isBadRequest())
          .andExpect(
              jsonPath("$.details[0]").value(org.hamcrest.Matchers.containsString("PER_IP")));
    }
  }

  @Nested
  @DisplayName("POST /api/rules/{id}/simulate")
  class SimulateRuleTests {

    @Test
    @DisplayName("should return the per band dry-run result")
    void shouldSimulateRule() throws Exception {
      // given
      SimulationResponse response =
          new SimulationResponse(
              "test-rule",
              15L,
              1L,
              false,
              10L,
              0L,
              List.of(new BandSimulationResponse("burst", 1L, 10L, 10L, 10L, 0L, true)));
      when(ruleService.simulate(eq("test-rule"), any(SimulateRequest.class))).thenReturn(response);

      // when/then
      mockMvc
          .perform(
              post("/api/rules/test-rule/simulate")
                  .contentType(MediaType.APPLICATION_JSON)
                  .content("{\"requests\": 15, \"seconds\": 1}"))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.allowed").value(false))
          .andExpect(jsonPath("$.bands[0].exceeded").value(true));
    }

    @Test
    @DisplayName("should return 400 when the burst size is missing")
    void shouldReturn400WhenRequestsMissing() throws Exception {
      mockMvc
          .perform(
              post("/api/rules/test-rule/simulate")
                  .contentType(MediaType.APPLICATION_JSON)
                  .content("{\"seconds\": 1}"))
          .andExpect(status().isBadRequest());
    }
  }

  @Nested
  @DisplayName("PUT /api/rules/{id} optimistic locking")
  class UpdateRuleVersioningTests {

    private UpdateRuleRequest requestWithoutVersion() {
      return new UpdateRuleRequest(
          "Updated Rule",
          true,
          "PER_IP",
          "ip",
          "REJECT_REQUEST",
          List.of(new RateBandRequest(60L, 100L, null)),
          null,
          null,
          null,
          null);
    }

    @Test
    @DisplayName("should pass a quoted If-Match ETag through as the expected version")
    void shouldParseQuotedIfMatchHeader() throws Exception {
      // given
      when(ruleService.updateRule(eq("test-rule"), any(UpdateRuleRequest.class), eq(7L)))
          .thenReturn(createTestRuleResponse("test-rule", "Updated Rule", true));

      // when/then
      mockMvc
          .perform(
              put("/api/rules/test-rule")
                  .header("If-Match", "\"7\"")
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(objectMapper.writeValueAsString(requestWithoutVersion())))
          .andExpect(status().isOk())
          .andExpect(header().string("ETag", "\"1\""));
    }

    @Test
    @DisplayName("should accept a weak If-Match ETag")
    void shouldParseWeakIfMatchHeader() throws Exception {
      // given
      when(ruleService.updateRule(eq("test-rule"), any(UpdateRuleRequest.class), eq(9L)))
          .thenReturn(createTestRuleResponse("test-rule", "Updated Rule", true));

      // when/then
      mockMvc
          .perform(
              put("/api/rules/test-rule")
                  .header("If-Match", "W/\"9\"")
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(objectMapper.writeValueAsString(requestWithoutVersion())))
          .andExpect(status().isOk());
    }

    @Test
    @DisplayName("should return 400 for a non numeric If-Match header")
    void shouldReturn400ForNonNumericIfMatch() throws Exception {
      mockMvc
          .perform(
              put("/api/rules/test-rule")
                  .header("If-Match", "not-a-version")
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(objectMapper.writeValueAsString(requestWithoutVersion())))
          .andExpect(status().isBadRequest())
          .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("If-Match")));
    }

    @Test
    @DisplayName("should return 409 when the rule was modified concurrently")
    void shouldReturn409OnVersionMismatch() throws Exception {
      // given
      when(ruleService.updateRule(eq("test-rule"), any(UpdateRuleRequest.class), any()))
          .thenThrow(new RuleVersionMismatchException("test-rule", 3L, 5L));

      // when/then
      mockMvc
          .perform(
              put("/api/rules/test-rule")
                  .header("If-Match", "3")
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(objectMapper.writeValueAsString(requestWithoutVersion())))
          .andExpect(status().isConflict())
          .andExpect(jsonPath("$.error").value("Conflict"))
          .andExpect(jsonPath("$.details[0]").value("expectedVersion: 3"))
          .andExpect(jsonPath("$.details[1]").value("actualVersion: 5"));
    }
  }
}
