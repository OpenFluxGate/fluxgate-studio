package org.fluxgate.studio.admin.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * Request DTO for importing a batch of rate limit rules.
 *
 * <p>Every entry is validated with the same constraints as a single rule creation. Existing rules
 * are replaced (upsert), unknown rules are created. The batch is capped at {@value #MAX_BATCH_SIZE}
 * rules so that a single admin request cannot turn into an unbounded write loop.
 */
public record ImportRulesRequest(
    @NotEmpty(message = "rules must not be empty")
        @Size(max = 500, message = "import batch must not exceed 500 rules")
        @Valid
        List<CreateRuleRequest> rules) {

  /** Maximum number of rules a single import request may carry. */
  public static final int MAX_BATCH_SIZE = 500;
}
