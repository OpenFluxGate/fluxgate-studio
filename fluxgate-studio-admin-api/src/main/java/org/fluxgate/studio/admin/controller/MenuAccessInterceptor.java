package org.fluxgate.studio.admin.controller;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Arrays;
import java.util.List;
import org.fluxgate.studio.admin.exception.MenuPolicyException;
import org.fluxgate.studio.admin.settings.MenuPolicy;
import org.fluxgate.studio.admin.settings.MenuPolicyService;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;

public class MenuAccessInterceptor implements HandlerInterceptor {

  static final String RAW_KEYS_ATTRIBUTE = "studioRawKeysAllowed";

  private final MenuPolicyService policies;

  public MenuAccessInterceptor(MenuPolicyService policies) {
    this.policies = policies;
  }

  @Override
  public boolean preHandle(
      HttpServletRequest request, HttpServletResponse response, Object handler) {
    if (!(handler instanceof HandlerMethod method)) {
      return true;
    }
    MenuAccess access = method.getMethodAnnotation(MenuAccess.class);
    if (access == null) {
      access = AnnotatedElementUtils.findMergedAnnotation(method.getBeanType(), MenuAccess.class);
    }
    if (access == null) {
      return true;
    }

    boolean admin = Roles.isAdmin(SecurityContextHolder.getContext().getAuthentication());
    List<String> menus = policies.menus(admin);
    if (Arrays.stream(access.value()).noneMatch(menus::contains)) {
      throw new MenuPolicyException(HttpStatus.FORBIDDEN, "This menu is disabled for your role");
    }
    request.setAttribute(RAW_KEYS_ATTRIBUTE, admin && menus.contains(MenuPolicy.KEYS));
    if (Arrays.asList(access.value()).contains(MenuPolicy.AUDIT)) {
      policies.publishPending();
    }
    return true;
  }
}
