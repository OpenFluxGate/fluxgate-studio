package org.fluxgate.studio.admin.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.mongodb.client.MongoCollection;
import org.bson.Document;
import org.fluxgate.core.spi.RateLimitRuleRepository;
import org.fluxgate.studio.admin.repository.DelegatingStudioRuleRepository;
import org.fluxgate.studio.admin.repository.MongoStudioRuleRepository;
import org.fluxgate.studio.admin.repository.StudioRuleRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;

class StudioRepositoryConfigTest {

  private final StudioRepositoryConfig config = new StudioRepositoryConfig();

  @Test
  @DisplayName("should select the MongoDB repository when the rule collection is available")
  @SuppressWarnings("unchecked")
  void shouldSelectMongoRepository() {
    // given
    ObjectProvider<MongoCollection<Document>> provider = mock(ObjectProvider.class);
    when(provider.getIfAvailable()).thenReturn(mock(MongoCollection.class));

    // when
    StudioRuleRepository repository =
        config.studioRuleRepository(provider, mock(RateLimitRuleRepository.class));

    // then
    assertThat(repository).isInstanceOf(MongoStudioRuleRepository.class);
  }

  @Test
  @DisplayName("should fall back to the core SPI when no rule collection exists")
  @SuppressWarnings("unchecked")
  void shouldFallBackToCoreSpi() {
    // given
    ObjectProvider<MongoCollection<Document>> provider = mock(ObjectProvider.class);
    when(provider.getIfAvailable()).thenReturn(null);

    // when
    StudioRuleRepository repository =
        config.studioRuleRepository(provider, mock(RateLimitRuleRepository.class));

    // then
    assertThat(repository).isInstanceOf(DelegatingStudioRuleRepository.class);
  }
}
