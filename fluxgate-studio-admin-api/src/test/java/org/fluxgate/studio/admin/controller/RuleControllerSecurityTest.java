package org.fluxgate.studio.admin.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Map;
import org.fluxgate.studio.admin.config.SecurityConfig;
import org.fluxgate.studio.admin.dto.response.ImportResultResponse;
import org.fluxgate.studio.admin.dto.response.RateBandResponse;
import org.fluxgate.studio.admin.dto.response.RuleResponse;
import org.fluxgate.studio.admin.dto.response.SimulationResponse;
import org.fluxgate.studio.admin.service.RuleService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Verifies the role based access rules of {@link RuleController} end to end through the security
 * filter chain and the {@code @PreAuthorize} annotations.
 */
@WebMvcTest(controllers = RuleController.class)
@Import(SecurityConfig.class)
@TestPropertySource(
    properties = {
      "spring.security.oauth2.resourceserver.jwt.issuer-uri=http://localhost:18080/realms/fluxgate",
      "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://localhost:18080/realms/fluxgate/protocol/openid-connect/certs",
      "app.security.cors.allowed-origins=http://localhost:3000"
    })
class RuleControllerSecurityTest {

  private static final String UPDATE_BODY =
      "{\"name\": \"Rule\", \"enabled\": true, \"scope\": \"PER_IP\", \"keyStrategyId\": \"ip\","
          + " \"onLimitExceedPolicy\": \"REJECT_REQUEST\","
          + " \"bands\": [{\"windowSeconds\": 60, \"capacity\": 100}], \"version\": 1}";

  private static final String CREATE_BODY =
      "{\"id\": \"rule-1\", \"name\": \"Rule\", \"enabled\": true, \"scope\": \"PER_IP\","
          + " \"keyStrategyId\": \"ip\", \"onLimitExceedPolicy\": \"REJECT_REQUEST\","
          + " \"bands\": [{\"windowSeconds\": 60, \"capacity\": 100}]}";

  @Autowired private MockMvc mockMvc;

  @MockBean private RuleService ruleService;

  private static RuleResponse rule(String id) {
    return new RuleResponse(
        id,
        "Rule " + id,
        true,
        "PER_IP",
        "ip",
        "REJECT_REQUEST",
        List.of(new RateBandResponse(60, 100, null)),
        null,
        List.of(),
        Map.of(),
        1L);
  }

  @Nested
  @DisplayName("user role")
  class UserRoleTests {

    @Test
    @WithMockUser(roles = "USER")
    @DisplayName("should be allowed to list rules")
    void shouldListRules() throws Exception {
      // given
      when(ruleService.getAllRules()).thenReturn(List.of(rule("rule-1")));

      // when/then
      mockMvc
          .perform(get("/api/rules"))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.length()").value(1));
    }

    @Test
    @WithMockUser(roles = "USER")
    @DisplayName("should be allowed to read a single rule")
    void shouldReadSingleRule() throws Exception {
      // given
      when(ruleService.getRuleById("rule-1")).thenReturn(rule("rule-1"));

      // when/then
      mockMvc.perform(get("/api/rules/rule-1")).andExpect(status().isOk());
    }

    @Test
    @WithMockUser(roles = "USER")
    @DisplayName("should be allowed to export rules")
    void shouldExportRules() throws Exception {
      // given
      when(ruleService.getAllRules()).thenReturn(List.of(rule("rule-1")));

      // when/then
      mockMvc.perform(get("/api/rules/export")).andExpect(status().isOk());
    }

    @Test
    @WithMockUser(roles = "USER")
    @DisplayName("should be allowed to run the read-only dry-run")
    void shouldSimulate() throws Exception {
      // given
      when(ruleService.simulate(eq("rule-1"), any()))
          .thenReturn(new SimulationResponse("rule-1", 5L, 1L, true, 5L, 5L, List.of()));

      // when/then
      mockMvc
          .perform(
              post("/api/rules/rule-1/simulate")
                  .contentType(MediaType.APPLICATION_JSON)
                  .content("{\"requests\": 5, \"seconds\": 1}"))
          .andExpect(status().isOk());
    }

    @Test
    @WithMockUser(roles = "USER")
    @DisplayName("should be forbidden to delete a rule")
    void shouldNotDeleteRule() throws Exception {
      mockMvc.perform(delete("/api/rules/rule-1")).andExpect(status().isForbidden());
      verify(ruleService, never()).deleteRule(any());
    }

    @Test
    @WithMockUser(roles = "USER")
    @DisplayName("should be forbidden to delete a whole rule set")
    void shouldNotDeleteRuleSet() throws Exception {
      mockMvc
          .perform(delete("/api/rules").param("ruleSetId", "set-1"))
          .andExpect(status().isForbidden());
      verify(ruleService, never()).deleteByRuleSetId(any());
    }

    @Test
    @WithMockUser(roles = "USER")
    @DisplayName("should be forbidden to create a rule")
    void shouldNotCreateRule() throws Exception {
      mockMvc
          .perform(post("/api/rules").contentType(MediaType.APPLICATION_JSON).content(CREATE_BODY))
          .andExpect(status().isForbidden());
      verify(ruleService, never()).createRule(any());
    }

    @Test
    @WithMockUser(roles = "USER")
    @DisplayName("should be forbidden to update a rule")
    void shouldNotUpdateRule() throws Exception {
      mockMvc
          .perform(
              put("/api/rules/rule-1").contentType(MediaType.APPLICATION_JSON).content(UPDATE_BODY))
          .andExpect(status().isForbidden());
      verify(ruleService, never()).updateRule(any(), any(), any());
    }

    @Test
    @WithMockUser(roles = "USER")
    @DisplayName("should be forbidden to toggle a rule")
    void shouldNotToggleRule() throws Exception {
      mockMvc.perform(patch("/api/rules/rule-1/toggle")).andExpect(status().isForbidden());
      verify(ruleService, never()).toggleRule(any());
    }

    @Test
    @WithMockUser(roles = "USER")
    @DisplayName("should be forbidden to import rules")
    void shouldNotImportRules() throws Exception {
      mockMvc
          .perform(
              post("/api/rules/import")
                  .contentType(MediaType.APPLICATION_JSON)
                  .content("{\"rules\": [" + CREATE_BODY + "]}"))
          .andExpect(status().isForbidden());
      verify(ruleService, never()).importRules(any());
    }
  }

  @Nested
  @DisplayName("admin role")
  class AdminRoleTests {

    @Test
    @WithMockUser(roles = "ADMIN")
    @DisplayName("should be allowed to list rules")
    void shouldListRules() throws Exception {
      // given
      when(ruleService.getAllRules()).thenReturn(List.of(rule("rule-1")));

      // when/then
      mockMvc.perform(get("/api/rules")).andExpect(status().isOk());
    }

    @Test
    @WithMockUser(roles = "ADMIN")
    @DisplayName("should be allowed to delete a rule")
    void shouldDeleteRule() throws Exception {
      mockMvc.perform(delete("/api/rules/rule-1")).andExpect(status().isNoContent());
      verify(ruleService).deleteRule("rule-1");
    }

    @Test
    @WithMockUser(roles = "ADMIN")
    @DisplayName("should be allowed to create a rule")
    void shouldCreateRule() throws Exception {
      // given
      when(ruleService.createRule(any())).thenReturn(rule("rule-1"));

      // when/then
      mockMvc
          .perform(post("/api/rules").contentType(MediaType.APPLICATION_JSON).content(CREATE_BODY))
          .andExpect(status().isCreated());
    }

    @Test
    @WithMockUser(roles = "ADMIN")
    @DisplayName("should be allowed to update a rule")
    void shouldUpdateRule() throws Exception {
      // given
      when(ruleService.updateRule(eq("rule-1"), any(), any())).thenReturn(rule("rule-1"));

      // when/then
      mockMvc
          .perform(
              put("/api/rules/rule-1").contentType(MediaType.APPLICATION_JSON).content(UPDATE_BODY))
          .andExpect(status().isOk());
    }

    @Test
    @WithMockUser(roles = "ADMIN")
    @DisplayName("should be allowed to toggle a rule")
    void shouldToggleRule() throws Exception {
      // given
      when(ruleService.toggleRule("rule-1")).thenReturn(rule("rule-1"));

      // when/then
      mockMvc.perform(patch("/api/rules/rule-1/toggle")).andExpect(status().isOk());
    }

    @Test
    @WithMockUser(roles = "ADMIN")
    @DisplayName("should be allowed to import rules")
    void shouldImportRules() throws Exception {
      // given
      when(ruleService.importRules(any())).thenReturn(new ImportResultResponse(1, 1, 0));

      // when/then
      mockMvc
          .perform(
              post("/api/rules/import")
                  .contentType(MediaType.APPLICATION_JSON)
                  .content("{\"rules\": [" + CREATE_BODY + "]}"))
          .andExpect(status().isOk());
    }
  }

  @Nested
  @DisplayName("unauthenticated")
  class UnauthenticatedTests {

    @Test
    @DisplayName("should reject anonymous reads")
    void shouldRejectAnonymousReads() throws Exception {
      mockMvc.perform(get("/api/rules")).andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("should reject anonymous writes")
    void shouldRejectAnonymousWrites() throws Exception {
      mockMvc.perform(delete("/api/rules/rule-1")).andExpect(status().isUnauthorized());
    }
  }

  @Nested
  @DisplayName("unknown role")
  class UnknownRoleTests {

    @Test
    @WithMockUser(roles = "GUEST")
    @DisplayName("should reject a role that is neither user nor admin")
    void shouldRejectUnknownRole() throws Exception {
      mockMvc.perform(get("/api/rules")).andExpect(status().isForbidden());
    }
  }
}
