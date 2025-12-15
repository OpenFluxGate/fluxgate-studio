package org.fluxgate.studio.admin.dto.response;

import java.time.Instant;
import java.util.List;

/** Standard error response DTO. */
public record ErrorResponse(
    int status,
    String error,
    String message,
    String path,
    Instant timestamp,
    List<String> details) {

  public ErrorResponse(int status, String error, String message, String path) {
    this(status, error, message, path, Instant.now(), null);
  }

  public ErrorResponse(
      int status, String error, String message, String path, List<String> details) {
    this(status, error, message, path, Instant.now(), details);
  }
}
