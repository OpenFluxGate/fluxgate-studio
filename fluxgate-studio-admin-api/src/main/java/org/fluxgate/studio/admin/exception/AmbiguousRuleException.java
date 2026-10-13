package org.fluxgate.studio.admin.exception;

/** Legacy ID-only request cannot identify a single rule. */
public class AmbiguousRuleException extends StudioException {
  public AmbiguousRuleException() {
    super("Rule ID is ambiguous; supply ruleSetId or unassigned=true");
  }
}
