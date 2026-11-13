package org.fluxgate.studio.admin.validation;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;
import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Validates that a {@code String} matches the name of one of the constants of the given enum.
 *
 * <p>The accepted values are derived from {@link #enumClass()} at validation time, so the API
 * contract follows the enum declaration instead of duplicating its constants in a regular
 * expression.
 */
@Documented
@Constraint(validatedBy = EnumValueValidator.class)
@Target({ElementType.FIELD, ElementType.METHOD, ElementType.PARAMETER, ElementType.ANNOTATION_TYPE})
@Retention(RetentionPolicy.RUNTIME)
public @interface EnumValue {

  /**
   * The enum whose constant names are accepted.
   *
   * @return the enum class
   */
  Class<? extends Enum<?>> enumClass();

  /**
   * Message used when the value is not a constant of {@link #enumClass()}. When left empty the
   * validator generates a message listing the accepted values.
   *
   * @return the message template
   */
  String message() default "";

  /**
   * Validation groups.
   *
   * @return the groups
   */
  Class<?>[] groups() default {};

  /**
   * Validation payload.
   *
   * @return the payload
   */
  Class<? extends Payload>[] payload() default {};
}
