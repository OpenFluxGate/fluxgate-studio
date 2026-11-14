package org.fluxgate.studio.admin.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.fluxgate.studio.admin.audit.AuditService;
import org.fluxgate.studio.admin.config.SecurityConfig;
import org.fluxgate.studio.admin.settings.Branding;
import org.fluxgate.studio.admin.settings.BrandingService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(controllers = BrandingController.class)
@Import(SecurityConfig.class)
@TestPropertySource(
    properties = {
      "spring.security.oauth2.resourceserver.jwt.issuer-uri=http://localhost:18080/realms/fluxgate",
      "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://localhost:18080/realms/fluxgate/protocol/openid-connect/certs",
      "app.security.cors.allowed-origins=http://localhost:3000"
    })
class BrandingControllerSecurityTest {
  private static final String BODY = "{\"logo\":null,\"favicon\":null}";
  private static final Branding SAVED = new Branding(null, null, 5L, "admin");

  @Autowired private MockMvc mockMvc;
  @MockBean private BrandingService brandingService;

  @Test
  void anyoneCanReadTheBrandingBeforeSigningIn() throws Exception {
    when(brandingService.current())
        .thenReturn(new Branding("data:image/png;base64,AA==", null, 1L, "a"));

    mockMvc
        .perform(get("/api/branding"))
        .andExpect(status().isOk())
        .andExpect(header().string("Cache-Control", "no-cache"))
        .andExpect(jsonPath("$.logo").value("data:image/png;base64,AA=="))
        .andExpect(jsonPath("$.version").value(1));
  }

  @Test
  void anonymousCallersCannotChangeIt() throws Exception {
    mockMvc
        .perform(put("/api/branding").contentType(MediaType.APPLICATION_JSON).content(BODY))
        .andExpect(status().isUnauthorized());
  }

  @Test
  @WithMockUser(roles = "USER")
  void viewersCannotChangeIt() throws Exception {
    mockMvc
        .perform(put("/api/branding").contentType(MediaType.APPLICATION_JSON).content(BODY))
        .andExpect(status().isForbidden());
  }

  @Test
  @WithMockUser(roles = "ADMIN")
  void adminsChangeItAndHearAboutAFailedAuditRecord() throws Exception {
    when(brandingService.update(any(), any())).thenReturn(new BrandingService.Saved(SAVED, false));

    mockMvc
        .perform(put("/api/branding").contentType(MediaType.APPLICATION_JSON).content(BODY))
        .andExpect(status().isOk())
        .andExpect(header().string(AuditService.HEADER, AuditService.FAILED))
        .andExpect(jsonPath("$.updatedBy").value("admin"));
  }
}
