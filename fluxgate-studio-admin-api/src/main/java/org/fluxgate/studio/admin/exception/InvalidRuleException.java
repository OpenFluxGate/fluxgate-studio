package org.fluxgate.studio.admin.exception;

/** Exception thrown when rule validation fails. */
public class InvalidRuleException extends StudioException {

  private final String field;

  public InvalidRuleException(String message) {
    super(message);
    this.field = null;
  }

  public InvalidRuleException(String field, String message) {
    super(String.format("Invalid field '%s': %s", field, message));
    this.field = field;
  }

  public String getField() {
    return field;
  }
}
