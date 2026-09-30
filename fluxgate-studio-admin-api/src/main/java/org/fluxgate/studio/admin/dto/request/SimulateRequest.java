package org.fluxgate.studio.admin.dto.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/** Request DTO for a server side rate limit dry-run. */
public record SimulateRequest(
    @NotNull(message = "requests is required")
        @Min(value = 1, message = "requests must be at least 1")
        @Max(value = 1_000_000, message = "requests must not exceed 1000000")
        Long requests,
    @NotNull(message = "seconds is required")
        @Min(value = 1, message = "seconds must be at least 1")
        @Max(value = 86_400, message = "seconds must not exceed 86400")
        Long seconds) {}
