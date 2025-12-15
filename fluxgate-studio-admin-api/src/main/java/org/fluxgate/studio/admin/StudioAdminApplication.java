package org.fluxgate.studio.admin;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/** Main application class for FluxGate Studio Admin API. */
@SpringBootApplication
public class StudioAdminApplication {

  public static void main(String[] args) {
    SpringApplication.run(StudioAdminApplication.class, args);
  }
}
