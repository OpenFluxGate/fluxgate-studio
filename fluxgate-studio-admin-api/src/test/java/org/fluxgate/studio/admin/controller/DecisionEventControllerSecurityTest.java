package org.fluxgate.studio.admin.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import org.fluxgate.studio.admin.config.SecurityConfig;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(controllers = DecisionEventController.class)
@Import(SecurityConfig.class)
@TestPropertySource(
    properties = {
      "spring.security.oauth2.resourceserver.jwt.issuer-uri=http://localhost:18080/realms/fluxgate",
      "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://localhost:18080/realms/fluxgate/protocol/openid-connect/certs",
      "app.security.cors.allowed-origins=http://localhost:3000"
    })
class DecisionEventControllerSecurityTest {
  @Autowired private MockMvc mockMvc;
  @MockBean private org.fluxgate.studio.admin.monitoring.MongoDecisionEventStore store;

  @Test
  void anonymousRejected() throws Exception {
    mockMvc.perform(get("/api/events?from=1&to=1000")).andExpect(status().isUnauthorized());
    verify(store, never()).search(any());
  }

  @Test
  @WithMockUser(roles = "USER")
  void viewerRejected() throws Exception {
    mockMvc.perform(get("/api/events?from=1&to=1000")).andExpect(status().isForbidden());
    verify(store, never()).search(any());
  }

  @Test
  @WithMockUser(roles = "ADMIN")
  void adminReadsOnlyProjectedResult() throws Exception {
    when(store.search(any()))
        .thenReturn(new org.fluxgate.studio.admin.monitoring.DecisionEventPage(List.of(), null));
    mockMvc
        .perform(get("/api/events?from=1&to=1000&outcome=REJECT&limit=10"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.items").isEmpty());
    verify(store)
        .search(
            new org.fluxgate.studio.admin.monitoring.DecisionEventQuery(
                1, 1000, "REJECT", 10, null));
  }

  @Test
  @WithMockUser(roles = "ADMIN")
  void invalidRequestsDoNotReachMongo() throws Exception {
    for (String query :
        List.of(
            "",
            "?from=1&to=1",
            "?from=abc&to=1000",
            "?from=999999999999999999999&to=1000",
            "?from=1&to=1000&limit=101",
            "?from=1&to=1000&outcome=bad",
            "?from=1&to=1000&cursor=bad")) {
      mockMvc.perform(get("/api/events" + query)).andExpect(status().isBadRequest());
    }
    verify(store, never()).search(any());
  }
}
