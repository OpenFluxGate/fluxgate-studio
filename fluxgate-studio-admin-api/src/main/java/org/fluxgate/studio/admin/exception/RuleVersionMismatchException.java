package org.fluxgate.studio.admin.exception;

/**
 * Exception thrown when an update is attempted with a stale optimistic locking token.
 *
 * <p>Signals that another client modified the rule after it was read.
 */
public class RuleVersionMismatchException extends StudioException {

  private final String ruleId;
  private final long expectedVersion;
  private final long actualVersion;

  public RuleVersionMismatchException(String ruleId, long expectedVersion, long actualVersion) {
    super(
        String.format(
            "Rule '%s' was modified by another request (expected version %d, current version %d)",
            ruleId, expectedVersion, actualVersion));
    this.ruleId = ruleId;
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;
  }

  public String getRuleId() {
    return ruleId;
  }

  public long getExpectedVersion() {
    return expectedVersion;
  }

  public long getActualVersion() {
    return actualVersion;
  }
}
