package org.fluxgate.studio.admin.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;

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
}
