package org.fluxgate.studio.admin.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.fluxgate.studio.admin.audit.AuditAction;
import org.fluxgate.studio.admin.audit.AuditActor;
import org.fluxgate.studio.admin.audit.AuditEntry;
import org.fluxgate.studio.admin.audit.AuditQuery;
import org.fluxgate.studio.admin.audit.AuditService;
import org.fluxgate.studio.admin.config.SecurityConfig;
import org.fluxgate.studio.admin.dto.response.PageResponse;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(controllers = AuditController.class)
@Import(SecurityConfig.class)
@TestPropertySource(
    properties = {
      "spring.security.oauth2.resourceserver.jwt.issuer-uri=http://localhost:18080/realms/fluxgate",
      "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://localhost:18080/realms/fluxgate/protocol/openid-connect/certs",
      "app.security.cors.allowed-origins=http://localhost:3000"
    })
class AuditControllerSecurityTest {
  private static final AuditEntry ENTRY =
      new AuditEntry(
          "abc",
          Instant.parse("2026-11-14T05:00:00Z"),
          new AuditActor(null, "alice", "Alice"),
          AuditAction.RULE_UPDATE,
          Map.of("ruleId", "r1"),
          Map.of(),
          Map.of(),
          null);

  @Autowired private MockMvc mockMvc;
  @MockBean private AuditService auditService;

  @Test
  @WithMockUser(roles = "USER")
  void viewersCannotReadTheAuditLog() throws Exception {
    mockMvc.perform(get("/api/audit")).andExpect(status().isForbidden());
  }

  @Test
  @WithMockUser(roles = "ADMIN")
  void adminsSearchWithFilters() throws Exception {
    when(auditService.search(any())).thenReturn(new PageResponse<>(List.of(ENTRY), 0, 50, 1));

    mockMvc
        .perform(get("/api/audit?action=RULE_UPDATE&actor=alice&q=r1&from=1&to=2"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.content[0].action").value("RULE_UPDATE"))
        .andExpect(jsonPath("$.content[0].at").value("2026-11-14T05:00:00Z"));

    verify(auditService)
        .search(
            new AuditQuery(
                AuditAction.RULE_UPDATE,
                "alice",
                "r1",
                Instant.ofEpochMilli(1),
                Instant.ofEpochMilli(2),
                0,
                50));
  }

  @Test
  @WithMockUser(roles = "ADMIN")
  void unknownActionsAndSizesAreBadRequests() throws Exception {
    mockMvc.perform(get("/api/audit?action=NOPE")).andExpect(status().isBadRequest());
    mockMvc.perform(get("/api/audit?size=500")).andExpect(status().isBadRequest());
    mockMvc.perform(get("/api/audit?page=-1")).andExpect(status().isBadRequest());
  }

  @Test
  @WithMockUser(roles = "ADMIN")
  void readsOneEntryOrAnswersNotFound() throws Exception {
    when(auditService.find("abc")).thenReturn(Optional.of(ENTRY));
    when(auditService.find("missing")).thenReturn(Optional.empty());

    mockMvc.perform(get("/api/audit/abc")).andExpect(status().isOk());
    mockMvc.perform(get("/api/audit/missing")).andExpect(status().isNotFound());
  }
}
