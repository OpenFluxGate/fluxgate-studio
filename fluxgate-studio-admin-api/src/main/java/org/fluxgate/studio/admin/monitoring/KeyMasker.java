package org.fluxgate.studio.admin.monitoring;

/** Hides the middle of a rate limit key for readers who must not see member identifiers. */
public final class KeyMasker {
  private static final String MASK = "****";

  private KeyMasker() {}

  public static String mask(String key) {
    if (key == null) {
      return null;
    }
    if (key.length() <= 4) {
      return MASK;
    }
    return key.substring(0, 2) + MASK + key.substring(key.length() - 2);
  }
}
