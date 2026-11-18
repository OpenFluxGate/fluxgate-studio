package org.fluxgate.studio.admin.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.fluxgate.studio.admin.config.SecurityConfig;
import org.fluxgate.studio.admin.config.SettingsConfig;
import org.fluxgate.studio.admin.exception.MenuPolicyException;
import org.fluxgate.studio.admin.exception.StorageConnectionException;
import org.fluxgate.studio.admin.monitoring.MonitoringRange;
import org.fluxgate.studio.admin.monitoring.MonitoringService;
import org.fluxgate.studio.admin.monitoring.OverviewResponse;
import org.fluxgate.studio.admin.settings.MenuPolicy;
import org.fluxgate.studio.admin.settings.MenuPolicyService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(
    controllers = {MonitoringController.class, MeController.class, MenuPolicyController.class})
@Import({
  SecurityConfig.class,
  SettingsConfig.class,
  MonitoringControllerSecurityTest.FixedClock.class
})
@TestPropertySource(
    properties = {
      "spring.security.oauth2.resourceserver.jwt.issuer-uri=http://localhost:18080/realms/fluxgate",
      "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://localhost:18080/realms/fluxgate/protocol/openid-connect/certs",
      "app.security.cors.allowed-origins=http://localhost:3000"
    })
class MonitoringControllerSecurityTest {
  static final long NOW = 1_794_600_000_000L;

  @TestConfiguration
  static class FixedClock {
    @Bean
    Clock clock() {
      return Clock.fixed(Instant.ofEpochMilli(NOW), ZoneOffset.UTC);
    }
  }

  @Autowired private MockMvc mockMvc;
  @MockBean private MonitoringService monitoringService;
  @MockBean private MenuPolicyService policies;

  @BeforeEach
  void defaults() {
    when(policies.menus(false)).thenReturn(MenuPolicy.DEFAULT.user());
    when(policies.menus(true)).thenReturn(MenuPolicy.DEFAULT.admin());
    when(policies.current()).thenReturn(MenuPolicy.DEFAULT);
  }

  private static MonitoringRange preset(String window) {
    return MonitoringRange.of(window, null, null, NOW);
  }

  @Test
  void anonymousCallersAreRejected() throws Exception {
    mockMvc.perform(get("/api/monitoring/overview")).andExpect(status().isUnauthorized());
  }

  @Test
  @WithMockUser(roles = "USER")
  void viewersReadTheOverviewOfTheLastHourByDefault() throws Exception {
    when(monitoringService.overview(preset("1h")))
        .thenReturn(new OverviewResponse("1h", 0, 1, 0, 0, 0, List.of()));

    mockMvc
        .perform(get("/api/monitoring/overview"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.window").value("1h"));
  }

  @Test
  @WithMockUser(roles = "USER")
  void absoluteRangesReachTheService() throws Exception {
    mockMvc
        .perform(
            get("/api/monitoring/timeseries")
                .param("from", String.valueOf(NOW - 600_000))
                .param("to", String.valueOf(NOW - 60_000)))
        .andExpect(status().isOk());

    verify(monitoringService)
        .timeseries(MonitoringRange.of(null, NOW - 600_000, NOW - 60_000, NOW), null);
  }

  @Test
  @WithMockUser(roles = "USER")
  void brokenRangesAreBadRequests() throws Exception {
    mockMvc.perform(get("/api/monitoring/overview?window=7d")).andExpect(status().isBadRequest());
    mockMvc
        .perform(get("/api/monitoring/overview").param("from", String.valueOf(NOW - 600_000)))
        .andExpect(status().isBadRequest());
    verify(monitoringService, never()).overview(any());
  }

  @Test
  @WithMockUser(roles = "USER")
  void viewersReceiveMaskedKeys() throws Exception {
    mockMvc.perform(get("/api/monitoring/top-rejected")).andExpect(status().isOk());
    verify(monitoringService).topRejected(preset("1h"), null, 20, false);
  }

  @Test
  @WithMockUser(roles = "ADMIN")
  void adminsReceiveRawKeys() throws Exception {
    mockMvc
        .perform(get("/api/monitoring/top-rejected?window=24h&ruleSetId=a&limit=5"))
        .andExpect(status().isOk());
    verify(monitoringService).topRejected(eq(preset("24h")), eq("a"), eq(5), eq(true));
  }

  @Test
  @WithMockUser(roles = "USER")
  void viewersReadTheTimeseries() throws Exception {
    mockMvc.perform(get("/api/monitoring/timeseries?window=15m")).andExpect(status().isOk());
    verify(monitoringService).timeseries(eq(preset("15m")), isNull());
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
        .andExpect(jsonPath("$.canWrite").value(true))
        .andExpect(jsonPath("$.menus[2]").value("keys"))
        .andExpect(jsonPath("$.menuPolicyUnavailable").value(false));
  }

  @Test
  @WithMockUser(username = "bob", roles = "USER")
  void meDescribesAViewer() throws Exception {
    mockMvc
        .perform(get("/api/me"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.username").value("bob"))
        .andExpect(jsonPath("$.canWrite").value(false))
        .andExpect(jsonPath("$.menus.length()").value(3));
  }

  @Test
  @WithMockUser(roles = "USER")
  void viewersCannotReachAdminOnlyPaths() throws Exception {
    mockMvc.perform(get("/api/keys/transforms")).andExpect(status().isForbidden());
    mockMvc.perform(get("/api/audit")).andExpect(status().isForbidden());
  }

  @Test
  @WithMockUser(roles = "USER")
  void rulesCanStillReadTheSharedAggregate() throws Exception {
    when(policies.menus(false)).thenReturn(List.of("rules"));

    mockMvc.perform(get("/api/monitoring/overview")).andExpect(status().isOk());
    mockMvc.perform(get("/api/monitoring/timeseries")).andExpect(status().isForbidden());
    mockMvc.perform(get("/api/monitoring/top-rejected")).andExpect(status().isForbidden());
    verify(monitoringService).overview(preset("1h"));
  }

  @Test
  @WithMockUser(roles = {"USER", "ADMIN"})
  void theAdminPolicyTakesPrecedenceAndRemovingKeysMasksOverview() throws Exception {
    when(policies.menus(true)).thenReturn(List.of("overview", "settings"));
    when(policies.menus(false)).thenReturn(List.of("rules"));

    mockMvc.perform(get("/api/me")).andExpect(jsonPath("$.menus[0]").value("overview"));
    mockMvc.perform(get("/api/monitoring/top-rejected")).andExpect(status().isOk());
    verify(monitoringService).topRejected(preset("1h"), null, 20, false);
  }

  @Test
  @WithMockUser(roles = "ADMIN")
  void adminCanOpenSettingsDuringStorageFailure() throws Exception {
    StorageConnectionException unavailable = new StorageConnectionException("MongoDB", "down");
    when(policies.menus(true)).thenThrow(unavailable);
    when(policies.current()).thenThrow(unavailable);

    mockMvc
        .perform(get("/api/me"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.menus[0]").value("settings"))
        .andExpect(jsonPath("$.menus.length()").value(1))
        .andExpect(jsonPath("$.menuPolicyUnavailable").value(true));
    mockMvc.perform(get("/api/settings/menus")).andExpect(status().isServiceUnavailable());
    mockMvc.perform(get("/api/monitoring/overview")).andExpect(status().isServiceUnavailable());
    verify(monitoringService, never()).overview(any());
  }

  @Test
  @WithMockUser(roles = "USER")
  void viewersCannotEditThePolicyAndPolicyQueriesFailClosed() throws Exception {
    when(policies.menus(false)).thenThrow(new StorageConnectionException("MongoDB", "down"));

    mockMvc.perform(get("/api/me")).andExpect(status().isServiceUnavailable());
    mockMvc.perform(get("/api/monitoring/overview")).andExpect(status().isServiceUnavailable());
    mockMvc.perform(get("/api/settings/menus")).andExpect(status().isForbidden());
    mockMvc.perform(put("/api/settings/menus")).andExpect(status().isForbidden());
  }

  @Test
  @WithMockUser(roles = "ADMIN")
  void adminCanReadAndReplaceAValidatedPolicyAndRetryAfterAConflict() throws Exception {
    String body = """
        {"version":0,"admin":["settings"],"user":["rules"]}
        """;
    MenuPolicy requested = new MenuPolicy(0, List.of("settings"), List.of("rules"));
    when(policies.update(any(), eq(requested)))
        .thenReturn(
            new MenuPolicyService.Saved(
                new MenuPolicy(1, requested.admin(), requested.user()), true))
        .thenThrow(new MenuPolicyException(HttpStatus.CONFLICT, "Menu policy changed"));

    mockMvc.perform(get("/api/settings/menus")).andExpect(jsonPath("$.version").value(0));
    mockMvc
        .perform(put("/api/settings/menus").contentType(MediaType.APPLICATION_JSON).content(body))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.version").value(1))
        .andExpect(jsonPath("$.admin[0]").value("settings"))
        .andExpect(jsonPath("$.user[0]").value("rules"));
    mockMvc
        .perform(put("/api/settings/menus").contentType(MediaType.APPLICATION_JSON).content(body))
        .andExpect(status().isConflict());
  }

  @ParameterizedTest
  @WithMockUser(roles = "ADMIN")
  @ValueSource(
      strings = {
        "{",
        "{\"admin\":[\"settings\"],\"user\":[\"rules\"]}",
        "{\"version\":0.5,\"admin\":[\"settings\"],\"user\":[\"rules\"]}",
        "{\"version\":0,\"admin\":[\"overview\"],\"user\":[\"rules\"]}",
        "{\"version\":0,\"admin\":[\"settings\"],\"user\":[]}",
        "{\"version\":0,\"admin\":[\"settings\"],\"user\":[\"rules\",\"events\"]}",
        "{\"version\":0,\"admin\":[\"settings\"],\"user\":[\"rules\",\"rules\"]}"
      })
  void rejectsInvalidPolicies(String body) throws Exception {
    mockMvc
        .perform(put("/api/settings/menus").contentType(MediaType.APPLICATION_JSON).content(body))
        .andExpect(status().isBadRequest());
    verify(policies, never()).update(any(), any());
  }
}
