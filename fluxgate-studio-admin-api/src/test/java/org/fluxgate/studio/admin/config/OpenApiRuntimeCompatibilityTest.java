package org.fluxgate.studio.admin.config;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.fluxgate.studio.admin.controller.RuleController;
import org.fluxgate.studio.admin.exception.GlobalExceptionHandler;
import org.fluxgate.studio.admin.service.RuleService;
import org.junit.jupiter.api.Test;
import org.springdoc.core.configuration.SpringDocConfiguration;
import org.springdoc.core.configuration.SpringDocSpecPropertiesConfiguration;
import org.springdoc.core.properties.SpringDocConfigProperties;
import org.springdoc.webmvc.core.configuration.SpringDocWebMvcConfiguration;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.ImportAutoConfiguration;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/** Exercises real document generation, including controller advice, across framework upgrades. */
@WebMvcTest(controllers = RuleController.class)
@Import({SecurityConfig.class, OpenApiConfig.class, GlobalExceptionHandler.class})
@ImportAutoConfiguration({
  SpringDocConfiguration.class,
  SpringDocConfigProperties.class,
  SpringDocSpecPropertiesConfiguration.class,
  SpringDocWebMvcConfiguration.class
})
@TestPropertySource(
    properties = {
      "springdoc.api-docs.path=/api-docs",
      "spring.security.oauth2.resourceserver.jwt.issuer-uri=http://localhost:18080/realms/fluxgate",
      "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://localhost:18080/realms/fluxgate/protocol/openid-connect/certs"
    })
class OpenApiRuntimeCompatibilityTest {
  @Autowired private MockMvc mockMvc;
  @MockBean private RuleService ruleService;

  @Test
  @WithMockUser(roles = "USER")
  void readRoleCanGenerateRealDocumentIncludingAdminControllersAndAdvice() throws Exception {
    mockMvc
        .perform(get("/api-docs"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.openapi").isNotEmpty())
        .andExpect(jsonPath("$.info.title").value("FluxGate Studio Admin API"))
        .andExpect(jsonPath("$.paths['/api/rules']").exists());
  }

  @Test
  void anonymousDocumentRequestRemainsUnauthorized() throws Exception {
    mockMvc.perform(get("/api-docs")).andExpect(status().isUnauthorized());
  }

  @Test
  @WithMockUser(roles = "GUEST")
  void unrelatedRoleRemainsForbidden() throws Exception {
    mockMvc.perform(get("/api-docs")).andExpect(status().isForbidden());
  }
}
