package org.fluxgate.studio.admin.config;

import static org.assertj.core.api.Assertions.assertThat;

import io.swagger.v3.oas.models.OpenAPI;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class OpenApiConfigTest {

  @Test
  @DisplayName("should describe the Studio Admin API")
  void shouldDescribeTheApi() {
    OpenAPI openApi = new OpenApiConfig().openApi();

    assertThat(openApi.getInfo().getTitle()).isEqualTo("FluxGate Studio Admin API");
    assertThat(openApi.getInfo().getLicense().getName()).isEqualTo("MIT License");
  }
}
