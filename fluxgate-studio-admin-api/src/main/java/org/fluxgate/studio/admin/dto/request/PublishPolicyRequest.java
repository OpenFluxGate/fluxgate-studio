package org.fluxgate.studio.admin.dto.request;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Map;

/** Complete policy generation. Missing rules or ACL are never inferred from mutable drafts. */
public record PublishPolicyRequest(
    @NotNull @Min(0) Long expectedRevision,
    @NotNull
        @Pattern(
            regexp = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")
        String operationId,
    @NotNull @Size(min = 1, max = 500) List<@NotNull Map<String, Object>> rules,
    @NotNull Map<String, Object> accessControl,
    @NotNull Boolean resetCounters,
    @Size(max = 500) String resetReason) {
  @AssertTrue(message = "must supply resetReason when resetting counters")
  public boolean isResetReasonValid() {
    return !Boolean.TRUE.equals(resetCounters) || (resetReason != null && !resetReason.isBlank());
  }

  @JsonAnySetter
  public void rejectUnknownField(String name, Object value) {
    throw new IllegalArgumentException("Unknown publication field");
  }
}
