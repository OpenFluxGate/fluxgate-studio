package org.fluxgate.studio.admin.config;

import com.mongodb.client.MongoDatabase;
import org.fluxgate.adapter.mongo.policy.MongoPolicyRepository;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class PolicyRepositoryConfig {
  @Bean
  @ConditionalOnProperty(name = "fluxgate.mongo.enabled", havingValue = "true")
  public MongoPolicyRepository mongoPolicyRepository(
      @Qualifier("fluxgateMongoDatabase") MongoDatabase database,
      @Value("${fluxgate.mongo.rule-collection:rate_limit_rules}") String collection) {
    return new MongoPolicyRepository(database, collection);
  }
}
