package org.fluxgate.studio.admin.settings;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import com.mongodb.client.MongoCollection;
import org.bson.Document;
import org.fluxgate.studio.admin.exception.StorageConnectionException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.MongoDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers
class MongoSettingsStoreTest {
  @Container static final MongoDBContainer MONGO = new MongoDBContainer("mongo:7.0");

  private MongoClient client;
  private MongoSettingsStore store;

  @BeforeEach
  void setUp() {
    client = MongoClients.create(MONGO.getReplicaSetUrl());
    MongoCollection<Document> collection =
        client.getDatabase("studio_settings").getCollection("studio_settings");
    collection.drop();
    store = new MongoSettingsStore(collection);
  }

  @AfterEach
  void close() {
    client.close();
  }

  @Test
  void isEmptyUntilSomethingIsSaved() {
    assertThat(store.branding()).isEmpty();
  }

  @Test
  void savesAndReplacesTheBranding() {
    store.saveBranding(new Branding("data:image/png;base64,AA==", null, 10L, "alice"));
    store.saveBranding(new Branding(null, "data:image/png;base64,AQ==", 20L, "bob"));

    assertThat(store.branding())
        .contains(new Branding(null, "data:image/png;base64,AQ==", 20L, "bob"));
  }

  @Test
  void failsClearlyWithoutAMongoConnection() {
    MongoSettingsStore unavailable = new MongoSettingsStore(null);

    assertThatThrownBy(unavailable::branding).isInstanceOf(StorageConnectionException.class);
    assertThatThrownBy(() -> unavailable.saveBranding(Branding.DEFAULT))
        .isInstanceOf(StorageConnectionException.class);
  }
}
