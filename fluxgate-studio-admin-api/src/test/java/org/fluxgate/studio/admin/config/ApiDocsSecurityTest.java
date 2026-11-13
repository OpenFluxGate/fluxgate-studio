package org.fluxgate.studio.admin.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.fluxgate.studio.admin.controller.RuleController;
import org.fluxgate.studio.admin.service.RuleService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultMatcher;

/**
 * Verifies that the OpenAPI document is not readable without authentication under the shipped
 * defaults. The document describes every admin endpoint, so it follows the same roles as the API.
 */
@WebMvcTest(controllers = RuleController.class)
@Import(SecurityConfig.class)
@TestPropertySource(
    properties = {
      "spring.security.oauth2.resourceserver.jwt.issuer-uri=http://localhost:18080/realms/fluxgate",
      "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://localhost:18080/realms/fluxgate/protocol/openid-connect/certs",
      "app.security.cors.allowed-origins=http://localhost:3000"
    })
class ApiDocsSecurityTest {

  @Autowired private MockMvc mockMvc;

  @MockBean private RuleService ruleService;

  /**
   * springdoc is not part of this slice, so the request cannot reach a handler. What matters is
   * only that the security filter chain let it through instead of answering 401 or 403.
   */
  private static ResultMatcher passedSecurityFilterChain() {
    return result ->
        assertThat(result.getResponse().getStatus())
            .as("the request must not be rejected by the security filter chain")
            .isNotIn(HttpStatus.UNAUTHORIZED.value(), HttpStatus.FORBIDDEN.value());
  }

  @Test
  @DisplayName("should reject an anonymous read of the OpenAPI document")
  void shouldRejectAnonymousApiDocs() throws Exception {
    mockMvc.perform(get("/api-docs")).andExpect(status().isUnauthorized());
  }

  @Test
  @DisplayName("should reject an anonymous read of an OpenAPI sub path")
  void shouldRejectAnonymousApiDocsSubPath() throws Exception {
    mockMvc.perform(get("/api-docs/swagger-config")).andExpect(status().isUnauthorized());
  }

  @Test
  @DisplayName("should reject an anonymous read of the YAML variant")
  void shouldRejectAnonymousApiDocsYaml() throws Exception {
    mockMvc.perform(get("/api-docs.yaml")).andExpect(status().isUnauthorized());
  }

  @Test
  @WithMockUser(roles = "USER")
  @DisplayName("should allow the read role to fetch the OpenAPI document")
  void shouldAllowUserRole() throws Exception {
    mockMvc.perform(get("/api-docs")).andExpect(passedSecurityFilterChain());
  }

  @Test
  @WithMockUser(roles = "ADMIN")
  @DisplayName("should allow the admin role to fetch the OpenAPI document")
  void shouldAllowAdminRole() throws Exception {
    mockMvc.perform(get("/api-docs")).andExpect(passedSecurityFilterChain());
  }

  @Test
  @WithMockUser(roles = "GUEST")
  @DisplayName("should reject a role that is neither user nor admin")
  void shouldRejectUnknownRole() throws Exception {
    mockMvc.perform(get("/api-docs")).andExpect(status().isForbidden());
  }

  @Test
  @DisplayName("should keep the Swagger UI assets public so the login prompt can render")
  void shouldKeepSwaggerUiPublic() throws Exception {
    mockMvc.perform(get("/swagger-ui.html")).andExpect(passedSecurityFilterChain());
  }
}
