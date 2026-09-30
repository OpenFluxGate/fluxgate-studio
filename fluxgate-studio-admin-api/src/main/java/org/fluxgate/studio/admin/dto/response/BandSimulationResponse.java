package org.fluxgate.studio.admin.dto.response;

/** Per band outcome of a rate limit dry-run. */
public record BandSimulationResponse(
    String label,
    long windowSeconds,
    long capacity,
    long available,
    long consumed,
    long remaining,
    boolean exceeded) {}
