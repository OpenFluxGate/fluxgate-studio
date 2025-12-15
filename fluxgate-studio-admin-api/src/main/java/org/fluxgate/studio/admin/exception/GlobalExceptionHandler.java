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
    return ResponseEntity.status(HttpStatus.BAD_REQUEST)
        .body(
            new ErrorResponse(
                HttpStatus.BAD_REQUEST.value(),
                "Bad Request",
                ex.getMessage(),
                request.getRequestURI()));
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

  private String formatFieldError(FieldError error) {
    return String.format("%s: %s", error.getField(), error.getDefaultMessage());
  }
}
