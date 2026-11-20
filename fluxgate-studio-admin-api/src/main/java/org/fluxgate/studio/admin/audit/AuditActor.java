package org.fluxgate.studio.admin.audit;

import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

/** Who performed an action, taken from the Keycloak access token when there is one. */
public record AuditActor(String subject, String username, String name) {

  public static AuditActor from(Authentication authentication) {
    if (authentication instanceof JwtAuthenticationToken token) {
      Jwt jwt = token.getToken();
      String username = firstNonBlank(jwt.getClaimAsString("preferred_username"), token.getName());
      return new AuditActor(
          jwt.getSubject(), username, firstNonBlank(jwt.getClaimAsString("name"), username));
    }
    String name = authentication == null ? "anonymous" : authentication.getName();
    return new AuditActor(null, name, name);
  }

  private static String firstNonBlank(String value, String fallback) {
    return value == null || value.isBlank() ? fallback : value;
  }
}
