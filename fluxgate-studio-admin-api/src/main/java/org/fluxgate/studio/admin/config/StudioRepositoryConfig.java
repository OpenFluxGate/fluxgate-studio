package org.fluxgate.studio.admin.config;

import com.mongodb.client.MongoCollection;
import org.bson.Document;
import org.fluxgate.core.spi.RateLimitRuleRepository;
import org.fluxgate.studio.admin.repository.DelegatingStudioRuleRepository;
import org.fluxgate.studio.admin.repository.MongoStudioRuleRepository;
import org.fluxgate.studio.admin.repository.StudioRuleRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Wires the {@link StudioRuleRepository} implementation that matches the active rule storage. */
@Configuration
public class StudioRepositoryConfig {

  private static final Logger log = LoggerFactory.getLogger(StudioRepositoryConfig.class);

  /**
   * Selects the MongoDB backed repository when the FluxGate rule collection is available, and falls
   * back to the core SPI otherwise.
   *
   * @param ruleCollection provider for the FluxGate rule collection
   * @param ruleRepository the core rule repository SPI
   * @return the Studio rule repository
   */
  @Bean
  public StudioRuleRepository studioRuleRepository(
      @Qualifier("fluxgateRuleCollection") ObjectProvider<MongoCollection<Document>> ruleCollection,
      RateLimitRuleRepository ruleRepository) {
    MongoCollection<Document> collection = ruleCollection.getIfAvailable();
    if (collection != null) {
      log.info("Using MongoStudioRuleRepository (server side paging and counters)");
      return new MongoStudioRuleRepository(collection);
    }
    log.info("Using DelegatingStudioRuleRepository (in-memory paging and counters)");
    return new DelegatingStudioRuleRepository(ruleRepository);
  }
}
