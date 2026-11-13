package org.fluxgate.studio.admin.dto.response;

/** Response DTO summarising a rule import. */
public record ImportResultResponse(int total, int created, int updated) {}
