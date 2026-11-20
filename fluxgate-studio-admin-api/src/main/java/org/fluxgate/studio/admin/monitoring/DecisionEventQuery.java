package org.fluxgate.studio.admin.monitoring;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import org.bson.types.ObjectId;
import org.fluxgate.studio.admin.exception.InvalidRuleException;

/** Fixed time range and bounded keyset pagination; cursors are not authorization credentials. */
public record DecisionEventQuery(long from, long to, String outcome, int limit, String cursor) {
  public DecisionEventQuery {
    if (from < 0 || to <= from || to - from > 86_400_000L) {
      throw invalid("from/to", "must describe a positive interval of at most 24 hours");
    }
    if (limit < 1 || limit > 100) throw invalid("limit", "must be between 1 and 100");
    if (outcome != null && !outcome.equals("ALLOW") && !outcome.equals("REJECT")) {
      throw invalid("outcome", "must be ALLOW or REJECT");
    }
    if (cursor != null && cursor.length() > 256) throw invalid("cursor", "is invalid");
  }

  public Position position() {
    if (cursor == null) return null;
    try {
      String[] parts =
          new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.US_ASCII)
              .split(":", -1);
      if (parts.length != 6
          || !parts[0].equals("1")
          || Long.parseLong(parts[1]) != from
          || Long.parseLong(parts[2]) != to
          || !parts[3].equals(outcome == null ? "ALL" : outcome)) {
        throw new IllegalArgumentException();
      }
      long timestamp = Long.parseLong(parts[4]);
      if (timestamp < from || timestamp >= to || !ObjectId.isValid(parts[5]))
        throw new IllegalArgumentException();
      return new Position(timestamp, new ObjectId(parts[5]));
    } catch (IllegalArgumentException e) {
      throw invalid("cursor", "is invalid or belongs to different filters");
    }
  }

  public String after(long timestamp, ObjectId id) {
    return Base64.getUrlEncoder()
        .withoutPadding()
        .encodeToString(
            ("1:"
                    + from
                    + ":"
                    + to
                    + ":"
                    + (outcome == null ? "ALL" : outcome)
                    + ":"
                    + timestamp
                    + ":"
                    + id.toHexString())
                .getBytes(StandardCharsets.US_ASCII));
  }

  private static InvalidRuleException invalid(String field, String message) {
    return new InvalidRuleException(field, message);
  }

  public record Position(long timestamp, ObjectId id) {}
}
