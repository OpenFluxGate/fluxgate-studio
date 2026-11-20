package org.fluxgate.studio.admin.monitoring;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import org.fluxgate.studio.admin.exception.InvalidRuleException;
import org.junit.jupiter.api.Test;

class KeyTransformTest {

  @Test
  void hashesWithLowercaseSha256() {
    assertThat(KeyTransform.SHA256.apply("abc"))
        .isEqualTo("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    assertThat(KeyTransform.NONE.apply("abc")).isEqualTo("abc");
  }

  @Test
  void acceptsOnlyEnabledTransforms() {
    assertThat(KeyTransform.parse("sha256", List.of("none", "sha256")))
        .isEqualTo(KeyTransform.SHA256);
    assertThatThrownBy(() -> KeyTransform.parse("sha256", List.of("none")))
        .isInstanceOf(InvalidRuleException.class)
        .hasMessageContaining("must be one of: none");
  }
}
