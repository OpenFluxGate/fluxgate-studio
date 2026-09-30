package org.fluxgate.studio.admin.exception;

import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import org.fluxgate.studio.admin.dto.response.ErrorResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** Global exception handler for the Admin API. */
@RestControllerAdvice
public class GlobalExceptionHandler {

  private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

  /**
   * Prefixes of the validation-style messages the Studio's own request validation produces. Only
   * these are echoed back to the client; every other message is treated as potentially revealing.
   */
  private static final List<String> SAFE_DETAIL_PREFIXES =
      List.of("must be one of:", "must not ", "must be ");

  /** Upper bound on an echoed detail, so that a long message cannot be used as an oracle. */
  private static final int MAX_DETAIL_LENGTH = 200;

  @ExceptionHandler(RuleNotFoundException.class)
  public ResponseEntity<ErrorResponse> handleRuleNotFound(
      RuleNotFoundException ex, HttpServletRequest request) {
    log.warn("Rule not found: {}", ex.getRuleId());
    return ResponseEntity.status(HttpStatus.NOT_FOUND)
        .body(
            new ErrorResponse(
                HttpStatus.NOT_FOUND.value(),
                "Not Found",
                ex.getMessage(),
                request.getRequestURI()));
  }

  @ExceptionHandler(RuleAlreadyExistsException.class)
  public ResponseEntity<ErrorResponse> handleRuleAlreadyExists(
      RuleAlreadyExistsException ex, HttpServletRequest request) {
    log.warn("Rule already exists: {}", ex.getRuleId());
    return ResponseEntity.status(HttpStatus.CONFLICT)
        .body(
            new ErrorResponse(
                HttpStatus.CONFLICT.value(), "Conflict", ex.getMessage(), request.getRequestURI()));
  }

  @ExceptionHandler(InvalidRuleException.class)
  public ResponseEntity<ErrorResponse> handleInvalidRule(
      InvalidRuleException ex, HttpServletRequest request) {
    log.warn("Invalid rule: {}", ex.getMessage());
    List<String> details =
        ex.getField() == null
            ? null
            : List.of(String.format("%s: %s", ex.getField(), ex.getMessage()));
    return ResponseEntity.status(HttpStatus.BAD_REQUEST)
        .body(
            new ErrorResponse(
                HttpStatus.BAD_REQUEST.value(),
                "Bad Request",
                ex.getMessage(),
                request.getRequestURI(),
                details));
  }

  @ExceptionHandler(RuleVersionMismatchException.class)
  public ResponseEntity<ErrorResponse> handleRuleVersionMismatch(
      RuleVersionMismatchException ex, HttpServletRequest request) {
    log.warn(
        "Rule version mismatch: {} (expected={}, actual={})",
        ex.getRuleId(),
        ex.getExpectedVersion(),
        ex.getActualVersion());
    return ResponseEntity.status(HttpStatus.CONFLICT)
        .body(
            new ErrorResponse(
                HttpStatus.CONFLICT.value(),
                "Conflict",
                ex.getMessage(),
                request.getRequestURI(),
                List.of(
                    "expectedVersion: " + ex.getExpectedVersion(),
                    "actualVersion: " + ex.getActualVersion())));
  }

  @ExceptionHandler(StorageConnectionException.class)
  public ResponseEntity<ErrorResponse> handleStorageConnection(
      StorageConnectionException ex, HttpServletRequest request) {
    log.error("Storage connection error: {} - {}", ex.getStorageType(), ex.getMessage(), ex);
    return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
        .body(
            new ErrorResponse(
                HttpStatus.SERVICE_UNAVAILABLE.value(),
                "Service Unavailable",
                "Storage connection failed. Please try again later.",
                request.getRequestURI()));
  }

  @ExceptionHandler(StorageOperationException.class)
  public ResponseEntity<ErrorResponse> handleStorageOperation(
      StorageOperationException ex, HttpServletRequest request) {
    log.error("Storage operation error: {} - {}", ex.getOperation(), ex.getMessage(), ex);
    return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
        .body(
            new ErrorResponse(
                HttpStatus.INTERNAL_SERVER_ERROR.value(),
                "Internal Server Error",
                "Storage operation failed. Please try again later.",
                request.getRequestURI()));
  }

  @ExceptionHandler(MethodArgumentNotValidException.class)
  public ResponseEntity<ErrorResponse> handleValidation(
      MethodArgumentNotValidException ex, HttpServletRequest request) {
    List<String> details =
        ex.getBindingResult().getFieldErrors().stream().map(this::formatFieldError).toList();
    log.warn("Validation failed: {}", details);
    return ResponseEntity.status(HttpStatus.BAD_REQUEST)
        .body(
            new ErrorResponse(
                HttpStatus.BAD_REQUEST.value(),
                "Bad Request",
                "Validation failed",
                request.getRequestURI(),
                details));
  }

  /**
   * Handles {@link IllegalArgumentException}, which reaches this point from the core library, the
   * MongoDB driver or Spring's own type conversion.
   *
   * <p>The exception message is never echoed verbatim: it can carry connection strings, class names
   * or other internals. The client gets a generic message, and only a validation-style message the
   * Studio itself produces (see {@link #SAFE_DETAIL_PREFIXES}) is surfaced as a detail. The full
   * message stays in the server log.
   *
   * @param ex the exception
   * @param request the current request
   * @return a 400 response with a generic message
   */
  @ExceptionHandler(IllegalArgumentException.class)
  public ResponseEntity<ErrorResponse> handleIllegalArgument(
      IllegalArgumentException ex, HttpServletRequest request) {
    log.warn("Illegal argument: {}", ex.getMessage(), ex);
    return ResponseEntity.status(HttpStatus.BAD_REQUEST)
        .body(
            new ErrorResponse(
                HttpStatus.BAD_REQUEST.value(),
                "Bad Request",
                "Invalid request",
                request.getRequestURI(),
                safeDetails(ex.getMessage())));
  }

  @ExceptionHandler(Exception.class)
  public ResponseEntity<ErrorResponse> handleGeneral(Exception ex, HttpServletRequest request) {
    log.error("Unexpected error occurred", ex);
    return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
        .body(
            new ErrorResponse(
                HttpStatus.INTERNAL_SERVER_ERROR.value(),
                "Internal Server Error",
                "An unexpected error occurred",
                request.getRequestURI()));
  }

  /**
   * Returns the message as a single detail entry when it is one of the Studio's own validation
   * messages, {@code null} otherwise.
   */
  private List<String> safeDetails(String message) {
    if (message == null) {
      return null;
    }
    String trimmed = message.trim();
    if (trimmed.length() > MAX_DETAIL_LENGTH) {
      return null;
    }
    return SAFE_DETAIL_PREFIXES.stream().anyMatch(trimmed::startsWith) ? List.of(trimmed) : null;
  }

  private String formatFieldError(FieldError error) {
    return String.format("%s: %s", error.getField(), error.getDefaultMessage());
  }
}
