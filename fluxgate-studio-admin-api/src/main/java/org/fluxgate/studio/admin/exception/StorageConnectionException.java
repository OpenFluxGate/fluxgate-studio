package org.fluxgate.studio.admin.exception;

/** Exception thrown when connection to storage (MongoDB/Redis) fails. */
public class StorageConnectionException extends StudioException {

  private final String storageType;

  public StorageConnectionException(String storageType, String message) {
    super(String.format("%s connection failed: %s", storageType, message), true);
    this.storageType = storageType;
  }

  public StorageConnectionException(String storageType, String message, Throwable cause) {
    super(String.format("%s connection failed: %s", storageType, message), cause, true);
    this.storageType = storageType;
  }

  public String getStorageType() {
    return storageType;
  }
}
