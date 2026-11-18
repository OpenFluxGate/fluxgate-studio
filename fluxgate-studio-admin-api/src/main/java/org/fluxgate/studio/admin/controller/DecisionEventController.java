package org.fluxgate.studio.admin.controller;

import org.fluxgate.studio.admin.monitoring.DecisionEventPage;
import org.fluxgate.studio.admin.monitoring.DecisionEventQuery;
import org.fluxgate.studio.admin.monitoring.MongoDecisionEventStore;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/events")
public class DecisionEventController {
  private final MongoDecisionEventStore store;

  public DecisionEventController(MongoDecisionEventStore store) {
    this.store = store;
  }

  @GetMapping
  @PreAuthorize(Roles.WRITER)
  public DecisionEventPage search(
      @RequestParam long from,
      @RequestParam long to,
      @RequestParam(required = false) String outcome,
      @RequestParam(defaultValue = "50") int limit,
      @RequestParam(required = false) String cursor) {
    DecisionEventQuery query = new DecisionEventQuery(from, to, outcome, limit, cursor);
    query.position();
    return store.search(query);
  }

  @org.springframework.web.bind.annotation.ExceptionHandler({
    org.springframework.web.bind.MissingServletRequestParameterException.class,
    org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class
  })
  public org.springframework.http.ResponseEntity<
          org.fluxgate.studio.admin.dto.response.ErrorResponse>
      invalidBinding(jakarta.servlet.http.HttpServletRequest request) {
    return org.springframework.http.ResponseEntity.badRequest()
        .body(
            new org.fluxgate.studio.admin.dto.response.ErrorResponse(
                400,
                "Bad Request",
                "Invalid or missing event query parameter",
                request.getRequestURI()));
  }
}
