package org.fluxgate.redis;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.List;
import org.fluxgate.core.config.*;
import org.fluxgate.core.context.RequestContext;
import org.fluxgate.core.key.LimitScopeKeyResolver;
import org.fluxgate.core.ratelimiter.RateLimitRuleSet;
import org.fluxgate.core.reload.*;
import org.fluxgate.redis.config.RedisRateLimiterConfig;
import org.fluxgate.spring.reload.handler.RedisBucketResetHandler;
import org.junit.jupiter.api.Test;

class RuleReapplyProbeTest {
  private RateLimitRuleSet rules(String id) {
    return RateLimitRuleSet.builder(id)
        .rules(
            List.of(
                RateLimitRule.builder("r1")
                    .scope(LimitScope.PER_IP)
                    .keyStrategyId("clientIp")
                    .ruleSetId(id)
                    .addBand(RateLimitBand.builder(Duration.ofHours(1), 3).label("hour").build())
                    .build()))
        .keyResolver(new LimitScopeKeyResolver())
        .build();
  }

  @Test
  void reapplyAndReloadRealRedis() {
    assertThat(System.getProperty("fluxgate.probe.disposable"))
        .as("Only a disposable Redis fixture may run full reload")
        .isEqualTo("true");
    String uri = System.getProperty("fluxgate.probe.uri", "");
    assertThat(uri).matches("redis://127\\.0\\.0\\.1:[0-9]{1,5}");
    String token = System.getProperty("fluxgate.probe.token", "");
    assertThat(token).matches("[0-9a-f-]{36}");
    try (RedisRateLimiterConfig config = new RedisRateLimiterConfig(uri)) {
      assertThat(config.getConnectionProvider().hgetall("dot:compat:fixture").get("token"))
          .as("Missing disposable fixture marker; refuse all bucket writes/resets")
          .isEqualTo(token);
      RedisRateLimiter limiter = new RedisRateLimiter(config.getTokenBucketStore());
      String id = "dot-reapply-20261117";
      config.getTokenBucketStore().deleteBucketsByRuleSetId(id);
      config.getTokenBucketStore().deleteBucketsByRuleSetId("dot-reapply-other-20261117");
      RequestContext request = RequestContext.builder().clientIp("192.0.2.1").build();
      for (int i = 0; i < 3; i++)
        assertThat(limiter.tryConsume(request, rules(id), 1).isAllowed()).isTrue();
      assertThat(limiter.tryConsume(request, rules(id), 1).isAllowed()).isFalse();
      System.out.println(
          "PROBE identical rule reconstructed/reapplied: exhausted bucket preserved");
      String other = "dot-reapply-other-20261117";
      for (int i = 0; i < 3; i++)
        assertThat(limiter.tryConsume(request, rules(other), 1).isAllowed()).isTrue();
      RedisBucketResetHandler handler = new RedisBucketResetHandler(config.getTokenBucketStore());
      handler.onReload(RuleReloadEvent.forRuleSet(id, ReloadSource.MANUAL));
      assertThat(limiter.tryConsume(request, rules(id), 1).isAllowed()).isTrue();
      assertThat(limiter.tryConsume(request, rules(other), 1).isAllowed()).isFalse();
      System.out.println(
          "PROBE targeted reload: selected rule bucket reset, other exhausted bucket preserved");
      handler.onReload(RuleReloadEvent.fullReload(ReloadSource.MANUAL));
      assertThat(limiter.tryConsume(request, rules(other), 1).isAllowed()).isTrue();
      System.out.println("PROBE full reload: other exhausted bucket also reset");
    }
  }
}
