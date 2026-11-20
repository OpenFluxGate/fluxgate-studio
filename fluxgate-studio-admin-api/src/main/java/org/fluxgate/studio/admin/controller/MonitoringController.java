package org.fluxgate.studio.admin.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.Clock;
import java.util.List;
import org.fluxgate.studio.admin.monitoring.MonitoringRange;
import org.fluxgate.studio.admin.monitoring.MonitoringService;
import org.fluxgate.studio.admin.monitoring.OverviewResponse;
import org.fluxgate.studio.admin.monitoring.RejectedKeyResponse;
import org.fluxgate.studio.admin.monitoring.TimeseriesResponse;
import org.fluxgate.studio.admin.settings.MenuPolicy;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/monitoring")
@Tag(name = "Monitoring", description = "Aggregates over the recorded rate limit decisions")
@MenuAccess(MenuPolicy.OVERVIEW)
public class MonitoringController {

  private final MonitoringService monitoringService;
  private final Clock clock;

  public MonitoringController(MonitoringService monitoringService, Clock clock) {
    this.monitoringService = monitoringService;
    this.clock = clock;
  }

  @MenuAccess({MenuPolicy.OVERVIEW, MenuPolicy.RULES})
  @GetMapping("/overview")
  @PreAuthorize(Roles.READER)
  @Operation(
      summary = "Overview",
      description = "Totals and per rule set activity. Pass window, or from and to in epoch ms.")
  public OverviewResponse overview(
      @RequestParam(required = false) String window,
      @RequestParam(required = false) Long from,
      @RequestParam(required = false) Long to) {
    return monitoringService.overview(range(window, from, to));
  }

  @GetMapping("/timeseries")
  @PreAuthorize(Roles.READER)
  @Operation(summary = "Timeseries", description = "Allowed and rejected decisions per bucket")
  public TimeseriesResponse timeseries(
      @RequestParam(required = false) String window,
      @RequestParam(required = false) Long from,
      @RequestParam(required = false) Long to,
      @RequestParam(required = false) String ruleSetId) {
    return monitoringService.timeseries(range(window, from, to), blankToNull(ruleSetId));
  }

  @GetMapping("/top-rejected")
  @PreAuthorize(Roles.READER)
  @Operation(
      summary = "Top rejected keys",
      description = "Keys are masked unless the caller has access to Key lookup")
  public List<RejectedKeyResponse> topRejected(
      @RequestParam(required = false) String window,
      @RequestParam(required = false) Long from,
      @RequestParam(required = false) Long to,
      @RequestParam(required = false) String ruleSetId,
      @RequestParam(defaultValue = "20") int limit,
      @RequestAttribute(name = MenuAccessInterceptor.RAW_KEYS_ATTRIBUTE, required = false)
          Boolean rawKeysAllowed) {
    return monitoringService.topRejected(
        range(window, from, to),
        blankToNull(ruleSetId),
        limit,
        Boolean.TRUE.equals(rawKeysAllowed));
  }

  private MonitoringRange range(String window, Long from, Long to) {
    return MonitoringRange.of(window, from, to, clock.millis());
  }

  private static String blankToNull(String value) {
    return value == null || value.isBlank() ? null : value;
  }
}
