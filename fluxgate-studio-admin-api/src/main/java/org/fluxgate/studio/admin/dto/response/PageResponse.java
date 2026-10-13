package org.fluxgate.studio.admin.dto.response;

import java.util.List;

/**
 * Page envelope returned when {@code page} or {@code size} query parameters are supplied.
 *
 * @param <T> the element type
 */
public record PageResponse<T>(List<T> content, int page, int size, long totalElements) {}
