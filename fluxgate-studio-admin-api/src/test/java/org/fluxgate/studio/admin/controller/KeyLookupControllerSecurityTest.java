package org.fluxgate.studio.admin.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import org.fluxgate.studio.admin.config.SecurityConfig;
import org.fluxgate.studio.admin.exception.StorageConnectionException;
import org.fluxgate.studio.admin.monitoring.KeyLookupResponse;
import org.fluxgate.studio.admin.monitoring.KeyLookupService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(controllers = KeyLookupController.class)
@Import(SecurityConfig.class)
@TestPropertySource(
    properties = {
      "spring.security.oauth2.resourceserver.jwt.issuer-uri=http://localhost:18080/realms/fluxgate",
      "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://localhost:18080/realms/fluxgate/protocol/openid-connect/certs",
      "app.security.cors.allowed-origins=http://localhost:3000"
    })
class KeyLookupControllerSecurityTest {
  private static final String BODY = "{\"value\":\"u1\",\"transform\":\"none\",\"window\":\"24h\"}";

  @Autowired private MockMvc mockMvc;
  @MockBean private KeyLookupService keyLookupService;

  @Test
  @WithMockUser(roles = "USER")
  void viewersCannotLookUpKeys() throws Exception {
    mockMvc
        .perform(post("/api/keys/decisions").contentType(MediaType.APPLICATION_JSON).content(BODY))
        .andExpect(status().isForbidden());
  }

  @Test
  @WithMockUser(roles = "ADMIN")
  void adminsLookUpKeys() throws Exception {
    when(keyLookupService.lookup(any(), any()))
        .thenReturn(
            new KeyLookupResponse("u1", "none", "24h", 0, 1, 1, List.of(), List.of(), List.of()));

    mockMvc
        .perform(post("/api/keys/decisions").contentType(MediaType.APPLICATION_JSON).content(BODY))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.key").value("u1"));
  }

  @Test
  @WithMockUser(roles = "ADMIN")
  void blankValuesAreBadRequests() throws Exception {
    mockMvc
        .perform(
            post("/api/keys/decisions")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"value\":\"\",\"transform\":\"none\",\"window\":\"24h\"}"))
        .andExpect(status().isBadRequest());
  }

  @Test
  @WithMockUser(roles = "ADMIN")
  void anUnrecordableLookupIsServiceUnavailable() throws Exception {
    when(keyLookupService.lookup(any(), any()))
        .thenThrow(new StorageConnectionException("Audit log", "down"));

    mockMvc
        .perform(post("/api/keys/decisions").contentType(MediaType.APPLICATION_JSON).content(BODY))
        .andExpect(status().isServiceUnavailable());
  }

  @Test
  @WithMockUser(roles = "ADMIN")
  void adminsListTransforms() throws Exception {
    when(keyLookupService.transforms()).thenReturn(List.of("none", "sha256"));

    mockMvc
        .perform(get("/api/keys/transforms"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[1]").value("sha256"));
  }
}
