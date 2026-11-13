package org.fluxgate.studio.admin.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Map;
import org.fluxgate.studio.admin.audit.AuditAction;
import org.fluxgate.studio.admin.audit.AuditService;
import org.fluxgate.studio.admin.config.SecurityConfig;
import org.fluxgate.studio.admin.dto.response.RateBandResponse;
import org.fluxgate.studio.admin.dto.response.RuleResponse;
import org.fluxgate.studio.admin.service.RuleService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(controllers = RuleController.class)
@Import(SecurityConfig.class)
@TestPropertySource(
    properties = {
      "spring.security.oauth2.resourceserver.jwt.issuer-uri=http://localhost:18080/realms/fluxgate",
      "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://localhost:18080/realms/fluxgate/protocol/openid-connect/certs",
      "app.security.cors.allowed-origins=http://localhost:3000"
    })
class RuleControllerAuditTest {

  private static final String UPDATE_BODY =
      "{\"name\": \"Rule\", \"enabled\": true, \"scope\": \"PER_USER\", \"keyStrategyId\": \"userId\","
          + " \"onLimitExceedPolicy\": \"REJECT_REQUEST\","
          + " \"bands\": [{\"windowSeconds\": 60, \"capacity\": 20}], \"version\": 1}";

  @Autowired private MockMvc mockMvc;
  @MockBean private RuleService ruleService;
  @MockBean private AuditService auditService;

  private static RuleResponse rule(boolean enabled, long capacity, long version) {
    return new RuleResponse(
        "r1",
        "Rule",
        enabled,
        "PER_USER",
        "userId",
        "REJECT_REQUEST",
        List.of(new RateBandResponse(60, capacity, null)),
        "set",
        List.of(),
        Map.of(),
        version);
  }

  @Test
  @WithMockUser(roles = "ADMIN")
  void updateRecordsOnlyTheChangedFields() throws Exception {
    when(ruleService.getRuleById("set", "r1")).thenReturn(rule(true, 30, 1));
    when(ruleService.updateRule(eq("set"), eq("r1"), any(), eq(1L))).thenReturn(rule(true, 20, 2));
    when(auditService.recordChange(any(), any(), any(), any(), any(), any())).thenReturn(true);

    mockMvc
        .perform(
            put("/api/rules/r1?ruleSetId=set")
                .header("If-Match", "1")
                .contentType(MediaType.APPLICATION_JSON)
                .content(UPDATE_BODY))
        .andExpect(status().isOk())
        .andExpect(header().doesNotExist(AuditService.HEADER));

    verify(auditService)
        .recordChange(
            any(),
            eq(AuditAction.RULE_UPDATE),
            eq(Map.of("ruleSetId", "set", "ruleId", "r1")),
            eq(Map.of("bands", List.of(Map.of("windowSeconds", 60L, "capacity", 30L)))),
            eq(Map.of("bands", List.of(Map.of("windowSeconds", 60L, "capacity", 20L)))),
            isNull());
  }

  @Test
  @WithMockUser(roles = "ADMIN")
  void aFailedAuditIsReportedButTheChangeStands() throws Exception {
    when(ruleService.getRuleById("set", "r1")).thenReturn(rule(true, 30, 1));
    when(ruleService.toggleRule("set", "r1")).thenReturn(rule(false, 30, 2));
    when(auditService.recordChange(any(), any(), any(), any(), any(), any())).thenReturn(false);

    mockMvc
        .perform(patch("/api/rules/r1/toggle?ruleSetId=set"))
        .andExpect(status().isOk())
        .andExpect(header().string(AuditService.HEADER, "failed"));
  }

  @Test
  @WithMockUser(roles = "ADMIN")
  void deleteRecordsTheRemovedRule() throws Exception {
    when(ruleService.getRuleById("set", "r1")).thenReturn(rule(true, 30, 1));
    when(auditService.recordChange(any(), any(), any(), any(), any(), any())).thenReturn(true);

    mockMvc.perform(delete("/api/rules/r1?ruleSetId=set")).andExpect(status().isNoContent());

    verify(ruleService).deleteRule("set", "r1");
    verify(auditService)
        .recordChange(
            any(),
            eq(AuditAction.RULE_DELETE),
            eq(Map.of("ruleSetId", "set", "ruleId", "r1")),
            any(),
            isNull(),
            isNull());
  }
}
