package org.fluxgate.studio.admin.exception;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@ExtendWith(MockitoExtension.class)
class GlobalExceptionHandlerTest {

  @Mock private TestService testService;

  private MockMvc mockMvc;

  @BeforeEach
  void setUp() {
    TestController controller = new TestController(testService);
    mockMvc =
        MockMvcBuilders.standaloneSetup(controller)
            .setControllerAdvice(new GlobalExceptionHandler())
            .build();
  }

  @Nested
  @DisplayName("InvalidRuleException handling")
  class InvalidRuleExceptionTests {

    @Test
    @DisplayName("should return 400 for invalid rule")
    void shouldReturn400ForInvalidRule() throws Exception {
      // given
      when(testService.doSomething())
          .thenThrow(new InvalidRuleException("Rule bands cannot be empty"));

      // when/then
      mockMvc
          .perform(get("/test"))
          .andExpect(status().isBadRequest())
          .andExpect(jsonPath("$.status").value(400))
          .andExpect(jsonPath("$.error").value("Bad Request"))
          .andExpect(jsonPath("$.message").value("Rule bands cannot be empty"));
    }
  }

  @Nested
  @DisplayName("StorageConnectionException handling")
  class StorageConnectionExceptionTests {

    @Test
    @DisplayName("should return 503 for storage connection failure")
    void shouldReturn503ForStorageConnectionFailure() throws Exception {
      // given
      when(testService.doSomething())
          .thenThrow(new StorageConnectionException("MongoDB", "Connection refused"));

      // when/then
      mockMvc
          .perform(get("/test"))
          .andExpect(status().isServiceUnavailable())
          .andExpect(jsonPath("$.status").value(503))
          .andExpect(jsonPath("$.error").value("Service Unavailable"))
          .andExpect(
              jsonPath("$.message").value("Storage connection failed. Please try again later."));
    }
  }

  @Nested
  @DisplayName("General Exception handling")
  class GeneralExceptionTests {

    @Test
    @DisplayName("should return 500 for unexpected errors")
    void shouldReturn500ForUnexpectedErrors() throws Exception {
      // given
      when(testService.doSomething()).thenThrow(new RuntimeException("Unexpected error"));

      // when/then
      mockMvc
          .perform(get("/test"))
          .andExpect(status().isInternalServerError())
          .andExpect(jsonPath("$.status").value(500))
          .andExpect(jsonPath("$.error").value("Internal Server Error"))
          .andExpect(jsonPath("$.message").value("An unexpected error occurred"));
    }
  }

  // Test controller for testing exception handling
  @RestController
  static class TestController {
    private final TestService testService;

    TestController(TestService testService) {
      this.testService = testService;
    }

    @GetMapping("/test")
    public String test() {
      return testService.doSomething();
    }
  }

  // Test service interface
  interface TestService {
    String doSomething();
  }
}
