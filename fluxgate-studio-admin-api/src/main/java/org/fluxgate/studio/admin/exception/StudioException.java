package org.fluxgate.studio.admin.exception;

/** Base exception for FluxGate Studio Admin API. All custom exceptions should extend this class. */
public abstract class StudioException extends RuntimeException {

  private final boolean retryable;

  protected StudioException(String message) {
    this(message, false);
  }

  protected StudioException(String message, boolean retryable) {
    super(message);
    this.retryable = retryable;
  }

  protected StudioException(String message, Throwable cause) {
    this(message, cause, false);
  }

  protected StudioException(String message, Throwable cause, boolean retryable) {
    super(message, cause);
    this.retryable = retryable;
  }

  /**
   * Indicates whether the operation that caused this exception can be retried.
   *
   * @return true if the operation is retryable, false otherwise
   */
  public boolean isRetryable() {
    return retryable;
  }
}
