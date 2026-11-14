package org.fluxgate.studio.admin.audit;

import java.time.Instant;
import java.util.Map;

public record AuditEntry(
    String id,
    Instant at,
    AuditActor actor,
    AuditAction action,
    Map<String, Object> target,
    Map<String, Object> before,
    Map<String, Object> after,
    Map<String, Object> detail) {}
