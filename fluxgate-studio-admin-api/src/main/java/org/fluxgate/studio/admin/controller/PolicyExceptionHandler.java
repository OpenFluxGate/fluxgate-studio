package org.fluxgate.studio.admin.controller;

import jakarta.servlet.http.HttpServletRequest;
import org.fluxgate.studio.admin.dto.response.ErrorResponse;
import org.fluxgate.studio.admin.exception.PolicyApiException;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

/** Publication errors do not expose or log submitted rules, ACLs, actors or driver details. */
@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(assignableTypes = PolicyController.class)
public class PolicyExceptionHandler {
  @ExceptionHandler(PolicyApiException.class)
  public ResponseEntity<ErrorResponse> policy(PolicyApiException ex, HttpServletRequest request) {
    return error(ex.status(), ex.getMessage(), request);
  }

  @ExceptionHandler({
    MethodArgumentNotValidException.class,
    HttpMessageNotReadableException.class,
    MethodArgumentTypeMismatchException.class,
    IllegalArgumentException.class
  })
  public ResponseEntity<ErrorResponse> invalid(Exception ex, HttpServletRequest request) {
    return error(HttpStatus.BAD_REQUEST, "Invalid policy publication request", request);
  }

  @ExceptionHandler(AccessDeniedException.class)
  public ResponseEntity<ErrorResponse> denied(
      AccessDeniedException ex, HttpServletRequest request) {
    return error(HttpStatus.FORBIDDEN, "Access denied", request);
  }

  private ResponseEntity<ErrorResponse> error(
      HttpStatus status, String message, HttpServletRequest request) {
    return ResponseEntity.status(status)
        .body(
            new ErrorResponse(
                status.value(), status.getReasonPhrase(), message, request.getRequestURI()));
  }
}
