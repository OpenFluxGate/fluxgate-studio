package org.fluxgate.studio.admin.monitoring;

import java.util.List;

public record TimeseriesResponse(
    String window, long from, long to, long bucketMillis, List<Bucket> buckets) {}
