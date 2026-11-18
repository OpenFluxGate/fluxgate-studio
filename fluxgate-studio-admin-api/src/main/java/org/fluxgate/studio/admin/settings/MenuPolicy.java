package org.fluxgate.studio.admin.settings;

import java.util.List;

/** Ordered, versioned menu allowlists for the two Studio roles. */
public record MenuPolicy(long version, List<String> admin, List<String> user) {

  public static final String OVERVIEW = "overview";
  public static final String RULES = "rules";
  public static final String KEYS = "keys";
  public static final String EVENTS = "events";
  public static final String AUDIT = "audit";
  public static final String SETTINGS = "settings";

  public static final long MAX_VERSION = 9_007_199_254_740_991L;

  private static final List<String> ADMIN_MENUS =
      List.of(OVERVIEW, RULES, KEYS, EVENTS, AUDIT, SETTINGS);
  private static final List<String> USER_MENUS = List.of(OVERVIEW, RULES, SETTINGS);

  public static final MenuPolicy DEFAULT = new MenuPolicy(0, ADMIN_MENUS, USER_MENUS);

  public MenuPolicy {
    if (version < 0 || version > MAX_VERSION) {
      throw new IllegalArgumentException("Menu policy version is out of range");
    }
    admin = validate(admin, ADMIN_MENUS, "ADMIN");
    user = validate(user, USER_MENUS, "USER");
    if (!admin.contains(SETTINGS)) {
      throw new IllegalArgumentException("ADMIN must keep Settings enabled");
    }
  }

  private static List<String> validate(List<String> selected, List<String> allowed, String role) {
    if (selected == null
        || selected.isEmpty()
        || selected.size() > allowed.size()
        || selected.stream().anyMatch(menu -> menu == null || !allowed.contains(menu))
        || selected.stream().distinct().count() != selected.size()) {
      throw new IllegalArgumentException(role + " must select one or more unique allowed menus");
    }
    return allowed.stream().filter(selected::contains).toList();
  }
}
