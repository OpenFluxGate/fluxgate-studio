package org.fluxgate.studio.admin.exception;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

class ExceptionTest {

  @Nested
  @DisplayName("RuleNotFoundException")
  class RuleNotFoundExceptionTests {

    @Test
    @DisplayName("should create exception with rule id")
    void shouldCreateExceptionWithRuleId() {
      // when
      RuleNotFoundException ex = new RuleNotFoundException("test-rule");

      // then
      assertThat(ex.getRuleId()).isEqualTo("test-rule");
      assertThat(ex.getMessage()).contains("test-rule");
      assertThat(ex.isRetryable()).isFalse();
    }
  }

  @Nested
  @DisplayName("RuleAlreadyExistsException")
  class RuleAlreadyExistsExceptionTests {

    @Test
    @DisplayName("should create exception with rule id")
    void shouldCreateExceptionWithRuleId() {
      // when
      RuleAlreadyExistsException ex = new RuleAlreadyExistsException("existing-rule");

      // then
      assertThat(ex.getRuleId()).isEqualTo("existing-rule");
      assertThat(ex.getMessage()).contains("existing-rule");
      assertThat(ex.isRetryable()).isFalse();
    }
  }

  @Nested
  @DisplayName("InvalidRuleException")
  class InvalidRuleExceptionTests {

    @Test
    @DisplayName("should create exception with message")
    void shouldCreateExceptionWithMessage() {
      // when
      InvalidRuleException ex = new InvalidRuleException("Invalid rule configuration");

      // then
      assertThat(ex.getMessage()).isEqualTo("Invalid rule configuration");
      assertThat(ex.isRetryable()).isFalse();
      assertThat(ex.getField()).isNull();
    }

    @Test
    @DisplayName("should create exception with field and message")
    void shouldCreateExceptionWithFieldAndMessage() {
      // when
      InvalidRuleException ex = new InvalidRuleException("ruleId", "cannot be empty");

      // then
      assertThat(ex.getField()).isEqualTo("ruleId");
      assertThat(ex.getMessage()).contains("ruleId").contains("cannot be empty");
      assertThat(ex.isRetryable()).isFalse();
    }
  }

  @Nested
  @DisplayName("StorageConnectionException")
  class StorageConnectionExceptionTests {

    @Test
    @DisplayName("should create exception with storage type and message")
    void shouldCreateExceptionWithStorageTypeAndMessage() {
      // when
      StorageConnectionException ex =
          new StorageConnectionException("MongoDB", "Connection refused");

      // then
      assertThat(ex.getStorageType()).isEqualTo("MongoDB");
      assertThat(ex.getMessage()).contains("MongoDB").contains("Connection refused");
      assertThat(ex.isRetryable()).isTrue();
    }

    @Test
    @DisplayName("should create exception with cause")
    void shouldCreateExceptionWithCause() {
      // given
      RuntimeException cause = new RuntimeException("Network error");

      // when
      StorageConnectionException ex =
          new StorageConnectionException("Redis", "Connection failed", cause);

      // then
      assertThat(ex.getStorageType()).isEqualTo("Redis");
      assertThat(ex.getCause()).isEqualTo(cause);
      assertThat(ex.isRetryable()).isTrue();
    }
  }

  @Nested
  @DisplayName("StorageOperationException")
  class StorageOperationExceptionTests {

    @Test
    @DisplayName("should create exception with operation and message")
    void shouldCreateExceptionWithOperationAndMessage() {
      // when
      StorageOperationException ex = new StorageOperationException("save", "Duplicate key");

      // then
      assertThat(ex.getOperation()).isEqualTo("save");
      assertThat(ex.getMessage()).contains("save").contains("Duplicate key");
      assertThat(ex.isRetryable()).isTrue();
    }

    @Test
    @DisplayName("should create exception with cause")
    void shouldCreateExceptionWithCause() {
      // given
      RuntimeException cause = new RuntimeException("Database error");

      // when
      StorageOperationException ex =
          new StorageOperationException("delete", "Operation failed", cause);

      // then
      assertThat(ex.getOperation()).isEqualTo("delete");
      assertThat(ex.getCause()).isEqualTo(cause);
    }
  }
}
