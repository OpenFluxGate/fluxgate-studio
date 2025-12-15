package org.fluxgate.studio.admin.dto.response;

/** Response DTO for rate limit band. */
public record RateBandResponse(long windowSeconds, long capacity, String label) {}
