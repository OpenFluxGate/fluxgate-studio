package org.fluxgate.studio.admin.exception;

/** Exception thrown when a requested rule is not found. */
public class RuleNotFoundException extends StudioException {

  private final String ruleId;

  public RuleNotFoundException(String ruleId) {
    super(String.format("Rule not found: %s", ruleId));
    this.ruleId = ruleId;
  }

  public String getRuleId() {
    return ruleId;
  }
}
