package org.fluxgate.studio.admin.audit;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties(prefix = "fluxgate.studio.audit")
public record AuditProperties(
    @DefaultValue("studio_audit_log") String collection,
    @DefaultValue("730d") Duration retention) {}
