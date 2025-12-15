package org.fluxgate.studio.admin.dto.request;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/** Request DTO for rate limit band configuration. */
public record RateBandRequest(
    @NotNull(message = "windowSeconds is required")
        @Min(value = 1, message = "windowSeconds must be at least 1")
        Long windowSeconds,
    @NotNull(message = "capacity is required")
        @Min(value = 1, message = "capacity must be at least 1")
        Long capacity,
    String label) {}
