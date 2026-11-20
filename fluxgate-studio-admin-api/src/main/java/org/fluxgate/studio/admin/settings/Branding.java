package org.fluxgate.studio.admin.settings;

/**
 * Console logo and favicon chosen by an administrator.
 *
 * <p>Both images are base64 data URLs. A null image means the built in default is used. {@code
 * version} is the time of the last change in epoch milliseconds, so clients can bust caches.
 */
public record Branding(String logo, String favicon, Long version, String updatedBy) {

  public static final Branding DEFAULT = new Branding(null, null, null, null);
}
