package org.fluxgate.studio.admin.monitoring;

import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties(prefix = "fluxgate.studio.monitoring")
public record MonitoringProperties(
    @DefaultValue("") String eventDatabase,
    @DefaultValue("rate_limit_events") String eventCollection,
    @DefaultValue("true") boolean createIndexes,
    @DefaultValue("10s") Duration cacheTtl,
    @DefaultValue("5s") Duration queryTimeout,
    @DefaultValue({"none", "sha256"}) List<String> keyTransforms) {}
