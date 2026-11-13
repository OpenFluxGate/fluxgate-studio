package org.fluxgate.studio.admin.dto.response;

import java.util.List;

/**
 * Response DTO for a rate limit dry-run.
 *
 * <p>{@code consumed} and {@code remaining} are reported for the most restrictive band, which is
 * the band that decides whether the burst is admitted.
 */
public record SimulationResponse(
    String ruleId,
    long requests,
    long seconds,
    boolean allowed,
    long consumed,
    long remaining,
    List<BandSimulationResponse> bands) {}
