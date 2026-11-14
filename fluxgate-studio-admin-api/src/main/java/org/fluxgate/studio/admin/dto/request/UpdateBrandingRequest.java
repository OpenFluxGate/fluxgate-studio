package org.fluxgate.studio.admin.dto.request;

import io.swagger.v3.oas.annotations.media.Schema;

/** New console images. Each is a base64 image data URL, or null to restore the default. */
public record UpdateBrandingRequest(
    @Schema(description = "Logo shown at the top left, up to 128 KB", nullable = true) String logo,
    @Schema(description = "Browser tab icon, up to 64 KB", nullable = true) String favicon) {}
