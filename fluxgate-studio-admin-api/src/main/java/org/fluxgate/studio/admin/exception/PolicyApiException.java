package org.fluxgate.studio.admin.exception;

import org.springframework.http.HttpStatus;

/** Sanitized publication error; never retains a storage exception or policy payload. */
public class PolicyApiException extends RuntimeException {
  private final HttpStatus status;

  public PolicyApiException(HttpStatus status, String message) {
    super(message);
    this.status = status;
  }

  public HttpStatus status() {
    return status;
  }
}
