package org.fluxgate.studio.admin.validation;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import java.util.Set;
import org.fluxgate.core.config.LimitScope;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class EnumValueValidatorTest {

  private static ValidatorFactory factory;
  private static Validator validator;

  @BeforeAll
  static void setUp() {
    factory = Validation.buildDefaultValidatorFactory();
    validator = factory.getValidator();
  }

  @AfterAll
  static void tearDown() {
    factory.close();
  }

  /** Test fixture exercising the constraint on a record component. */
  record Holder(@EnumValue(enumClass = LimitScope.class) String scope) {}

  /** Test fixture exercising a caller supplied message. */
  record CustomMessageHolder(
      @EnumValue(enumClass = LimitScope.class, message = "bad scope") String scope) {}

  @Test
  @DisplayName("should accept every enum constant name")
  void shouldAcceptEveryEnumConstantName() {
    for (LimitScope scope : LimitScope.values()) {
      assertThat(validator.validate(new Holder(scope.name()))).isEmpty();
    }
  }

  @Test
  @DisplayName("should reject an unknown value and list the accepted ones")
  void shouldRejectUnknownValue() {
    Set<ConstraintViolation<Holder>> violations = validator.validate(new Holder("PER_GALAXY"));

    assertThat(violations).hasSize(1);
    assertThat(violations.iterator().next().getMessage())
        .isEqualTo("must be one of: GLOBAL, PER_API_KEY, PER_USER, PER_IP, CUSTOM");
  }

  @Test
  @DisplayName("should keep a caller supplied message")
  void shouldKeepCallerSuppliedMessage() {
    Set<ConstraintViolation<CustomMessageHolder>> violations =
        validator.validate(new CustomMessageHolder("PER_GALAXY"));

    assertThat(violations).hasSize(1);
    assertThat(violations.iterator().next().getMessage()).isEqualTo("bad scope");
  }

  @Test
  @DisplayName("should leave null and blank handling to @NotBlank")
  void shouldIgnoreNullAndBlank() {
    assertThat(validator.validate(new Holder(null))).isEmpty();
    assertThat(validator.validate(new Holder("  "))).isEmpty();
  }

  @Test
  @DisplayName("should derive the accepted values from the enum")
  void shouldDeriveAcceptedValuesFromEnum() throws NoSuchFieldException {
    EnumValueValidator validatorUnderTest = new EnumValueValidator();
    validatorUnderTest.initialize(
        Holder.class.getDeclaredField("scope").getAnnotation(EnumValue.class));

    assertThat(validatorUnderTest.getAcceptedValues())
        .containsExactly("GLOBAL", "PER_API_KEY", "PER_USER", "PER_IP", "CUSTOM");
  }
}
