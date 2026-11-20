package org.fluxgate.studio.admin.settings;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.fluxgate.studio.admin.exception.InvalidRuleException;

/** Validates the small images used as the console logo and favicon. */
public final class BrandingImages {

  static final Set<String> MEDIA_TYPES =
      Set.of(
          "image/png",
          "image/svg+xml",
          "image/x-icon",
          "image/vnd.microsoft.icon",
          "image/jpeg",
          "image/webp",
          "image/gif");

  private static final Pattern DATA_URL =
      Pattern.compile("^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/]+={0,2})$");

  /** Markers that would let an SVG run script when it is opened directly as a document. */
  private static final String[] SVG_ACTIVE_CONTENT = {
    "<script", "javascript:", "<foreignobject", "<iframe", "<embed", "<object"
  };

  private static final Pattern SVG_EVENT_HANDLER = Pattern.compile("\\son[a-z]+\\s*=");

  private BrandingImages() {}

  /**
   * Checks one image and describes it for the audit log.
   *
   * @param field request field name used in the error message
   * @param dataUrl base64 data URL
   * @param maxBytes largest accepted decoded size
   * @return media type, size and a short digest, for example {@code image/png, 3.1 KB, 1a2b3c4d}
   * @throws InvalidRuleException when the value is not an accepted image
   */
  public static String describe(String field, String dataUrl, int maxBytes) {
    if (dataUrl.length() > maxBytes / 3 * 4 + 128) {
      throw tooLarge(field, maxBytes);
    }
    Matcher matcher = DATA_URL.matcher(dataUrl);
    if (!matcher.matches()) {
      throw new InvalidRuleException(field, "must be a base64 image data URL");
    }
    String mediaType = matcher.group(1);
    if (!MEDIA_TYPES.contains(mediaType)) {
      throw new InvalidRuleException(field, "must be a PNG, SVG, ICO, JPEG, WebP or GIF image");
    }
    byte[] bytes;
    try {
      bytes = Base64.getDecoder().decode(matcher.group(2));
    } catch (IllegalArgumentException e) {
      throw new InvalidRuleException(field, "is not valid base64");
    }
    if (bytes.length == 0) {
      throw new InvalidRuleException(field, "is empty");
    }
    if (bytes.length > maxBytes) {
      throw tooLarge(field, maxBytes);
    }
    if ("image/svg+xml".equals(mediaType) && hasActiveContent(bytes)) {
      throw new InvalidRuleException(field, "must not contain scripts or event handlers");
    }
    return String.format(
        Locale.ROOT, "%s, %.1f KB, %s", mediaType, bytes.length / 1024.0, digest(bytes));
  }

  private static boolean hasActiveContent(byte[] bytes) {
    String text = new String(bytes, StandardCharsets.UTF_8).toLowerCase(Locale.ROOT);
    for (String marker : SVG_ACTIVE_CONTENT) {
      if (text.contains(marker)) {
        return true;
      }
    }
    return SVG_EVENT_HANDLER.matcher(text).find();
  }

  private static InvalidRuleException tooLarge(String field, int maxBytes) {
    return new InvalidRuleException(field, "must be " + maxBytes / 1024 + " KB or smaller");
  }

  private static String digest(byte[] bytes) {
    try {
      byte[] hash = MessageDigest.getInstance("SHA-256").digest(bytes);
      return HexFormat.of().formatHex(hash, 0, 4);
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException("SHA-256 is always available", e);
    }
  }
}
