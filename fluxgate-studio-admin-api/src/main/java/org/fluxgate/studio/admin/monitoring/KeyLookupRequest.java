package org.fluxgate.studio.admin.monitoring;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record KeyLookupRequest(
    @NotBlank @Size(max = 512) String value, @NotBlank String transform, @NotBlank String window) {}
