package org.fluxgate.studio.admin.controller;

import org.springframework.security.core.Authentication;

final class Roles {
  static final String READER = "hasAnyRole('USER', 'ADMIN')";
  static final String WRITER = "hasRole('ADMIN')";

  private Roles() {}

  static boolean isAdmin(Authentication authentication) {
    return authentication != null
        && authentication.getAuthorities().stream()
            .anyMatch(authority -> "ROLE_ADMIN".equals(authority.getAuthority()));
  }
}
