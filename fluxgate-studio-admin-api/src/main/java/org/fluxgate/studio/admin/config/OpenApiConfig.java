package org.fluxgate.studio.admin.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.info.License;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** OpenAPI configuration for Swagger documentation. */
@Configuration
public class OpenApiConfig {

  @Bean
  public OpenAPI openApi() {
    return new OpenAPI()
        .info(
            new Info()
                .title("FluxGate Studio Admin API")
                .description("Admin API for FluxGate Studio - Rate Limit Management")
                .version("0.0.1-SNAPSHOT")
                .contact(new Contact().name("OpenFluxGate").url("https://github.com/OpenFluxGate"))
                .license(
                    new License().name("MIT License").url("https://opensource.org/licenses/MIT")));
  }
}
