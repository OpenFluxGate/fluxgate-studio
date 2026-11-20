package org.fluxgate.studio.admin.audit;

import java.time.Instant;

public record AuditQuery(
    AuditAction action, String actor, String text, Instant from, Instant to, int page, int size) {}
