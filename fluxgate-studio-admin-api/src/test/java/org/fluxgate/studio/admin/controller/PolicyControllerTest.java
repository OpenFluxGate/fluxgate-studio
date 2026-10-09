package org.fluxgate.studio.admin.controller;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.util.List;
import org.bson.Document;
import org.fluxgate.studio.admin.config.SecurityConfig;
import org.fluxgate.studio.admin.exception.PolicyApiException;
import org.fluxgate.studio.admin.service.PolicyPublicationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(controllers = PolicyController.class)
@Import(SecurityConfig.class)
@TestPropertySource(
    properties = {
      "spring.security.oauth2.resourceserver.jwt.issuer-uri=http://localhost:18080/realms/fluxgate",
      "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://localhost:18080/certs"
    })
class PolicyControllerTest {
  static final String BODY =
      """
      {"expectedRevision":0,"operationId":"b3604c15-05e6-429e-a65a-ed03d3a6e482",
       "rules":[{"id":"r","ruleSetId":"set"}],"accessControl":{},"resetCounters":false}
      """;
  @Autowired MockMvc mvc;
  @Autowired PolicyController controller;
  @MockBean PolicyPublicationService service;

  @Test
  @WithMockUser(roles = "USER")
  void readerCannotPublishOrRollback() throws Exception {
    mvc.perform(
            post("/api/rule-sets/set/publish")
                .contentType(MediaType.APPLICATION_JSON)
                .content(BODY))
        .andExpect(status().isForbidden());
    mvc.perform(
            post("/api/rule-sets/set/rollback")
                .contentType(MediaType.APPLICATION_JSON)
                .content(BODY))
        .andExpect(status().isForbidden());
    verifyNoInteractions(service);
  }

  @Test
  @WithMockUser(roles = "USER")
  void readerCanReadActiveAndHistory() throws Exception {
    when(service.active("set")).thenReturn(new Document("revision", 1L));
    when(service.history("set", 20)).thenReturn(List.of(new Document("revision", 1L)));
    mvc.perform(get("/api/rule-sets/set/active"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.revision").value(1));
    mvc.perform(get("/api/rule-sets/set/history"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[0].revision").value(1));
  }

  @Test
  @WithMockUser(username = "verified-admin", roles = "ADMIN")
  void publishUsesVerifiedPrincipal() throws Exception {
    when(service.publish(eq("set"), any(), eq("verified-admin")))
        .thenReturn(new Document("revision", 1L));
    mvc.perform(
            post("/api/rule-sets/set/publish")
                .contentType(MediaType.APPLICATION_JSON)
                .content(BODY))
        .andExpect(status().isOk());
    verify(service).publish(eq("set"), any(), eq("verified-admin"));
  }

  @Test
  @WithMockUser(roles = "ADMIN")
  void missingPreconditionAndCompletePayloadAreRejected() throws Exception {
    for (String field :
        List.of("expectedRevision", "rules", "accessControl", "resetCounters", "operationId")) {
      Document body = Document.parse(BODY);
      body.remove(field);
      mvc.perform(
              post("/api/rule-sets/set/publish")
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(body.toJson()))
          .andExpect(status().isBadRequest());
    }
    verifyNoInteractions(service);
  }

  @Test
  @WithMockUser(roles = "ADMIN")
  void callerCannotSetActorRevisionOrEpoch() throws Exception {
    for (String field : List.of("actor", "revision", "counterEpoch")) {
      Document body = Document.parse(BODY).append(field, "spoofed");
      mvc.perform(
              post("/api/rule-sets/set/publish")
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(body.toJson()))
          .andExpect(status().isBadRequest());
    }
    verifyNoInteractions(service);
  }

  @Test
  @WithMockUser(roles = "ADMIN")
  void invalidOperationAndResetReasonAreRejected() throws Exception {
    mvc.perform(
            post("/api/rule-sets/set/publish")
                .contentType(MediaType.APPLICATION_JSON)
                .content(Document.parse(BODY).append("rules", List.of()).toJson()))
        .andExpect(status().isBadRequest());
    mvc.perform(
            post("/api/rule-sets/set/publish")
                .contentType(MediaType.APPLICATION_JSON)
                .content(Document.parse(BODY).append("operationId", "invalid").toJson()))
        .andExpect(status().isBadRequest());
    mvc.perform(
            post("/api/rule-sets/set/publish")
                .contentType(MediaType.APPLICATION_JSON)
                .content(Document.parse(BODY).append("resetCounters", true).toJson()))
        .andExpect(status().isBadRequest());
    verifyNoInteractions(service);
  }

  @Test
  void anonymousCannotRead() throws Exception {
    mvc.perform(get("/api/rule-sets/set/active")).andExpect(status().isUnauthorized());
  }

  @Test
  void publicationCorsAcceptsBearerJsonFromConfiguredUiOrigin() throws Exception {
    mvc.perform(
            options("/api/rule-sets/set/publish")
                .header("Origin", "http://localhost:3000")
                .header("Access-Control-Request-Method", "POST")
                .header("Access-Control-Request-Headers", "authorization,content-type"))
        .andExpect(status().isOk())
        .andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:3000"));
    verifyNoInteractions(service);
  }

  @Test
  @WithMockUser(roles = "USER")
  void malformedHistoryLimitIs400() throws Exception {
    mvc.perform(get("/api/rule-sets/set/history").param("limit", "not-a-number"))
        .andExpect(status().isBadRequest());
    verifyNoInteractions(service);
  }

  @Test
  @WithMockUser(roles = "USER")
  void methodSecurityAlsoRejectsDirectInvocation() {
    assertThrows(AccessDeniedException.class, () -> controller.publish("set", null, null));
    verifyNoInteractions(service);
  }

  @Test
  @WithMockUser(username = "verified-admin", roles = "ADMIN")
  void rollbackUsesPrincipalAndMissingTargetIsRejected() throws Exception {
    String body =
        """
      {"expectedRevision":7,"operationId":"b3604c15-05e6-429e-a65a-ed03d3a6e482",
       "targetRevision":3,"resetCounters":false}
      """;
    when(service.rollback(eq("set"), any(), eq("verified-admin")))
        .thenReturn(new Document("revision", 8L));
    mvc.perform(
            post("/api/rule-sets/set/rollback")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.revision").value(8));
    Document missing = Document.parse(body);
    missing.remove("targetRevision");
    mvc.perform(
            post("/api/rule-sets/set/rollback")
                .contentType(MediaType.APPLICATION_JSON)
                .content(missing.toJson()))
        .andExpect(status().isBadRequest());
    verify(service, times(1)).rollback(eq("set"), any(), eq("verified-admin"));
  }

  @Test
  @WithMockUser(roles = "USER")
  void mapsPublicationErrorsToTheirSafeStatus() throws Exception {
    for (HttpStatus status :
        List.of(HttpStatus.NOT_FOUND, HttpStatus.CONFLICT, HttpStatus.SERVICE_UNAVAILABLE)) {
      doThrow(new PolicyApiException(status, "safe policy error")).when(service).active("set");
      mvc.perform(get("/api/rule-sets/set/active"))
          .andExpect(status().is(status.value()))
          .andExpect(jsonPath("$.message").value("safe policy error"));
    }
  }
}
