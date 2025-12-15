package org.fluxgate.studio.admin.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.fluxgate.studio.admin.dto.response.DashboardStatsResponse;
import org.fluxgate.studio.admin.service.DashboardService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** REST controller for dashboard statistics. */
@RestController
@RequestMapping("/api/dashboard")
@Tag(name = "Dashboard", description = "Dashboard statistics APIs")
public class DashboardController {

  private static final Logger log = LoggerFactory.getLogger(DashboardController.class);

  private final DashboardService dashboardService;

  public DashboardController(DashboardService dashboardService) {
    this.dashboardService = dashboardService;
  }

  @GetMapping("/stats")
  @Operation(
      summary = "Get dashboard stats",
      description = "Get summary statistics for the dashboard")
  @ApiResponses({
    @ApiResponse(responseCode = "200", description = "Stats retrieved successfully"),
    @ApiResponse(responseCode = "503", description = "Storage unavailable")
  })
  public ResponseEntity<DashboardStatsResponse> getStats() {
    log.debug("GET /api/dashboard/stats");
    return ResponseEntity.ok(dashboardService.getStats());
  }
}
