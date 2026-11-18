package org.fluxgate.studio.admin.config;

import org.fluxgate.spring.autoconfigure.FluxgateMongoClientHolder;
import org.fluxgate.studio.admin.controller.MenuAccessInterceptor;
import org.fluxgate.studio.admin.settings.MenuPolicyService;
import org.fluxgate.studio.admin.settings.MongoSettingsStore;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.handler.MappedInterceptor;

@Configuration
public class SettingsConfig {

  @Bean
  public MappedInterceptor menuAccessInterceptor(MenuPolicyService policies) {
    return new MappedInterceptor(new String[] {"/api/**"}, new MenuAccessInterceptor(policies));
  }

  @Bean
  public MongoSettingsStore mongoSettingsStore(
      ObjectProvider<FluxgateMongoClientHolder> clients,
      @Value("${fluxgate.mongo.database:fluxgate}") String database,
      @Value("${fluxgate.studio.settings.collection:studio_settings}") String collection) {
    return new MongoSettingsStore(MonitoringConfig.collection(clients, database, collection));
  }
}
