package org.fluxgate.studio.admin.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import org.fluxgate.studio.admin.config.SecurityConfig;
import org.fluxgate.studio.admin.monitoring.MonitoringService;
import org.fluxgate.studio.admin.monitoring.MonitoringWindow;
import org.fluxgate.studio.admin.monitoring.OverviewResponse;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(controllers = {MonitoringController.class, MeController.class})
@Import(SecurityConfig.class)
@TestPropertySource(
    properties = {
      "spring.security.oauth2.resourceserver.jwt.issuer-uri=http://localhost:18080/realms/fluxgate",
      "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://localhost:18080/realms/fluxgate/protocol/openid-connect/certs",
      "app.security.cors.allowed-origins=http://localhost:3000"
    })
class MonitoringControllerSecurityTest {

  @Autowired private MockMvc mockMvc;
  @MockBean private MonitoringService monitoringService;

  @Test
  void anonymousCallersAreRejected() throws Exception {
    mockMvc.perform(get("/api/monitoring/overview")).andExpect(status().isUnauthorized());
  }

  @Test
  @WithMockUser(roles = "USER")
  void viewersReadTheOverview() throws Exception {
    when(monitoringService.overview(MonitoringWindow.ONE_HOUR))
        .thenReturn(new OverviewResponse("1h", 0, 1, 0, 0, 0, List.of()));

    mockMvc
        .perform(get("/api/monitoring/overview"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.window").value("1h"));
  }

  @Test
  @WithMockUser(roles = "USER")
  void unknownWindowsAreBadRequests() throws Exception {
    mockMvc.perform(get("/api/monitoring/overview?window=7d")).andExpect(status().isBadRequest());
  }

  @Test
  @WithMockUser(roles = "USER")
  void viewersReceiveMaskedKeys() throws Exception {
    mockMvc.perform(get("/api/monitoring/top-rejected")).andExpect(status().isOk());
    verify(monitoringService).topRejected(MonitoringWindow.ONE_HOUR, null, 20, false);
  }

  @Test
  @WithMockUser(roles = "ADMIN")
  void adminsReceiveRawKeys() throws Exception {
    mockMvc
        .perform(get("/api/monitoring/top-rejected?window=24h&ruleSetId=a&limit=5"))
        .andExpect(status().isOk());
    verify(monitoringService).topRejected(MonitoringWindow.ONE_DAY, "a", 5, true);
  }

  @Test
  @WithMockUser(roles = "USER")
  void viewersReadTheTimeseries() throws Exception {
    mockMvc.perform(get("/api/monitoring/timeseries?window=5m")).andExpect(status().isOk());
    verify(monitoringService).timeseries(MonitoringWindow.FIVE_MINUTES, null);
  }

  @Test
  void meDescribesTheSignedInAdmin() throws Exception {
    mockMvc
        .perform(
            get("/api/me")
                .with(
                    jwt()
                        .jwt(
                            token ->
                                token.claim("preferred_username", "alice").claim("name", "Alice"))
                        .authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.username").value("alice"))
        .andExpect(jsonPath("$.name").value("Alice"))
        .andExpect(jsonPath("$.roles[0]").value("ADMIN"))
        .andExpect(jsonPath("$.canWrite").value(true));
  }

  @Test
  @WithMockUser(username = "bob", roles = "USER")
  void meDescribesAViewer() throws Exception {
    mockMvc
        .perform(get("/api/me"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.username").value("bob"))
        .andExpect(jsonPath("$.canWrite").value(false));
  }

  @Test
  @WithMockUser(roles = "USER")
  void viewersCannotReachAdminOnlyPaths() throws Exception {
    mockMvc.perform(get("/api/keys/transforms")).andExpect(status().isForbidden());
    mockMvc.perform(get("/api/audit")).andExpect(status().isForbidden());
    verify(monitoringService, org.mockito.Mockito.never()).overview(any());
  }
}
