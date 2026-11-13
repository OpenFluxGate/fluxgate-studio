package org.fluxgate.studio.admin.repository;

import java.util.Map;
import org.fluxgate.core.config.RateLimitRule;

/**
 * Reads and writes the optimistic locking token of a rule.
 *
 * <p>{@code org.fluxgate.core.config.RateLimitRule} is owned by the FluxGate core library and has
 * no version property, so Studio keeps the token in the rule attributes. The MongoDB adapter stores
 * attributes as a nested document, which makes the token addressable as {@code attributes.version}
 * and therefore usable in a compare-and-set filter — the equivalent of a Spring Data
 * {@code @Version} field for this raw-driver persistence layer.
 */
public final class RuleVersions {

  /** Attribute key holding the optimistic locking token. */
  public static final String VERSION_ATTRIBUTE = "version";

  /** Version assigned to rules created before optimistic locking was introduced. */
  public static final long INITIAL_VERSION = 0L;

  private RuleVersions() {}

  /**
   * Read the version of a stored rule.
   *
   * @param rule the rule
   * @return the stored version, or {@link #INITIAL_VERSION} when the rule predates versioning
   */
  public static long versionOf(RateLimitRule rule) {
    return versionOf(rule.getAttributes());
  }

  /**
   * Read the version from a rule attribute map.
   *
   * @param attributes the attributes (may be {@code null})
   * @return the stored version, or {@link #INITIAL_VERSION} when absent or not numeric
   */
  public static long versionOf(Map<String, Object> attributes) {
    if (attributes == null) {
      return INITIAL_VERSION;
    }
    Object raw = attributes.get(VERSION_ATTRIBUTE);
    if (raw instanceof Number number) {
      return number.longValue();
    }
    return INITIAL_VERSION;
  }
}
