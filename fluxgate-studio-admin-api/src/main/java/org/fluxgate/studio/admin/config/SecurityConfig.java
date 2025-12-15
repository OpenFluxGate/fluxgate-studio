package org.fluxgate.studio.admin.config;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.convert.converter.Converter;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * Security configuration for OAuth2 Resource Server with Keycloak JWT validation.
 *
 * <p>This configuration:
 *
 * <ul>
 *   <li>Validates JWT tokens issued by Keycloak
 *   <li>Extracts roles from Keycloak's realm_access.roles claim
 *   <li>Configures CORS for cross-origin requests from the UI
 *   <li>Allows public access to health, swagger, and OpenAPI endpoints
 * </ul>
 */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

  @Value("${app.security.cors.allowed-origins:http://localhost:3000}")
  private String allowedOrigins;

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
                    .requestMatchers("/swagger-ui/**", "/swagger-ui.html", "/api-docs/**")
                    .permitAll()
                    // API endpoints require authentication
                    .requestMatchers("/api/**")
                    .authenticated()
                    .anyRequest()
                    .authenticated())
        .oauth2ResourceServer(
            oauth2 ->
                oauth2.jwt(jwt -> jwt.jwtAuthenticationConverter(jwtAuthenticationConverter())));

    return http.build();
  }

  @Bean
  public CorsConfigurationSource corsConfigurationSource() {
    CorsConfiguration config = new CorsConfiguration();
    config.setAllowCredentials(true);
    config.setAllowedOrigins(List.of(allowedOrigins.split(",")));
    config.setAllowedHeaders(List.of("*"));
    config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
    config.setExposedHeaders(List.of("Authorization"));

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
}
