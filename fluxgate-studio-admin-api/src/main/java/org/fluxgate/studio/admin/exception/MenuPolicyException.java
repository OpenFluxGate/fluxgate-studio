package org.fluxgate.studio.admin.exception;

import org.springframework.http.HttpStatus;

public class MenuPolicyException extends RuntimeException {

  private final HttpStatus status;

  public MenuPolicyException(HttpStatus status, String message) {
    super(message);
    this.status = status;
  }

  public HttpStatus status() {
    return status;
  }
}
