package org.fluxgate.studio.admin.validation;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import java.util.Arrays;
import java.util.List;

/** Validator backing {@link EnumValue}. */
public class EnumValueValidator implements ConstraintValidator<EnumValue, String> {

  private List<String> acceptedValues = List.of();
  private String message = "";

  @Override
  public void initialize(EnumValue constraint) {
    this.acceptedValues =
        Arrays.stream(constraint.enumClass().getEnumConstants()).map(Enum::name).toList();
    this.message = constraint.message();
  }

  @Override
  public boolean isValid(String value, ConstraintValidatorContext context) {
    // Null / blank handling is left to @NotBlank so that a single field does not report twice.
    if (value == null || value.isBlank() || acceptedValues.contains(value)) {
      return true;
    }
    if (message.isEmpty()) {
      context.disableDefaultConstraintViolation();
      context
          .buildConstraintViolationWithTemplate(
              "must be one of: " + String.join(", ", acceptedValues))
          .addConstraintViolation();
    }
    return false;
  }

  /**
   * Returns the accepted enum constant names.
   *
   * @return the accepted values
   */
  public List<String> getAcceptedValues() {
    return acceptedValues;
  }
}
