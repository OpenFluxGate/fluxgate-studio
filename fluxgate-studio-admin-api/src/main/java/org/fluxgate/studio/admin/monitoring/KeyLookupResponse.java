package org.fluxgate.studio.admin.monitoring;

import java.util.List;

public record KeyLookupResponse(
    String key,
    String transform,
    String window,
    long from,
    long to,
    long bucketMillis,
    List<KeyRuleSetStatus> ruleSets,
    List<Bucket> buckets,
    List<KeyDecision> recent) {}
