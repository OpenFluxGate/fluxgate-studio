package org.fluxgate.studio.admin.exception;

/** Exception thrown when attempting to create a rule that already exists. */
public class RuleAlreadyExistsException extends StudioException {

  private final String ruleId;

  public RuleAlreadyExistsException(String ruleId) {
    super(String.format("Rule already exists: %s", ruleId));
    this.ruleId = ruleId;
  }

  public String getRuleId() {
    return ruleId;
  }
}
