package org.fluxgate.studio.admin.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.fluxgate.studio.admin.exception.StorageConnectionException;
import org.fluxgate.studio.admin.settings.MongoSettingsStore;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

class SettingsConfigTest {

  @Test
  void wiresTheStoreWithoutAMongoConnection() {
    new ApplicationContextRunner()
        .withUserConfiguration(SettingsConfig.class)
        .run(
            context -> {
              assertThat(context).hasNotFailed();
              assertThatThrownBy(() -> context.getBean(MongoSettingsStore.class).branding())
                  .isInstanceOf(StorageConnectionException.class);
            });
  }
}
