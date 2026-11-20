package org.fluxgate.studio.admin.settings;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import org.fluxgate.studio.admin.exception.InvalidRuleException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class BrandingImagesTest {

  static String dataUrl(String type, byte[] bytes) {
    return "data:" + type + ";base64," + Base64.getEncoder().encodeToString(bytes);
  }

  static String svg(String body) {
    return dataUrl("image/svg+xml", body.getBytes(StandardCharsets.UTF_8));
  }

  @Test
  void describesAnAcceptedImage() {
    String description =
        BrandingImages.describe("logo", dataUrl("image/png", new byte[2048]), 4096);

    assertThat(description).startsWith("image/png, 2.0 KB, ").hasSize(27);
  }

  @Test
  void acceptsAPlainSvg() {
    assertThat(
            BrandingImages.describe(
                "logo", svg("<svg xmlns='http://www.w3.org/2000/svg'><rect/></svg>"), 4096))
        .startsWith("image/svg+xml");
  }

  @Test
  void rejectsSomethingThatIsNotADataUrl() {
    assertThatThrownBy(() -> BrandingImages.describe("logo", "https://example.com/a.png", 4096))
        .isInstanceOf(InvalidRuleException.class)
        .hasMessageContaining("data URL");
  }

  @Test
  void rejectsOtherMediaTypes() {
    assertThatThrownBy(
            () -> BrandingImages.describe("logo", dataUrl("text/html", new byte[] {1}), 4096))
        .hasMessageContaining("PNG, SVG");
  }

  @Test
  void rejectsEmptyAndOversizedImages() {
    assertThatThrownBy(() -> BrandingImages.describe("favicon", "data:image/png;base64,", 4096))
        .isInstanceOf(InvalidRuleException.class);
    assertThatThrownBy(
            () -> BrandingImages.describe("favicon", dataUrl("image/png", new byte[5000]), 4096))
        .hasMessageContaining("4 KB or smaller");
    assertThatThrownBy(
            () -> BrandingImages.describe("favicon", dataUrl("image/png", new byte[20000]), 4096))
        .hasMessageContaining("4 KB or smaller");
  }

  @Test
  void rejectsBrokenBase64() {
    assertThatThrownBy(() -> BrandingImages.describe("logo", "data:image/png;base64,a", 4096))
        .hasMessageContaining("base64");
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "<svg><script>alert(1)</script></svg>",
        "<svg><a href='javascript:alert(1)'/></svg>",
        "<svg onload='alert(1)'></svg>",
        "<svg><foreignObject><div/></foreignObject></svg>"
      })
  void rejectsSvgWithActiveContent(String body) {
    assertThatThrownBy(() -> BrandingImages.describe("logo", svg(body), 4096))
        .hasMessageContaining("scripts");
  }
}
