package org.fluxgate.studio.admin.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.fluxgate.studio.admin.monitoring.MonitoringService;
import org.fluxgate.studio.admin.monitoring.MonitoringWindow;
import org.fluxgate.studio.admin.monitoring.OverviewResponse;
import org.fluxgate.studio.admin.monitoring.RejectedKeyResponse;
import org.fluxgate.studio.admin.monitoring.TimeseriesResponse;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/monitoring")
@Tag(name = "Monitoring", description = "Aggregates over the recorded rate limit decisions")
public class MonitoringController {

  private final MonitoringService monitoringService;

  public MonitoringController(MonitoringService monitoringService) {
    this.monitoringService = monitoringService;
  }

  @GetMapping("/overview")
  @PreAuthorize(Roles.READER)
  @Operation(summary = "Overview", description = "Totals and per rule set activity")
  public OverviewResponse overview(@RequestParam(defaultValue = "1h") String window) {
    return monitoringService.overview(parse(window));
  }

  @GetMapping("/timeseries")
  @PreAuthorize(Roles.READER)
  @Operation(summary = "Timeseries", description = "Allowed and rejected decisions per bucket")
  public TimeseriesResponse timeseries(
      @RequestParam(defaultValue = "1h") String window,
      @RequestParam(required = false) String ruleSetId) {
    return monitoringService.timeseries(parse(window), blankToNull(ruleSetId));
  }

  @GetMapping("/top-rejected")
  @PreAuthorize(Roles.READER)
  @Operation(summary = "Top rejected keys", description = "Keys are masked for the read only role")
  public List<RejectedKeyResponse> topRejected(
      @RequestParam(defaultValue = "1h") String window,
      @RequestParam(required = false) String ruleSetId,
      @RequestParam(defaultValue = "20") int limit,
      Authentication authentication) {
    return monitoringService.topRejected(
        parse(window), blankToNull(ruleSetId), limit, Roles.isAdmin(authentication));
  }

  private static MonitoringWindow parse(String window) {
    return MonitoringWindow.parse(window, MonitoringWindow.MONITORING);
  }

  private static String blankToNull(String value) {
    return value == null || value.isBlank() ? null : value;
  }
}
