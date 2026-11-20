package org.fluxgate.studio.admin.monitoring;

public record Bucket(long start, long allowed, long rejected) {}
