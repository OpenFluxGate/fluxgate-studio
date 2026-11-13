package org.fluxgate.studio.admin.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.web.access.intercept.RequestAuthorizationContext;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

class SecurityConfigTest {

  @Nested
  @DisplayName("KeycloakRealmRoleConverter")
  class KeycloakRealmRoleConverterTests {

    private final SecurityConfig.KeycloakRealmRoleConverter converter =
        new SecurityConfig.KeycloakRealmRoleConverter();

    @Test
    @DisplayName("should convert realm roles to granted authorities")
    void shouldConvertRealmRolesToGrantedAuthorities() {
      // given
      Jwt jwt = createJwtWithRoles(List.of("admin", "user"));

      // when
      Collection<GrantedAuthority> authorities = converter.convert(jwt);

      // then
      assertThat(authorities).hasSize(2);
      assertThat(authorities)
          .extracting(GrantedAuthority::getAuthority)
          .containsExactlyInAnyOrder("ROLE_ADMIN", "ROLE_USER");
    }

    @Test
    @DisplayName("should return empty list when realm_access is null")
    void shouldReturnEmptyListWhenRealmAccessIsNull() {
      // given
      Jwt jwt = createJwtWithoutRealmAccess();

      // when
      Collection<GrantedAuthority> authorities = converter.convert(jwt);

      // then
      assertThat(authorities).isEmpty();
    }

    @Test
    @DisplayName("should return empty list when roles is missing")
    void shouldReturnEmptyListWhenRolesIsMissing() {
      // given
      Jwt jwt = createJwtWithEmptyRealmAccess();

      // when
      Collection<GrantedAuthority> authorities = converter.convert(jwt);

      // then
      assertThat(authorities).isEmpty();
    }

    @Test
    @DisplayName("should handle single role")
    void shouldHandleSingleRole() {
      // given
      Jwt jwt = createJwtWithRoles(List.of("viewer"));

      // when
      Collection<GrantedAuthority> authorities = converter.convert(jwt);

      // then
      assertThat(authorities).hasSize(1);
      assertThat(authorities)
          .extracting(GrantedAuthority::getAuthority)
          .containsExactly("ROLE_VIEWER");
    }

    private Jwt createJwtWithRoles(List<String> roles) {
      return Jwt.withTokenValue("token")
          .header("alg", "RS256")
          .claim("realm_access", Map.of("roles", roles))
          .claim("sub", "user-id")
          .issuedAt(Instant.now())
          .expiresAt(Instant.now().plusSeconds(3600))
          .build();
    }

    private Jwt createJwtWithoutRealmAccess() {
      return Jwt.withTokenValue("token")
          .header("alg", "RS256")
          .claim("sub", "user-id")
          .issuedAt(Instant.now())
          .expiresAt(Instant.now().plusSeconds(3600))
          .build();
    }

    private Jwt createJwtWithEmptyRealmAccess() {
      return Jwt.withTokenValue("token")
          .header("alg", "RS256")
          .claim("realm_access", Map.of())
          .claim("sub", "user-id")
          .issuedAt(Instant.now())
          .expiresAt(Instant.now().plusSeconds(3600))
          .build();
    }
  }

  @Nested
  @DisplayName("AudienceValidator")
  class AudienceValidatorTests {

    private final SecurityConfig.AudienceValidator validator =
        new SecurityConfig.AudienceValidator("fluxgate-studio-admin-api");

    @Test
    @DisplayName("should accept a token carrying the required audience")
    void shouldAcceptRequiredAudience() {
      // given
      Jwt jwt = jwtWithAudience(List.of("account", "fluxgate-studio-admin-api"));

      // when
      OAuth2TokenValidatorResult result = validator.validate(jwt);

      // then
      assertThat(result.hasErrors()).isFalse();
    }

    @Test
    @DisplayName("should reject a token whose audience does not contain this API")
    void shouldRejectMissingAudience() {
      // given
      Jwt jwt = jwtWithAudience(List.of("account"));

      // when
      OAuth2TokenValidatorResult result = validator.validate(jwt);

      // then
      assertThat(result.hasErrors()).isTrue();
      assertThat(result.getErrors().iterator().next().getDescription())
          .contains("fluxgate-studio-admin-api");
    }

    @Test
    @DisplayName("should reject a token without any audience")
    void shouldRejectAbsentAudience() {
      // given - the bundled dev realm emits tokens like this
      Jwt jwt =
          Jwt.withTokenValue("token")
              .header("alg", "RS256")
              .claim("sub", "user-id")
              .issuedAt(Instant.now())
              .expiresAt(Instant.now().plusSeconds(3600))
              .build();

      // when/then
      assertThat(validator.validate(jwt).hasErrors()).isTrue();
    }

    private Jwt jwtWithAudience(List<String> audience) {
      return Jwt.withTokenValue("token")
          .header("alg", "RS256")
          .audience(audience)
          .claim("sub", "user-id")
          .issuedAt(Instant.now())
          .expiresAt(Instant.now().plusSeconds(3600))
          .build();
    }
  }

  @Nested
  @DisplayName("corsConfigurationSource")
  class CorsConfigurationSourceTests {

    @Test
    @DisplayName("should expose a narrow policy without credentials")
    void shouldExposeNarrowPolicy() {
      // given
      SecurityConfig config =
          configWith("http://localhost:3000, https://studio.example.com", false);

      // when
      CorsConfiguration cors = firstConfiguration(config);

      // then
      assertThat(cors.getAllowCredentials()).isFalse();
      assertThat(cors.getAllowedOrigins())
          .containsExactly("http://localhost:3000", "https://studio.example.com");
      assertThat(cors.getAllowedHeaders())
          .containsExactly(
              HttpHeaders.AUTHORIZATION, HttpHeaders.CONTENT_TYPE, HttpHeaders.IF_MATCH);
      assertThat(cors.getExposedHeaders()).contains(HttpHeaders.ETAG);
    }

    @Test
    @DisplayName("should allow a wildcard origin as long as credentials are off")
    void shouldAllowWildcardWithoutCredentials() {
      // given
      SecurityConfig config = configWith("*", false);

      // when
      CorsConfiguration cors = firstConfiguration(config);

      // then
      assertThat(cors.getAllowedOrigins()).containsExactly("*");
    }

    @Test
    @DisplayName("should fail fast when a wildcard origin is combined with credentials")
    void shouldFailFastOnWildcardWithCredentials() {
      // given
      SecurityConfig config = configWith("http://localhost:3000, *", true);

      // when/then
      assertThatThrownBy(config::corsConfigurationSource)
          .isInstanceOf(IllegalStateException.class)
          .hasMessageContaining("must not contain '*'");
    }

    private CorsConfiguration firstConfiguration(SecurityConfig config) {
      UrlBasedCorsConfigurationSource source =
          (UrlBasedCorsConfigurationSource) config.corsConfigurationSource();
      return source.getCorsConfigurations().get("/**");
    }
  }

  @Nested
  @DisplayName("jwtDecoder")
  class JwtDecoderTests {

    @Test
    @DisplayName("should build a decoder from the JWK set URI")
    void shouldBuildDecoderFromJwkSetUri() {
      // given
      SecurityConfig config = configWith("http://localhost:3000", false);
      ReflectionTestUtils.setField(config, "jwkSetUri", "http://localhost:18080/jwks");
      ReflectionTestUtils.setField(config, "issuerUri", "http://localhost:18080/realms/fluxgate");

      // when
      JwtDecoder decoder = config.jwtDecoder();

      // then
      assertThat(decoder).isNotNull();
    }

    @Test
    @DisplayName("should build a decoder without audience validation")
    void shouldBuildDecoderWithoutAudienceValidation() {
      // given
      SecurityConfig config = configWith("http://localhost:3000", false);
      ReflectionTestUtils.setField(config, "jwkSetUri", "http://localhost:18080/jwks");
      ReflectionTestUtils.setField(config, "issuerUri", "");
      ReflectionTestUtils.setField(config, "validateAudience", false);

      // when/then
      assertThat(config.jwtDecoder()).isNotNull();
    }

    @Test
    @DisplayName("should fail fast when neither issuer nor JWK set URI is configured")
    void shouldFailFastWithoutIssuerAndJwkSetUri() {
      // given
      SecurityConfig config = configWith("http://localhost:3000", false);
      ReflectionTestUtils.setField(config, "jwkSetUri", "");
      ReflectionTestUtils.setField(config, "issuerUri", "");

      // when/then
      assertThatThrownBy(config::jwtDecoder)
          .isInstanceOf(IllegalStateException.class)
          .hasMessageContaining("jwk-set-uri");
    }
  }

  @Nested
  @DisplayName("apiDocsAuthorization")
  class ApiDocsAuthorizationTests {

    private static final RequestAuthorizationContext CONTEXT =
        new RequestAuthorizationContext(new MockHttpServletRequest("GET", "/api-docs"));

    @Test
    @DisplayName("should require a read role by default")
    void shouldRequireReadRoleByDefault() {
      // given
      SecurityConfig config = configWith("http://localhost:3000", false);

      // when
      AuthorizationDecision anonymous =
          config.apiDocsAuthorization().check(ApiDocsAuthorizationTests::anonymous, CONTEXT);
      AuthorizationDecision user =
          config.apiDocsAuthorization().check(() -> withRole("ROLE_USER"), CONTEXT);
      AuthorizationDecision admin =
          config.apiDocsAuthorization().check(() -> withRole("ROLE_ADMIN"), CONTEXT);
      AuthorizationDecision guest =
          config.apiDocsAuthorization().check(() -> withRole("ROLE_GUEST"), CONTEXT);

      // then
      assertThat(anonymous.isGranted()).isFalse();
      assertThat(user.isGranted()).isTrue();
      assertThat(admin.isGranted()).isTrue();
      assertThat(guest.isGranted()).isFalse();
    }

    @Test
    @DisplayName("should allow anonymous access when public-api-docs is enabled")
    void shouldAllowAnonymousWhenPublic() {
      // given
      SecurityConfig config = configWith("http://localhost:3000", false);
      ReflectionTestUtils.setField(config, "publicApiDocs", true);

      // when
      AuthorizationDecision anonymous =
          config.apiDocsAuthorization().check(ApiDocsAuthorizationTests::anonymous, CONTEXT);

      // then
      assertThat(anonymous.isGranted()).isTrue();
    }

    private static Authentication anonymous() {
      return new AnonymousAuthenticationToken(
          "key", "anonymousUser", AuthorityUtils.createAuthorityList("ROLE_ANONYMOUS"));
    }

    private static Authentication withRole(String role) {
      return new UsernamePasswordAuthenticationToken(
          "tester", "n/a", AuthorityUtils.createAuthorityList(role));
    }
  }

  @Nested
  @DisplayName("warnAboutRelaxedSecurity")
  class WarnAboutRelaxedSecurityTests {

    @Test
    @DisplayName("should stay silent with the shipped defaults")
    void shouldStaySilentWithDefaults() {
      // given
      SecurityConfig config = configWith("http://localhost:3000", false);

      // when/then
      assertThat(warningsOf(config)).isEmpty();
    }

    @Test
    @DisplayName("should warn once when audience validation is disabled")
    void shouldWarnWhenAudienceValidationDisabled() {
      // given
      SecurityConfig config = configWith("http://localhost:3000", false);
      ReflectionTestUtils.setField(config, "validateAudience", false);

      // when/then
      assertThat(warningsOf(config))
          .singleElement()
          .satisfies(message -> assertThat(message).contains("audience validation is DISABLED"));
    }

    @Test
    @DisplayName("should warn when the OpenAPI document is public")
    void shouldWarnWhenApiDocsPublic() {
      // given
      SecurityConfig config = configWith("http://localhost:3000", false);
      ReflectionTestUtils.setField(config, "publicApiDocs", true);

      // when/then
      assertThat(warningsOf(config))
          .singleElement()
          .satisfies(message -> assertThat(message).contains("publicly readable"));
    }

    private List<String> warningsOf(SecurityConfig config) {
      ch.qos.logback.classic.Logger logger =
          (ch.qos.logback.classic.Logger) LoggerFactory.getLogger(SecurityConfig.class);
      ListAppender<ILoggingEvent> appender = new ListAppender<>();
      appender.start();
      logger.addAppender(appender);
      try {
        config.warnAboutRelaxedSecurity();
      } finally {
        logger.detachAppender(appender);
        appender.stop();
      }
      return appender.list.stream()
          .filter(event -> event.getLevel() == Level.WARN)
          .map(ILoggingEvent::getFormattedMessage)
          .toList();
    }
  }

  private static SecurityConfig configWith(String allowedOrigins, boolean allowCredentials) {
    SecurityConfig config = new SecurityConfig();
    ReflectionTestUtils.setField(config, "allowedOrigins", allowedOrigins);
    ReflectionTestUtils.setField(config, "allowCredentials", allowCredentials);
    ReflectionTestUtils.setField(config, "issuerUri", "http://localhost:18080/realms/fluxgate");
    ReflectionTestUtils.setField(config, "jwkSetUri", "http://localhost:18080/jwks");
    ReflectionTestUtils.setField(config, "audience", "fluxgate-studio-admin-api");
    ReflectionTestUtils.setField(config, "validateAudience", true);
    ReflectionTestUtils.setField(config, "publicApiDocs", false);
    return config;
  }
}
