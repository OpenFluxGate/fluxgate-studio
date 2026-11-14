package org.fluxgate.studio.admin.config;

import com.mongodb.client.MongoCollection;
import java.time.Clock;
import org.bson.Document;
import org.fluxgate.spring.autoconfigure.FluxgateMongoClientHolder;
import org.fluxgate.studio.admin.audit.AuditProperties;
import org.fluxgate.studio.admin.audit.MongoAuditStore;
import org.fluxgate.studio.admin.monitoring.MongoEventStore;
import org.fluxgate.studio.admin.monitoring.MonitoringProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties({MonitoringProperties.class, AuditProperties.class})
public class MonitoringConfig {

  private static final Logger log = LoggerFactory.getLogger(MonitoringConfig.class);

  @Bean
  public Clock studioClock() {
    return Clock.systemUTC();
  }

  @Bean
  public MongoEventStore mongoEventStore(
      ObjectProvider<FluxgateMongoClientHolder> clients,
      @Value("${fluxgate.mongo.database:fluxgate}") String ruleDatabase,
      MonitoringProperties properties) {
    String database =
        properties.eventDatabase() == null || properties.eventDatabase().isBlank()
            ? ruleDatabase
            : properties.eventDatabase();
    return new MongoEventStore(
        collection(clients, database, properties.eventCollection()), properties.queryTimeout());
  }

  @Bean
  public MongoAuditStore mongoAuditStore(
      ObjectProvider<FluxgateMongoClientHolder> clients,
      @Value("${fluxgate.mongo.database:fluxgate}") String database,
      AuditProperties properties) {
    return new MongoAuditStore(
        collection(clients, database, properties.collection()), properties.retention());
  }

  @Bean
  public ApplicationRunner monitoringIndexes(
      MongoEventStore events, MongoAuditStore audit, MonitoringProperties properties) {
    return args -> {
      if (properties.createIndexes()) {
        ensure("Event history", events::ensureIndexes);
      } else {
        log.info("Event history index creation is disabled");
      }
      ensure("Audit log", audit::ensureIndexes);
    };
  }

  static MongoCollection<Document> collection(
      ObjectProvider<FluxgateMongoClientHolder> clients, String database, String name) {
    FluxgateMongoClientHolder holder = clients.getIfAvailable();
    return holder == null ? null : holder.getClient().getDatabase(database).getCollection(name);
  }

  private static void ensure(String what, Runnable action) {
    try {
      action.run();
      log.info("{} indexes are in place", what);
    } catch (RuntimeException e) {
      log.warn(
          "{} indexes were not created. Queries still work but may be slow. Reason: {}",
          what,
          e.getMessage());
    }
  }
}
