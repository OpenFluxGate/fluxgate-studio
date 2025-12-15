package org.fluxgate.studio.admin.exception;

/** Exception thrown when a storage operation fails. */
public class StorageOperationException extends StudioException {

  private final String operation;

  public StorageOperationException(String operation, String message) {
    super(String.format("Storage operation '%s' failed: %s", operation, message), true);
    this.operation = operation;
  }

  public StorageOperationException(String operation, String message, Throwable cause) {
    super(String.format("Storage operation '%s' failed: %s", operation, message), cause, true);
    this.operation = operation;
  }

  public String getOperation() {
    return operation;
  }
}
