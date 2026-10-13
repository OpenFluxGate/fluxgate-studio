package org.fluxgate.studio.admin.config;

import jakarta.annotation.PostConstruct;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.convert.converter.Converter;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.security.authorization.AuthorityAuthorizationManager;
import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.authorization.AuthorizationManager;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.intercept.RequestAuthorizationContext;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * Security configuration for OAuth2 Resource Server with Keycloak JWT validation.
 *
 * <p>This configuration:
 *
 * <ul>
 *   <li>Validates JWT tokens issued by Keycloak, optionally including the {@code aud} claim
 *   <li>Extracts roles from Keycloak's realm_access.roles claim
 *   <li>Restricts mutating rule endpoints to {@code ROLE_ADMIN} and reads to {@code ROLE_USER} or
 *       {@code ROLE_ADMIN}, mirroring the {@code @PreAuthorize} annotations on the controllers
 *   <li>Configures a narrow CORS policy for cross-origin requests from the UI
 *   <li>Allows public access to health, swagger, and OpenAPI endpoints
 * </ul>
 */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

  private static final Logger log = LoggerFactory.getLogger(SecurityConfig.class);

  private static final String ROLE_ADMIN = "ADMIN";
  private static final String ROLE_USER = "USER";
  private static final String RULES_PATTERN = "/api/rules/**";

  /**
   * Every path springdoc serves the OpenAPI document on. {@code /api-docs/**} also matches the bare
   * {@code /api-docs}, but the {@code .yaml} variant is a sibling path and needs its own entry.
   */
  private static final String[] API_DOCS_PATTERNS = {"/api-docs/**", "/api-docs.yaml"};

  @Value("${app.security.cors.allowed-origins:http://localhost:3000}")
  private String allowedOrigins;

  @Value("${app.security.cors.allow-credentials:false}")
  private boolean allowCredentials;

  @Value("${spring.security.oauth2.resourceserver.jwt.issuer-uri:}")
  private String issuerUri;

  @Value("${spring.security.oauth2.resourceserver.jwt.jwk-set-uri:}")
  private String jwkSetUri;

  @Value("${fluxgate.studio.security.audience:fluxgate-studio-admin-api}")
  private String audience;

  @Value("${fluxgate.studio.security.validate-audience:true}")
  private boolean validateAudience;

  @Value("${fluxgate.studio.security.public-api-docs:false}")
  private boolean publicApiDocs;

  /**
   * Logs the security posture once, at startup, so that a deployment which accidentally runs with
   * the development relaxations cannot do so silently.
   */
  @PostConstruct
  void warnAboutRelaxedSecurity() {
    if (!validateAudience) {
      log.warn(
          "JWT audience validation is DISABLED (fluxgate.studio.security.validate-audience=false). "
              + "Any token issued by the configured Keycloak realm is accepted, including tokens "
              + "minted for a different client. Enable it outside local development.");
    }
    if (publicApiDocs) {
      log.warn(
          "The OpenAPI document is publicly readable "
              + "(fluxgate.studio.security.public-api-docs=true). "
              + "The full API schema is exposed without authentication. "
              + "Disable it outside local development.");
    }
  }

  @Bean
  public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
    http.cors(cors -> cors.configurationSource(corsConfigurationSource()))
        .csrf(csrf -> csrf.disable())
        .sessionManagement(
            session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
        .authorizeHttpRequests(
            auth ->
                auth
                    // Public endpoints
                    .requestMatchers("/actuator/health/**", "/actuator/info")
                    .permitAll()
                    .requestMatchers("/swagger-ui/**", "/swagger-ui.html")
                    .permitAll()
                    // The OpenAPI document is the full API schema: authenticated by default, public
                    // only when explicitly opted in (the dev profile does, production must not).
                    .requestMatchers(API_DOCS_PATTERNS)
                    .access(apiDocsAuthorization())
                    // Read-only dry-run, deliberately available to the read-only role
                    .requestMatchers(HttpMethod.POST, "/api/rules/*/simulate")
                    .hasAnyRole(ROLE_USER, ROLE_ADMIN)
                    .requestMatchers(HttpMethod.POST, "/api/rule-sets/**")
                    .hasRole(ROLE_ADMIN)
                    .requestMatchers(HttpMethod.PUT, "/api/rule-sets/**")
                    .hasRole(ROLE_ADMIN)
                    .requestMatchers(HttpMethod.PATCH, "/api/rule-sets/**")
                    .hasRole(ROLE_ADMIN)
                    .requestMatchers(HttpMethod.DELETE, "/api/rule-sets/**")
                    .hasRole(ROLE_ADMIN)
                    // Mutating rule endpoints are admin only
                    .requestMatchers(HttpMethod.POST, RULES_PATTERN)
                    .hasRole(ROLE_ADMIN)
                    .requestMatchers(HttpMethod.PUT, RULES_PATTERN)
                    .hasRole(ROLE_ADMIN)
                    .requestMatchers(HttpMethod.PATCH, RULES_PATTERN)
                    .hasRole(ROLE_ADMIN)
                    .requestMatchers(HttpMethod.DELETE, RULES_PATTERN)
                    .hasRole(ROLE_ADMIN)
                    // Remaining API endpoints are reads
                    .requestMatchers("/api/**")
                    .hasAnyRole(ROLE_USER, ROLE_ADMIN)
                    .anyRequest()
                    .authenticated())
        .oauth2ResourceServer(
            oauth2 ->
                oauth2.jwt(jwt -> jwt.jwtAuthenticationConverter(jwtAuthenticationConverter())));

    return http.build();
  }

  /**
   * Authorization rule for the OpenAPI document.
   *
   * <p>The document describes every endpoint of the admin surface, so it stays behind the same
   * roles as the API itself. {@code fluxgate.studio.security.public-api-docs} opts out of that for
   * local development, where Swagger UI has to be usable without a token.
   *
   * @return the authorization manager guarding {@code /api-docs/**}
   */
  AuthorizationManager<RequestAuthorizationContext> apiDocsAuthorization() {
    if (publicApiDocs) {
      return (authentication, context) -> new AuthorizationDecision(true);
    }
    return AuthorityAuthorizationManager.hasAnyRole(ROLE_USER, ROLE_ADMIN);
  }

  /**
   * Builds the JWT decoder, adding audience validation on top of the default issuer and expiry
   * checks.
   *
   * <p>Audience validation is controlled by {@code fluxgate.studio.security.validate-audience},
   * which defaults to {@code true}. The bundled development realm has no audience protocol mapper,
   * so {@code application-dev.yml} switches it off for {@code docker compose up}; every other
   * profile keeps it on and {@link #warnAboutRelaxedSecurity()} logs a warning when it is off.
   *
   * @return the configured decoder
   */
  @Bean
  public JwtDecoder jwtDecoder() {
    if (jwkSetUri.isBlank() && issuerUri.isBlank()) {
      throw new IllegalStateException(
          "Either spring.security.oauth2.resourceserver.jwt.jwk-set-uri or issuer-uri must be set");
    }
    NimbusJwtDecoder decoder =
        jwkSetUri.isBlank()
            ? NimbusJwtDecoder.withIssuerLocation(issuerUri).build()
            : NimbusJwtDecoder.withJwkSetUri(jwkSetUri).build();

    List<OAuth2TokenValidator<Jwt>> validators = new ArrayList<>();
    validators.add(
        issuerUri.isBlank()
            ? JwtValidators.createDefault()
            : JwtValidators.createDefaultWithIssuer(issuerUri));
    if (validateAudience) {
      validators.add(new AudienceValidator(audience));
    }
    decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(validators));
    return decoder;
  }

  /**
   * Builds the CORS policy.
   *
   * <p>This is a pure Bearer token resource server, so credentials (cookies) are off by default.
   * The combination of credentials and a wildcard origin is rejected at startup rather than
   * silently accepted.
   *
   * @return the CORS configuration source
   * @throws IllegalStateException if credentials are enabled together with a wildcard origin
   */
  @Bean
  public CorsConfigurationSource corsConfigurationSource() {
    List<String> origins = List.of(allowedOrigins.split(","));
    if (allowCredentials && origins.stream().anyMatch(origin -> origin.trim().equals("*"))) {
      throw new IllegalStateException(
          "Invalid CORS configuration: app.security.cors.allowed-origins must not contain '*' "
              + "while app.security.cors.allow-credentials is true. "
              + "List the UI origins explicitly or disable credentials.");
    }

    CorsConfiguration config = new CorsConfiguration();
    config.setAllowCredentials(allowCredentials);
    config.setAllowedOrigins(origins.stream().map(String::trim).toList());
    config.setAllowedHeaders(
        List.of(HttpHeaders.AUTHORIZATION, HttpHeaders.CONTENT_TYPE, HttpHeaders.IF_MATCH));
    config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
    config.setExposedHeaders(List.of(HttpHeaders.ETAG, HttpHeaders.CONTENT_DISPOSITION));

    UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/**", config);
    return source;
  }

  /**
   * Configures JWT authentication converter to extract roles from Keycloak token.
   *
   * <p>Keycloak stores roles in the following JWT claim structure:
   *
   * <pre>
   * {
   *   "realm_access": {
   *     "roles": ["admin", "user"]
   *   }
   * }
   * </pre>
   */
  @Bean
  public JwtAuthenticationConverter jwtAuthenticationConverter() {
    JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
    converter.setJwtGrantedAuthoritiesConverter(new KeycloakRealmRoleConverter());
    return converter;
  }

  /** Converter that extracts roles from Keycloak's realm_access.roles claim. */
  static class KeycloakRealmRoleConverter implements Converter<Jwt, Collection<GrantedAuthority>> {

    @Override
    @SuppressWarnings("unchecked")
    public Collection<GrantedAuthority> convert(Jwt jwt) {
      Map<String, Object> realmAccess = jwt.getClaimAsMap("realm_access");
      if (realmAccess == null || !realmAccess.containsKey("roles")) {
        return List.of();
      }

      List<String> roles = (List<String>) realmAccess.get("roles");
      return roles.stream()
          .map(role -> new SimpleGrantedAuthority("ROLE_" + role.toUpperCase()))
          .collect(Collectors.toList());
    }
  }

  /** Validator asserting that the token was issued for this resource server. */
  static class AudienceValidator implements OAuth2TokenValidator<Jwt> {

    private final String audience;

    AudienceValidator(String audience) {
      this.audience = audience;
    }

    @Override
    public OAuth2TokenValidatorResult validate(Jwt token) {
      List<String> tokenAudience = token.getAudience();
      if (tokenAudience != null && tokenAudience.contains(audience)) {
        return OAuth2TokenValidatorResult.success();
      }
      return OAuth2TokenValidatorResult.failure(
          new OAuth2Error(
              "invalid_token",
              "The required audience '" + audience + "' is missing",
              "https://tools.ietf.org/html/rfc6750#section-3.1"));
    }
  }
}
