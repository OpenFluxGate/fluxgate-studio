package org.fluxgate.studio.admin.monitoring;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import org.fluxgate.studio.admin.exception.InvalidRuleException;

/** How a typed key is turned into the key services stored. */
public enum KeyTransform {
  NONE("none") {
    @Override
    public String apply(String value) {
      return value;
    }
  },
  SHA256("sha256") {
    @Override
    public String apply(String value) {
      try {
        return HexFormat.of()
            .formatHex(
                MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
      } catch (NoSuchAlgorithmException e) {
        throw new IllegalStateException("SHA-256 is unavailable", e);
      }
    }
  };

  private final String code;

  KeyTransform(String code) {
    this.code = code;
  }

  public String code() {
    return code;
  }

  public abstract String apply(String value);

  public static KeyTransform parse(String code, List<String> enabled) {
    for (KeyTransform transform : values()) {
      if (transform.code.equals(code) && enabled.contains(transform.code)) {
        return transform;
      }
    }
    throw new InvalidRuleException("transform", "must be one of: " + String.join(", ", enabled));
  }
}
