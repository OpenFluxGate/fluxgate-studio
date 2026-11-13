package org.fluxgate.studio.admin.dto.request;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import java.util.List;
import java.util.Set;
import java.util.stream.IntStream;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** Bean Validation constraints of {@link ImportRulesRequest}. */
class ImportRulesRequestTest {

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

  private static CreateRuleRequest rule(int index) {
    return new CreateRuleRequest(
        "rule-" + index,
        "Rule " + index,
        true,
        "PER_IP",
        "ip",
        "REJECT_REQUEST",
        List.of(new RateBandRequest(60L, 100L, null)),
        "test-ruleset",
        null,
        null);
  }

  private static ImportRulesRequest batchOf(int size) {
    return new ImportRulesRequest(
        IntStream.range(0, size).mapToObj(ImportRulesRequestTest::rule).toList());
  }

  @Test
  @DisplayName("should reject an empty batch")
  void shouldRejectEmptyBatch() {
    // when
    Set<ConstraintViolation<ImportRulesRequest>> violations =
        validator.validate(new ImportRulesRequest(List.of()));

    // then
    assertThat(violations)
        .extracting(ConstraintViolation::getMessage)
        .contains("rules must not be empty");
  }

  @Test
  @DisplayName("should accept a batch at the maximum size")
  void shouldAcceptBatchAtMaximumSize() {
    // when
    Set<ConstraintViolation<ImportRulesRequest>> violations =
        validator.validate(batchOf(ImportRulesRequest.MAX_BATCH_SIZE));

    // then
    assertThat(violations).isEmpty();
  }

  @Test
  @DisplayName("should reject a batch above the maximum size")
  void shouldRejectBatchAboveMaximumSize() {
    // when
    Set<ConstraintViolation<ImportRulesRequest>> violations =
        validator.validate(batchOf(ImportRulesRequest.MAX_BATCH_SIZE + 1));

    // then
    assertThat(violations)
        .extracting(ConstraintViolation::getMessage)
        .contains("import batch must not exceed 500 rules");
  }
}
