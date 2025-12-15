package org.fluxgate.studio.admin.controller;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.fluxgate.studio.admin.dto.response.DashboardStatsResponse;
import org.fluxgate.studio.admin.exception.GlobalExceptionHandler;
import org.fluxgate.studio.admin.exception.StorageOperationException;
import org.fluxgate.studio.admin.service.DashboardService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

@ExtendWith(MockitoExtension.class)
class DashboardControllerTest {

  @Mock private DashboardService dashboardService;

  private MockMvc mockMvc;

  @BeforeEach
  void setUp() {
    DashboardController controller = new DashboardController(dashboardService);
    mockMvc =
        MockMvcBuilders.standaloneSetup(controller)
            .setControllerAdvice(new GlobalExceptionHandler())
            .build();
  }

  @Test
  @DisplayName("should return dashboard stats")
  void shouldReturnDashboardStats() throws Exception {
    // given
    DashboardStatsResponse stats = new DashboardStatsResponse(10, 8, 2, 3, "2025-01-01T00:00:00Z");
    when(dashboardService.getStats()).thenReturn(stats);

    // when/then
    mockMvc
        .perform(get("/api/dashboard/stats"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.totalRules").value(10))
        .andExpect(jsonPath("$.activeRules").value(8))
        .andExpect(jsonPath("$.disabledRules").value(2))
        .andExpect(jsonPath("$.totalRuleSets").value(3));
  }

  @Test
  @DisplayName("should return 500 when storage operation fails")
  void shouldReturn500WhenStorageOperationFails() throws Exception {
    // given
    when(dashboardService.getStats())
        .thenThrow(new StorageOperationException("getStats", "Connection timeout"));

    // when/then
    mockMvc
        .perform(get("/api/dashboard/stats"))
        .andExpect(status().isInternalServerError())
        .andExpect(jsonPath("$.error").value("Internal Server Error"));
  }
}
