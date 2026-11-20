package org.fluxgate.studio.admin.monitoring;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class KeyMaskerTest {

  @Test
  void keepsTwoCharactersOnEachSide() {
    assertThat(KeyMasker.mask("123456789")).isEqualTo("12****89");
    assertThat(KeyMasker.mask("abcde")).isEqualTo("ab****de");
  }

  @Test
  void hidesShortKeysCompletely() {
    assertThat(KeyMasker.mask("abcd")).isEqualTo("****");
    assertThat(KeyMasker.mask("")).isEqualTo("****");
    assertThat(KeyMasker.mask(null)).isNull();
  }
}
