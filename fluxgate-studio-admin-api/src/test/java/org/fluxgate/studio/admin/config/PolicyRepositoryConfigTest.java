package org.fluxgate.studio.admin.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

import com.mongodb.client.MongoCollection;
import com.mongodb.client.MongoDatabase;
import org.bson.Document;
import org.fluxgate.adapter.mongo.policy.MongoPolicyRepository;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

class PolicyRepositoryConfigTest {
  @Test
  void usesConfiguredCollectionSuffixes() {
    MongoDatabase db = mock(MongoDatabase.class);
    MongoCollection<Document> collection = mock(MongoCollection.class, RETURNS_SELF);
    when(db.getCollection(anyString())).thenReturn(collection);
    new ApplicationContextRunner()
        .withUserConfiguration(PolicyRepositoryConfig.class)
        .withBean("fluxgateMongoDatabase", MongoDatabase.class, () -> db)
        .withPropertyValues(
            "fluxgate.mongo.enabled=true", "fluxgate.mongo.rule-collection=custom_rules")
        .run(
            context -> {
              assertThat(context).hasSingleBean(MongoPolicyRepository.class);
              verify(db).getCollection("custom_rules_policies");
              verify(db).getCollection("custom_rules_revisions");
            });
  }

  @Test
  void disabledMongoLeavesPublicationUnavailableWithoutDatabaseDependency() {
    new ApplicationContextRunner()
        .withUserConfiguration(PolicyRepositoryConfig.class)
        .withPropertyValues("fluxgate.mongo.enabled=false")
        .run(context -> assertThat(context).doesNotHaveBean(MongoPolicyRepository.class));
  }
}
