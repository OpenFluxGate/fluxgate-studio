package org.fluxgate.studio.admin.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

import com.mongodb.WriteConcern;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoCollection;
import com.mongodb.client.MongoDatabase;
import org.bson.Document;
import org.fluxgate.adapter.mongo.policy.MongoPolicyRepository;
import org.fluxgate.spring.autoconfigure.FluxgateMongoAutoConfiguration;
import org.fluxgate.spring.autoconfigure.FluxgateMongoClientHolder;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

class LtsMongoPolicyWiringTest {
  @Test
  void publicationUsesOwnedFluxgateDatabaseWithoutReplacingApplicationClient() {
    MongoClient applicationClient = mock(MongoClient.class);
    MongoClient fluxgateClient = mock(MongoClient.class);
    MongoDatabase database = database(fluxgateClient);
    runner(applicationClient)
        .withBean(
            "fluxgateMongoClientHolder",
            FluxgateMongoClientHolder.class,
            () -> new FluxgateMongoClientHolder(fluxgateClient, true),
            definition -> definition.setDestroyMethodName("close"))
        .run(
            context -> {
              assertThat(context).hasNotFailed();
              assertThat(context).hasSingleBean(MongoPolicyRepository.class);
              assertThat(context).hasSingleBean(MongoClient.class);
              assertThat(context.getBean(MongoClient.class)).isSameAs(applicationClient);
              assertThat(context.getBean("fluxgateMongoDatabase")).isSameAs(database);
              assertThat(context.getBean(FluxgateMongoClientHolder.class).isOwned()).isTrue();
              verify(database).getCollection("custom_rules_policies");
              verify(database).getCollection("custom_rules_revisions");
              verifyNoInteractions(applicationClient);
            });
    verify(fluxgateClient).close();
    verify(applicationClient, never()).close();
  }

  @Test
  void legacyFluxgateClientIsBorrowedAndPublicationStillUsesItsDatabase() {
    MongoClient applicationClient = mock(MongoClient.class);
    MongoClient legacyClient = mock(MongoClient.class);
    MongoDatabase database = database(legacyClient);
    runner(applicationClient)
        .withBean(
            "fluxgateMongoClient",
            MongoClient.class,
            () -> legacyClient,
            definition -> definition.setDestroyMethodName(""))
        .run(
            context -> {
              assertThat(context).hasNotFailed();
              assertThat(context).hasSingleBean(MongoPolicyRepository.class);
              FluxgateMongoClientHolder holder = context.getBean(FluxgateMongoClientHolder.class);
              assertThat(holder.getClient()).isSameAs(legacyClient);
              assertThat(holder.isOwned()).isFalse();
              assertThat(context.getBean("fluxgateMongoDatabase")).isSameAs(database);
              verify(database).getCollection("custom_rules_policies");
              verify(database).getCollection("custom_rules_revisions");
              verifyNoInteractions(applicationClient);
            });
    verify(legacyClient, never()).close();
    verify(applicationClient, never()).close();
  }

  private ApplicationContextRunner runner(MongoClient applicationClient) {
    MongoCollection<Document> rules = mock(MongoCollection.class);
    return new ApplicationContextRunner()
        .withConfiguration(AutoConfigurations.of(FluxgateMongoAutoConfiguration.class))
        .withUserConfiguration(PolicyRepositoryConfig.class)
        .withBean(
            "applicationMongoClient",
            MongoClient.class,
            () -> applicationClient,
            definition -> definition.setDestroyMethodName(""))
        .withBean("fluxgateRuleCollection", MongoCollection.class, () -> rules)
        .withPropertyValues(
            "fluxgate.mongo.enabled=true",
            "fluxgate.mongo.database=policy_db",
            "fluxgate.mongo.rule-collection=custom_rules");
  }

  private MongoDatabase database(MongoClient client) {
    MongoDatabase database = mock(MongoDatabase.class);
    MongoCollection<Document> collection = mock(MongoCollection.class, RETURNS_SELF);
    when(client.getDatabase("policy_db")).thenReturn(database);
    when(database.getCollection(anyString())).thenReturn(collection);
    when(database.getWriteConcern()).thenReturn(WriteConcern.ACKNOWLEDGED);
    return database;
  }
}
