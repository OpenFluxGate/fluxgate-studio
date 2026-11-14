# Studio 콘솔 Grafana 스타일 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 설계 `docs/specs/2026-11-14-grafana-style-design.md`대로 콘솔을 Grafana 스타일로 바꾼다.

**Architecture:** admin-api는 모니터링 기간을 `MonitoringRange`(상대 프리셋 또는 절대 `from`, `to`)로 받는다. UI는 주소에 대시보드 상태를 두고, 공통 컴포넌트(패널 메뉴, 접히는 행, 숫자 패널, uPlot 시계열, 시간 범위 선택, 아이콘 사이드바, TV 모드)로 네 화면을 다시 짠다.

**Tech Stack:** Spring Boot 3.3, Next.js 16, React 19, Tailwind v4, SWR, uPlot 1.6.32, Vitest.

## Global Constraints

- 브랜치 `feature/monitoring-console`. push만 하고 main 머지는 하지 않는다.
- 코드 주석 본문은 한글, 영문, 숫자, 공백, `.`, `,`, `?`, `!`만 쓴다.
- admin-api `verify spotless:check`, UI `lint`, `format:check`, `typecheck`, `test`, `build`를 통과한다.
- 상대 기간 `5m`, `15m`, `1h`, `6h`, `24h`. 절대 기간은 24시간 이하, `to`는 현재보다 1분 넘게 미래일 수 없다.
- 구간 후보 10초, 30초, 1분, 5분, 15분 중 구간 수 120 이하인 가장 작은 값.
- 차단율 임곗값 1%, 5%. 상태 색은 항상 아이콘과 함께 쓴다.
- 허용 계열 `--c-s1`(다크 `#3987e5`, 라이트 `#2a78d6`), 차단 계열 `--c-s2` `#d03b3b`.
- 다크가 기본 테마다.

---

### Task 1: admin-api 모니터링 기간

**Files:**
- Create: `fluxgate-studio-admin-api/src/main/java/org/fluxgate/studio/admin/monitoring/MonitoringRange.java`
- Replace: `.../monitoring/MonitoringService.java`, `.../controller/MonitoringController.java`
- Modify: `.../monitoring/MonitoringWindow.java` (모니터링용 상수 제거, 키 조회 전용)
- Test: `.../monitoring/MonitoringRangeTest.java`, replace `MonitoringServiceTest.java`, `MonitoringWindowTest.java`, `.../controller/MonitoringControllerSecurityTest.java`

**Interfaces:**
- Produces: `record MonitoringRange(String label, long from, long to, long bucketMillis)`, `static MonitoringRange of(String window, Long from, Long to, long now)`, `long lengthMillis()`, `String cacheKey()`, 상수 `CUSTOM = "custom"`. `MonitoringService.overview(MonitoringRange)`, `timeseries(MonitoringRange, String)`, `topRejected(MonitoringRange, String, int, boolean)`. 컨트롤러 파라미터 `window`, `from`, `to`.

- [ ] **Step 1: 테스트**

```java
// MonitoringRangeTest.java
package org.fluxgate.studio.admin.monitoring;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.fluxgate.studio.admin.exception.InvalidRuleException;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.api.Test;

class MonitoringRangeTest {
  private static final long NOW = 1_794_600_000_000L;
  private static final long MINUTE = 60_000L;
  private static final long HOUR = 3_600_000L;

  @ParameterizedTest
  @CsvSource({"5m,300000,10000", "15m,900000,10000", "1h,3600000,30000", "6h,21600000,300000", "24h,86400000,900000"})
  void presetsPickTheSmallestBucketWithAtMost120Points(String window, long length, long bucket) {
    MonitoringRange range = MonitoringRange.of(window, null, null, NOW);

    assertThat(range).isEqualTo(new MonitoringRange(window, NOW - length, NOW, bucket));
    assertThat(range.cacheKey()).isEqualTo(window);
  }

  @Test
  void defaultsToTheLastHour() {
    assertThat(MonitoringRange.of(null, null, null, NOW).label()).isEqualTo("1h");
    assertThat(MonitoringRange.of(" ", null, null, NOW).label()).isEqualTo("1h");
  }

  @Test
  void rejectsUnknownPresets() {
    assertThatThrownBy(() -> MonitoringRange.of("7d", null, null, NOW))
        .isInstanceOf(InvalidRuleException.class)
        .hasMessageContaining("must be one of: 5m, 15m, 1h, 6h, 24h");
  }

  @Test
  void acceptsAnAbsoluteRangeAndPrefersItOverAPreset() {
    MonitoringRange range = MonitoringRange.of("24h", NOW - 10 * MINUTE, NOW - MINUTE, NOW);

    assertThat(range).isEqualTo(new MonitoringRange("custom", NOW - 10 * MINUTE, NOW - MINUTE, 10_000));
    assertThat(range.lengthMillis()).isEqualTo(9 * MINUTE);
  }

  @Test
  void roundsTheCacheKeyOfAnAbsoluteRangeToItsBuckets() {
    MonitoringRange a = MonitoringRange.of(null, NOW - HOUR + 1_000, NOW - 1_000, NOW);
    MonitoringRange b = MonitoringRange.of(null, NOW - HOUR + 2_000, NOW - 2_000, NOW);

    assertThat(a.cacheKey()).isEqualTo(b.cacheKey());
  }

  @Test
  void rejectsBrokenAbsoluteRanges() {
    assertThatThrownBy(() -> MonitoringRange.of(null, NOW - HOUR, null, NOW))
        .isInstanceOf(InvalidRuleException.class)
        .hasMessageContaining("must be sent together with to");
    assertThatThrownBy(() -> MonitoringRange.of(null, NOW, NOW - HOUR, NOW))
        .hasMessageContaining("must be before to");
    assertThatThrownBy(() -> MonitoringRange.of(null, NOW - 25 * HOUR, NOW, NOW))
        .hasMessageContaining("must be within 24 hours of to");
    assertThatThrownBy(() -> MonitoringRange.of(null, NOW, NOW + 2 * MINUTE, NOW))
        .hasMessageContaining("must not be in the future");
  }

  @Test
  void toleratesSmallClockSkew() {
    assertThat(MonitoringRange.of(null, NOW - HOUR, NOW + 30_000, NOW).label()).isEqualTo("custom");
  }
}
```

```java
// MonitoringWindowTest.java
package org.fluxgate.studio.admin.monitoring;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.fluxgate.studio.admin.exception.InvalidRuleException;
import org.junit.jupiter.api.Test;

class MonitoringWindowTest {

  @Test
  void parsesKeyLookupWindows() {
    assertThat(MonitoringWindow.parse("1h", MonitoringWindow.KEY_LOOKUP))
        .isEqualTo(MonitoringWindow.ONE_HOUR);
    assertThat(MonitoringWindow.parse("7d", MonitoringWindow.KEY_LOOKUP))
        .isEqualTo(MonitoringWindow.SEVEN_DAYS);
  }

  @Test
  void rejectsOtherCodes() {
    assertThatThrownBy(() -> MonitoringWindow.parse("5m", MonitoringWindow.KEY_LOOKUP))
        .isInstanceOf(InvalidRuleException.class)
        .hasMessageContaining("must be one of: 1h, 24h, 7d");
    assertThatThrownBy(() -> MonitoringWindow.parse(null, MonitoringWindow.KEY_LOOKUP))
        .isInstanceOf(InvalidRuleException.class);
  }

  @Test
  void exposesLengthsAndBuckets() {
    assertThat(MonitoringWindow.ONE_HOUR.lengthMillis()).isEqualTo(3_600_000L);
    assertThat(MonitoringWindow.ONE_HOUR.bucketMillis()).isEqualTo(60_000L);
    assertThat(MonitoringWindow.ONE_DAY.bucketMillis()).isEqualTo(900_000L);
    assertThat(MonitoringWindow.SEVEN_DAYS.bucketMillis()).isEqualTo(21_600_000L);
  }
}
```

```java
// MonitoringServiceTest.java
package org.fluxgate.studio.admin.monitoring;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import org.fluxgate.studio.admin.dto.response.RuleResponse;
import org.fluxgate.studio.admin.exception.InvalidRuleException;
import org.fluxgate.studio.admin.service.RuleService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class MonitoringServiceTest {
  private static final long NOW = 1_794_600_000_000L;
  private static final long HOUR = 3_600_000L;
  private static final long DAY = 86_400_000L;

  private final MongoEventStore store = mock(MongoEventStore.class);
  private final RuleService ruleService = mock(RuleService.class);
  private MonitoringService service;

  @BeforeEach
  void setUp() {
    MonitoringProperties properties =
        new MonitoringProperties(
            "",
            "rate_limit_events",
            true,
            Duration.ofSeconds(10),
            Duration.ofSeconds(5),
            List.of("none", "sha256"));
    service =
        new MonitoringService(
            store, ruleService, properties, Clock.fixed(Instant.ofEpochMilli(NOW), ZoneOffset.UTC));
    when(ruleService.getAllRules()).thenReturn(List.of());
    when(store.bucketsByRuleSet(anyLong(), anyLong(), anyLong())).thenReturn(Map.of());
  }

  private static MonitoringRange range(String window) {
    return MonitoringRange.of(window, null, null, NOW);
  }

  private static RuleResponse rule(String ruleSetId) {
    return new RuleResponse(
        ruleSetId + "-rule",
        "n",
        true,
        "PER_USER",
        "userId",
        "REJECT_REQUEST",
        List.of(),
        ruleSetId,
        List.of(),
        Map.of(),
        1L);
  }

  @Test
  void overviewTotalsEveryDecisionAndListsRegisteredRuleSetsWithoutTraffic() {
    when(store.activityByRuleSet(NOW - HOUR, NOW, null))
        .thenReturn(
            List.of(
                new RuleSetActivity("a", 10, 2, NOW - 5), new RuleSetActivity(null, 5, 1, NOW)));
    when(store.activityByRuleSet(NOW - DAY, NOW, null))
        .thenReturn(List.of(new RuleSetActivity("a", 30, 3, NOW - 5)));
    when(ruleService.getAllRules()).thenReturn(List.of(rule("c")));

    OverviewResponse overview = service.overview(range("1h"));

    assertThat(overview.window()).isEqualTo("1h");
    assertThat(overview.total()).isEqualTo(15);
    assertThat(overview.rejected()).isEqualTo(3);
    assertThat(overview.rejectRate()).isEqualTo(0.2);
    assertThat(overview.ruleSets())
        .extracting(RuleSetSummary::ruleSetId)
        .containsExactly("a", "c");
    RuleSetSummary idle = overview.ruleSets().get(1);
    assertThat(idle.total()).isZero();
    assertThat(idle.lastDecisionAt()).isNull();
    assertThat(idle.trend()).hasSize(MonitoringService.TREND_POINTS).containsOnly(0L);
  }

  @Test
  void overviewTrendCarriesRejectedCountsPerBucket() {
    long bucket = HOUR / MonitoringService.TREND_POINTS;
    when(store.activityByRuleSet(anyLong(), anyLong(), isNull()))
        .thenReturn(List.of(new RuleSetActivity("a", 3, 2, NOW - 1)));
    when(store.bucketsByRuleSet(NOW - HOUR, NOW, bucket))
        .thenReturn(Map.of("a", List.of(new Bucket(NOW - bucket, 1, 2))));

    List<Long> trend = service.overview(range("1h")).ruleSets().get(0).trend();

    assertThat(trend).hasSize(MonitoringService.TREND_POINTS);
    assertThat(trend.get(trend.size() - 1)).isEqualTo(2L);
  }

  @Test
  void overviewIsCachedPerRange() {
    when(store.activityByRuleSet(anyLong(), anyLong(), isNull())).thenReturn(List.of());

    service.overview(range("1h"));
    service.overview(range("1h"));
    service.overview(range("6h"));

    verify(store, times(4)).activityByRuleSet(anyLong(), anyLong(), isNull());
  }

  @Test
  void timeseriesUsesTheRangeBucketAndFillsGaps() {
    when(store.buckets(NOW - HOUR, NOW, 30_000, "a", null))
        .thenReturn(List.of(new Bucket(NOW - 30_000, 4, 1)));

    TimeseriesResponse series = service.timeseries(range("1h"), "a");

    assertThat(series.window()).isEqualTo("1h");
    assertThat(series.bucketMillis()).isEqualTo(30_000);
    assertThat(series.buckets()).hasSize(120);
    assertThat(series.buckets().get(0)).isEqualTo(new Bucket(NOW - HOUR, 0, 0));
    assertThat(series.buckets().get(119)).isEqualTo(new Bucket(NOW - 30_000, 4, 1));
  }

  @Test
  void timeseriesReportsAbsoluteRangesAsCustom() {
    MonitoringRange custom = MonitoringRange.of(null, NOW - 600_000, NOW - 300_000, NOW);
    when(store.buckets(NOW - 600_000, NOW - 300_000, 10_000, null, null)).thenReturn(List.of());

    TimeseriesResponse series = service.timeseries(custom, null);

    assertThat(series.window()).isEqualTo("custom");
    assertThat(series.buckets()).hasSize(30);
  }

  @Test
  void topRejectedMasksKeysUnlessRevealed() {
    when(store.topRejected(NOW - HOUR, NOW, null, 20))
        .thenReturn(List.of(new RejectedKey("a", "123456789", 3, NOW - 10)));

    assertThat(service.topRejected(range("1h"), null, 20, false))
        .containsExactly(new RejectedKeyResponse("a", "12****89", true, 3, NOW - 10));
    assertThat(service.topRejected(range("1h"), null, 20, true))
        .containsExactly(new RejectedKeyResponse("a", "123456789", false, 3, NOW - 10));
    verify(store, times(1)).topRejected(NOW - HOUR, NOW, null, 20);
  }

  @Test
  void topRejectedRejectsLimitsOutsideTheRange() {
    assertThatThrownBy(() -> service.topRejected(range("1h"), null, 0, true))
        .isInstanceOf(InvalidRuleException.class);
    assertThatThrownBy(() -> service.topRejected(range("1h"), null, 101, true))
        .isInstanceOf(InvalidRuleException.class);
  }

  @Test
  void fillAlignsToBucketBoundaries() {
    assertThat(MonitoringService.fill(Collections.emptyList(), 90_000, 200_000, 60_000))
        .extracting(Bucket::start)
        .containsExactly(60_000L, 120_000L, 180_000L);
  }
}
```

```java
// controller/MonitoringControllerSecurityTest.java
package org.fluxgate.studio.admin.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.fluxgate.studio.admin.config.SecurityConfig;
import org.fluxgate.studio.admin.monitoring.MonitoringRange;
import org.fluxgate.studio.admin.monitoring.MonitoringService;
import org.fluxgate.studio.admin.monitoring.OverviewResponse;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(controllers = {MonitoringController.class, MeController.class})
@Import({SecurityConfig.class, MonitoringControllerSecurityTest.FixedClock.class})
@TestPropertySource(
    properties = {
      "spring.security.oauth2.resourceserver.jwt.issuer-uri=http://localhost:18080/realms/fluxgate",
      "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://localhost:18080/realms/fluxgate/protocol/openid-connect/certs",
      "app.security.cors.allowed-origins=http://localhost:3000"
    })
class MonitoringControllerSecurityTest {
  static final long NOW = 1_794_600_000_000L;

  @TestConfiguration
  static class FixedClock {
    @Bean
    Clock clock() {
      return Clock.fixed(Instant.ofEpochMilli(NOW), ZoneOffset.UTC);
    }
  }

  @Autowired private MockMvc mockMvc;
  @MockBean private MonitoringService monitoringService;

  private static MonitoringRange preset(String window) {
    return MonitoringRange.of(window, null, null, NOW);
  }

  @Test
  void anonymousCallersAreRejected() throws Exception {
    mockMvc.perform(get("/api/monitoring/overview")).andExpect(status().isUnauthorized());
  }

  @Test
  @WithMockUser(roles = "USER")
  void viewersReadTheOverviewOfTheLastHourByDefault() throws Exception {
    when(monitoringService.overview(preset("1h")))
        .thenReturn(new OverviewResponse("1h", 0, 1, 0, 0, 0, List.of()));

    mockMvc
        .perform(get("/api/monitoring/overview"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.window").value("1h"));
  }

  @Test
  @WithMockUser(roles = "USER")
  void absoluteRangesReachTheService() throws Exception {
    mockMvc
        .perform(
            get("/api/monitoring/timeseries")
                .param("from", String.valueOf(NOW - 600_000))
                .param("to", String.valueOf(NOW - 60_000)))
        .andExpect(status().isOk());

    verify(monitoringService)
        .timeseries(MonitoringRange.of(null, NOW - 600_000, NOW - 60_000, NOW), null);
  }

  @Test
  @WithMockUser(roles = "USER")
  void brokenRangesAreBadRequests() throws Exception {
    mockMvc.perform(get("/api/monitoring/overview?window=7d")).andExpect(status().isBadRequest());
    mockMvc
        .perform(get("/api/monitoring/overview").param("from", String.valueOf(NOW - 600_000)))
        .andExpect(status().isBadRequest());
    verify(monitoringService, never()).overview(any());
  }

  @Test
  @WithMockUser(roles = "USER")
  void viewersReceiveMaskedKeys() throws Exception {
    mockMvc.perform(get("/api/monitoring/top-rejected")).andExpect(status().isOk());
    verify(monitoringService).topRejected(preset("1h"), null, 20, false);
  }

  @Test
  @WithMockUser(roles = "ADMIN")
  void adminsReceiveRawKeys() throws Exception {
    mockMvc
        .perform(get("/api/monitoring/top-rejected?window=24h&ruleSetId=a&limit=5"))
        .andExpect(status().isOk());
    verify(monitoringService).topRejected(eq(preset("24h")), eq("a"), eq(5), eq(true));
  }

  @Test
  @WithMockUser(roles = "USER")
  void viewersReadTheTimeseries() throws Exception {
    mockMvc.perform(get("/api/monitoring/timeseries?window=15m")).andExpect(status().isOk());
    verify(monitoringService).timeseries(eq(preset("15m")), isNull());
  }

  @Test
  void meDescribesTheSignedInAdmin() throws Exception {
    mockMvc
        .perform(
            get("/api/me")
                .with(
                    jwt()
                        .jwt(
                            token ->
                                token.claim("preferred_username", "alice").claim("name", "Alice"))
                        .authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.username").value("alice"))
        .andExpect(jsonPath("$.name").value("Alice"))
        .andExpect(jsonPath("$.roles[0]").value("ADMIN"))
        .andExpect(jsonPath("$.canWrite").value(true));
  }

  @Test
  @WithMockUser(username = "bob", roles = "USER")
  void meDescribesAViewer() throws Exception {
    mockMvc
        .perform(get("/api/me"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.username").value("bob"))
        .andExpect(jsonPath("$.canWrite").value(false));
  }

  @Test
  @WithMockUser(roles = "USER")
  void viewersCannotReachAdminOnlyPaths() throws Exception {
    mockMvc.perform(get("/api/keys/transforms")).andExpect(status().isForbidden());
    mockMvc.perform(get("/api/audit")).andExpect(status().isForbidden());
  }
}
```

- [ ] **Step 2: 구현**

```java
// MonitoringRange.java
package org.fluxgate.studio.admin.monitoring;

import java.time.Duration;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import org.fluxgate.studio.admin.exception.InvalidRuleException;

/** Time range of a monitoring query, a preset relative to now or an absolute span. */
public record MonitoringRange(String label, long from, long to, long bucketMillis) {

  public static final String CUSTOM = "custom";
  static final String DEFAULT_WINDOW = "1h";
  static final long MAX_SPAN_MILLIS = Duration.ofHours(24).toMillis();
  static final long FUTURE_SLACK_MILLIS = Duration.ofMinutes(1).toMillis();
  static final int MAX_BUCKETS = 120;
  static final long[] BUCKETS = {10_000L, 30_000L, 60_000L, 300_000L, 900_000L};
  static final Map<String, Long> WINDOWS = windows();

  public static MonitoringRange of(String window, Long from, Long to, long now) {
    if (from != null || to != null) {
      return absolute(from, to, now);
    }
    String code = window == null || window.isBlank() ? DEFAULT_WINDOW : window;
    Long length = WINDOWS.get(code);
    if (length == null) {
      throw new InvalidRuleException(
          "window", "must be one of: " + String.join(", ", WINDOWS.keySet()));
    }
    return new MonitoringRange(code, now - length, now, bucketFor(length));
  }

  public long lengthMillis() {
    return to - from;
  }

  public String cacheKey() {
    if (!CUSTOM.equals(label)) {
      return label;
    }
    return Math.floorDiv(from, bucketMillis) + ":" + Math.floorDiv(to, bucketMillis) + ":" + bucketMillis;
  }

  static long bucketFor(long span) {
    for (long bucket : BUCKETS) {
      if (span / bucket <= MAX_BUCKETS) {
        return bucket;
      }
    }
    return BUCKETS[BUCKETS.length - 1];
  }

  private static MonitoringRange absolute(Long from, Long to, long now) {
    if (from == null || to == null) {
      throw new InvalidRuleException("from", "must be sent together with to");
    }
    if (from >= to) {
      throw new InvalidRuleException("from", "must be before to");
    }
    if (to - from > MAX_SPAN_MILLIS) {
      throw new InvalidRuleException("from", "must be within 24 hours of to");
    }
    if (to > now + FUTURE_SLACK_MILLIS) {
      throw new InvalidRuleException("to", "must not be in the future");
    }
    return new MonitoringRange(CUSTOM, from, to, bucketFor(to - from));
  }

  private static Map<String, Long> windows() {
    Map<String, Long> windows = new LinkedHashMap<>();
    windows.put("5m", Duration.ofMinutes(5).toMillis());
    windows.put("15m", Duration.ofMinutes(15).toMillis());
    windows.put("1h", Duration.ofHours(1).toMillis());
    windows.put("6h", Duration.ofHours(6).toMillis());
    windows.put("24h", Duration.ofHours(24).toMillis());
    return Collections.unmodifiableMap(windows);
  }
}
```

`MonitoringWindow`에서 `FIVE_MINUTES` 상수와 `MONITORING` 집합을 지운다. 남는 것은 `ONE_HOUR`, `ONE_DAY`, `SEVEN_DAYS`, `KEY_LOOKUP`, `parse`.

```java
// MonitoringService.java
package org.fluxgate.studio.admin.monitoring;

import java.time.Clock;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import org.fluxgate.studio.admin.dto.response.RuleResponse;
import org.fluxgate.studio.admin.exception.InvalidRuleException;
import org.fluxgate.studio.admin.service.RuleService;
import org.springframework.stereotype.Service;

/** Aggregates decision history for the console overview, trend chart and top rejected keys. */
@Service
public class MonitoringService {

  static final int TREND_POINTS = 12;
  static final int MAX_TOP_KEYS = 100;
  private static final long DAY_MILLIS = Duration.ofDays(1).toMillis();

  private final MongoEventStore store;
  private final RuleService ruleService;
  private final TtlCache cache;

  public MonitoringService(
      MongoEventStore store,
      RuleService ruleService,
      MonitoringProperties properties,
      Clock clock) {
    this.store = store;
    this.ruleService = ruleService;
    this.cache = new TtlCache(properties.cacheTtl(), clock);
  }

  public OverviewResponse overview(MonitoringRange range) {
    return cache.get("overview:" + range.cacheKey(), () -> computeOverview(range));
  }

  public TimeseriesResponse timeseries(MonitoringRange range, String ruleSetId) {
    return cache.get(
        "timeseries:" + range.cacheKey() + ":" + ruleSetId,
        () ->
            new TimeseriesResponse(
                range.label(),
                range.from(),
                range.to(),
                range.bucketMillis(),
                fill(
                    store.buckets(
                        range.from(), range.to(), range.bucketMillis(), ruleSetId, null),
                    range.from(),
                    range.to(),
                    range.bucketMillis())));
  }

  public List<RejectedKeyResponse> topRejected(
      MonitoringRange range, String ruleSetId, int limit, boolean revealKeys) {
    if (limit < 1 || limit > MAX_TOP_KEYS) {
      throw new InvalidRuleException("limit", "must be between 1 and " + MAX_TOP_KEYS);
    }
    List<RejectedKey> keys =
        cache.get(
            "top:" + range.cacheKey() + ":" + ruleSetId + ":" + limit,
            () -> store.topRejected(range.from(), range.to(), ruleSetId, limit));
    return keys.stream()
        .map(
            key ->
                new RejectedKeyResponse(
                    key.ruleSetId(),
                    revealKeys ? key.key() : KeyMasker.mask(key.key()),
                    !revealKeys,
                    key.rejected(),
                    key.lastRejectedAt()))
        .toList();
  }

  public static List<Bucket> fill(List<Bucket> sparse, long from, long to, long bucketMillis) {
    Map<Long, Bucket> byStart = new HashMap<>();
    for (Bucket bucket : sparse) {
      byStart.put(bucket.start(), bucket);
    }
    List<Bucket> filled = new ArrayList<>();
    for (long start = from - Math.floorMod(from, bucketMillis); start < to; start += bucketMillis) {
      filled.add(byStart.getOrDefault(start, new Bucket(start, 0, 0)));
    }
    return filled;
  }

  static double rate(long rejected, long total) {
    return total == 0 ? 0 : (double) rejected / total;
  }

  private OverviewResponse computeOverview(MonitoringRange range) {
    long from = range.from();
    long to = range.to();
    long trendBucket = Math.max(1, range.lengthMillis() / TREND_POINTS);

    Map<String, RuleSetActivity> activity = new HashMap<>();
    long total = 0;
    long rejected = 0;
    for (RuleSetActivity entry : store.activityByRuleSet(from, to, null)) {
      total += entry.total();
      rejected += entry.rejected();
      if (entry.ruleSetId() != null) {
        activity.put(entry.ruleSetId(), entry);
      }
    }

    Map<String, Long> lastSeen = new HashMap<>();
    for (RuleSetActivity entry : store.activityByRuleSet(to - DAY_MILLIS, to, null)) {
      if (entry.ruleSetId() != null) {
        lastSeen.put(entry.ruleSetId(), entry.lastDecisionAt());
      }
    }

    Set<String> ids = new TreeSet<>(activity.keySet());
    ids.addAll(lastSeen.keySet());
    for (RuleResponse rule : ruleService.getAllRules()) {
      if (rule.ruleSetId() != null) {
        ids.add(rule.ruleSetId());
      }
    }

    Map<String, List<Bucket>> trends = store.bucketsByRuleSet(from, to, trendBucket);
    List<RuleSetSummary> summaries = new ArrayList<>();
    for (String id : ids) {
      RuleSetActivity entry = activity.get(id);
      long ruleSetTotal = entry == null ? 0 : entry.total();
      long ruleSetRejected = entry == null ? 0 : entry.rejected();
      List<Bucket> filled = fill(trends.getOrDefault(id, List.of()), from, to, trendBucket);
      List<Long> trend =
          filled.subList(Math.max(0, filled.size() - TREND_POINTS), filled.size()).stream()
              .map(Bucket::rejected)
              .toList();
      summaries.add(
          new RuleSetSummary(
              id,
              ruleSetTotal,
              ruleSetRejected,
              rate(ruleSetRejected, ruleSetTotal),
              lastSeen.get(id),
              trend));
    }
    summaries.sort(
        Comparator.comparingLong(RuleSetSummary::rejected)
            .reversed()
            .thenComparing(Comparator.comparingLong(RuleSetSummary::total).reversed())
            .thenComparing(RuleSetSummary::ruleSetId));
    return new OverviewResponse(
        range.label(), from, to, total, rejected, rate(rejected, total), summaries);
  }
}
```

```java
// controller/MonitoringController.java
package org.fluxgate.studio.admin.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.Clock;
import java.util.List;
import org.fluxgate.studio.admin.monitoring.MonitoringRange;
import org.fluxgate.studio.admin.monitoring.MonitoringService;
import org.fluxgate.studio.admin.monitoring.OverviewResponse;
import org.fluxgate.studio.admin.monitoring.RejectedKeyResponse;
import org.fluxgate.studio.admin.monitoring.TimeseriesResponse;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/monitoring")
@Tag(name = "Monitoring", description = "Aggregates over the recorded rate limit decisions")
public class MonitoringController {

  private final MonitoringService monitoringService;
  private final Clock clock;

  public MonitoringController(MonitoringService monitoringService, Clock clock) {
    this.monitoringService = monitoringService;
    this.clock = clock;
  }

  @GetMapping("/overview")
  @PreAuthorize(Roles.READER)
  @Operation(
      summary = "Overview",
      description = "Totals and per rule set activity. Pass window, or from and to in epoch ms.")
  public OverviewResponse overview(
      @RequestParam(required = false) String window,
      @RequestParam(required = false) Long from,
      @RequestParam(required = false) Long to) {
    return monitoringService.overview(range(window, from, to));
  }

  @GetMapping("/timeseries")
  @PreAuthorize(Roles.READER)
  @Operation(summary = "Timeseries", description = "Allowed and rejected decisions per bucket")
  public TimeseriesResponse timeseries(
      @RequestParam(required = false) String window,
      @RequestParam(required = false) Long from,
      @RequestParam(required = false) Long to,
      @RequestParam(required = false) String ruleSetId) {
    return monitoringService.timeseries(range(window, from, to), blankToNull(ruleSetId));
  }

  @GetMapping("/top-rejected")
  @PreAuthorize(Roles.READER)
  @Operation(summary = "Top rejected keys", description = "Keys are masked for the read only role")
  public List<RejectedKeyResponse> topRejected(
      @RequestParam(required = false) String window,
      @RequestParam(required = false) Long from,
      @RequestParam(required = false) Long to,
      @RequestParam(required = false) String ruleSetId,
      @RequestParam(defaultValue = "20") int limit,
      Authentication authentication) {
    return monitoringService.topRejected(
        range(window, from, to), blankToNull(ruleSetId), limit, Roles.isAdmin(authentication));
  }

  private MonitoringRange range(String window, Long from, Long to) {
    return MonitoringRange.of(window, from, to, clock.millis());
  }

  private static String blankToNull(String value) {
    return value == null || value.isBlank() ? null : value;
  }
}
```

- [ ] **Step 3: 확인**

Run: `./mvnw -B -ntp $M2 spotless:apply && ./mvnw -B -ntp $M2 verify spotless:check`
Expected: BUILD SUCCESS

- [ ] **Step 4: Commit** `feat(api): accept preset and absolute monitoring ranges`

---

### Task 2: UI 순수 함수와 API

**Files:**
- Create: `fluxgate-studio-ui-nextjs/src/lib/timeRange.ts`, `src/lib/stats.ts`, `src/lib/csv.ts`
- Modify: `src/lib/format.ts`, `src/lib/api.ts`, `src/lib/i18n.ts`
- Test: `src/lib/timeRange.test.ts`, `src/lib/stats.test.ts`, `src/lib/csv.test.ts`, `src/lib/format.test.ts`, `src/lib/api.test.ts`

**Interfaces:**
- Produces:
  - timeRange: `PRESETS`, `Preset`, `REFRESH_OPTIONS`, `RefreshInterval`, `TimeRange`, `DashboardState { range; refresh; ruleSet }`, `DEFAULT_RANGE`, `MIN_SPAN`, `MAX_SPAN`, `parseState(params)`, `serializeState(state, base?)`, `apiRangeParams(range)`, `rangeKey(range)`, `refreshMillis(state)`, `zoomTo(from, to, now)`, `zoomOut(range, now)`, `rangeLabel(range, locale)`
  - stats: `Severity = 'ok' | 'warn' | 'bad'`, `WARN_RATE`, `BAD_RATE`, `summarize(buckets)`, `rateSeverity(rate)`, `legendStats(values)`, `bucketRates(buckets)`
  - csv: `toCsv(headers, rows)`, `downloadCsv(name, csv)`
  - format 추가: `formatBucket(ms)`, `formatHourMinute(ts)`, `formatTimestamp(ts)`
  - api 변경: `type RangeParams = Record<string, string>`, `fetchOverview(params)`, `fetchTimeseries(params, ruleSetId?)`, `fetchTopRejected(params, limit?, ruleSetId?)`

- [ ] **Step 1: 테스트**

```ts
// src/lib/timeRange.test.ts
import { describe, expect, it } from 'vitest';

import {
  apiRangeParams,
  DEFAULT_RANGE,
  MIN_SPAN,
  parseState,
  rangeKey,
  rangeLabel,
  refreshMillis,
  serializeState,
  zoomOut,
  zoomTo,
} from './timeRange';

const NOW = 1_794_600_000_000;
const HOUR = 3_600_000;

describe('dashboard state in the address', () => {
  it('falls back to the last hour with a ten second refresh', () => {
    expect(parseState(new URLSearchParams())).toEqual({
      range: DEFAULT_RANGE,
      refresh: '10s',
      ruleSet: null,
    });
  });

  it('reads presets, absolute ranges and the rule set', () => {
    expect(parseState(new URLSearchParams('from=now-6h&to=now&refresh=off&ruleSet=a'))).toEqual({
      range: { kind: 'relative', preset: '6h' },
      refresh: 'off',
      ruleSet: 'a',
    });
    expect(parseState(new URLSearchParams(`from=${NOW - HOUR}&to=${NOW}`)).range).toEqual({
      kind: 'absolute',
      from: NOW - HOUR,
      to: NOW,
    });
  });

  it('ignores values it cannot use', () => {
    expect(parseState(new URLSearchParams('from=now-2h&refresh=5s')).range).toEqual(DEFAULT_RANGE);
    expect(parseState(new URLSearchParams('from=now-2h&refresh=5s')).refresh).toBe('10s');
    expect(parseState(new URLSearchParams(`from=${NOW}&to=${NOW - 1}`)).range).toEqual(DEFAULT_RANGE);
    expect(parseState(new URLSearchParams(`from=${NOW - 25 * HOUR}&to=${NOW}`)).range).toEqual(
      DEFAULT_RANGE
    );
  });

  it('writes the state back and keeps unrelated parameters', () => {
    const params = serializeState(
      { range: { kind: 'absolute', from: 1, to: 2 }, refresh: '30s', ruleSet: null },
      new URLSearchParams('kiosk=&ruleSet=old')
    );
    expect(params.get('from')).toBe('1');
    expect(params.get('to')).toBe('2');
    expect(params.get('refresh')).toBe('30s');
    expect(params.has('ruleSet')).toBe(false);
    expect(params.has('kiosk')).toBe(true);
    expect(
      serializeState({ range: DEFAULT_RANGE, refresh: '10s', ruleSet: 'a' }).toString()
    ).toBe('from=now-1h&to=now&refresh=10s&ruleSet=a');
  });
});

describe('API parameters and refresh', () => {
  it('sends presets as a window and absolute ranges as from and to', () => {
    expect(apiRangeParams({ kind: 'relative', preset: '15m' })).toEqual({ window: '15m' });
    expect(apiRangeParams({ kind: 'absolute', from: 1, to: 2 })).toEqual({ from: '1', to: '2' });
    expect(rangeKey({ kind: 'absolute', from: 1, to: 2 })).toBe('1-2');
  });

  it('refreshes only relative ranges', () => {
    expect(refreshMillis({ range: DEFAULT_RANGE, refresh: '30s', ruleSet: null })).toBe(30_000);
    expect(refreshMillis({ range: DEFAULT_RANGE, refresh: 'off', ruleSet: null })).toBe(0);
    expect(
      refreshMillis({ range: { kind: 'absolute', from: 1, to: 2 }, refresh: '10s', ruleSet: null })
    ).toBe(0);
  });
});

describe('zoom', () => {
  it('keeps a selection of at least one minute that ends by now', () => {
    expect(zoomTo(NOW - 10_000, NOW - 5_000, NOW)).toEqual({
      kind: 'absolute',
      from: NOW - MIN_SPAN,
      to: NOW,
    });
    expect(zoomTo(NOW - HOUR, NOW - HOUR + 2 * MIN_SPAN, NOW)).toEqual({
      kind: 'absolute',
      from: NOW - HOUR,
      to: NOW - HOUR + 2 * MIN_SPAN,
    });
  });

  it('steps presets up and doubles absolute ranges', () => {
    expect(zoomOut({ kind: 'relative', preset: '1h' }, NOW)).toEqual({
      kind: 'relative',
      preset: '6h',
    });
    expect(zoomOut({ kind: 'relative', preset: '24h' }, NOW)).toEqual({
      kind: 'relative',
      preset: '24h',
    });
    expect(zoomOut({ kind: 'absolute', from: NOW - 2 * HOUR, to: NOW - HOUR }, NOW)).toEqual({
      kind: 'absolute',
      from: NOW - 2.5 * HOUR,
      to: NOW - 0.5 * HOUR,
    });
    expect(zoomOut({ kind: 'absolute', from: NOW - 20 * HOUR, to: NOW }, NOW)).toEqual({
      kind: 'relative',
      preset: '24h',
    });
  });

  it('labels presets in the chosen language', () => {
    expect(rangeLabel({ kind: 'relative', preset: '1h' }, 'ko')).toBe('최근 1시간');
    expect(rangeLabel({ kind: 'relative', preset: '15m' }, 'en')).toBe('Last 15 min');
  });
});
```

```ts
// src/lib/stats.test.ts
import { describe, expect, it } from 'vitest';

import { bucketRates, legendStats, rateSeverity, summarize } from './stats';

describe('panel statistics', () => {
  it('sums buckets into totals and a rate', () => {
    expect(
      summarize([
        { allowed: 90, rejected: 5 },
        { allowed: 0, rejected: 5 },
      ])
    ).toEqual({ total: 100, rejected: 10, rate: 0.1 });
    expect(summarize([])).toEqual({ total: 0, rejected: 0, rate: 0 });
  });

  it('grades the reject rate at one and five percent', () => {
    expect(rateSeverity(0.009)).toBe('ok');
    expect(rateSeverity(0.01)).toBe('warn');
    expect(rateSeverity(0.049)).toBe('warn');
    expect(rateSeverity(0.05)).toBe('bad');
  });

  it('computes legend values', () => {
    expect(legendStats([2, 6, 4])).toEqual({ mean: 4, max: 6, last: 4 });
    expect(legendStats([])).toEqual({ mean: 0, max: 0, last: 0 });
  });

  it('turns buckets into percent rates', () => {
    expect(
      bucketRates([
        { allowed: 3, rejected: 1 },
        { allowed: 0, rejected: 0 },
      ])
    ).toEqual([25, 0]);
  });
});
```

```ts
// src/lib/csv.test.ts
import { describe, expect, it } from 'vitest';

import { toCsv } from './csv';

describe('toCsv', () => {
  it('quotes cells that need it', () => {
    expect(toCsv(['a', 'b'], [['x,y', 'say "hi"'], ['line\nbreak', 3]])).toBe(
      'a,b\n"x,y","say ""hi"""\n"line\nbreak",3\n'
    );
  });

  it('writes empty cells for missing values', () => {
    expect(toCsv(['a', 'b'], [[null, undefined]])).toBe('a,b\n,\n');
  });

  it('defuses text that a spreadsheet would run as a formula', () => {
    expect(toCsv(['a'], [['=SUM(A1)'], ['+1'], [-5]])).toBe("a\n'=SUM(A1)\n'+1\n-5\n");
  });
});
```

`src/lib/format.test.ts`에 추가:

```ts
describe('time formatting for panels', () => {
  it('names bucket sizes', () => {
    expect(formatBucket(10_000)).toBe('10s');
    expect(formatBucket(300_000)).toBe('5m');
  });

  it('formats a full local timestamp', () => {
    const ts = new Date(2026, 10, 14, 5, 3, 9).getTime();
    expect(formatTimestamp(ts)).toBe('2026-11-14 05:03:09');
    expect(formatHourMinute(ts)).toBe('05:03');
  });
});
```

`src/lib/api.test.ts`의 `builds monitoring query strings`에서 호출을 `fetchTopRejected({ window: '24h' }, 5, 'checkout api')`로 바꾸고, 같은 테스트에 아래를 추가한다.

```ts
    await fetchTimeseries({ from: '1', to: '2' }, 'a');
    expect(fetchMock.mock.calls[2][0]).toBe(
      '/api/proxy/api/monitoring/timeseries?from=1&to=2&ruleSetId=a'
    );
```

- [ ] **Step 2: 구현**

```ts
// src/lib/timeRange.ts
import { formatDateTime } from './format';
import { type Locale, type MessageKey, translate } from './i18n';

export const PRESETS = ['5m', '15m', '1h', '6h', '24h'] as const;
export type Preset = (typeof PRESETS)[number];

export const REFRESH_OPTIONS = ['off', '10s', '30s', '1m'] as const;
export type RefreshInterval = (typeof REFRESH_OPTIONS)[number];

export type TimeRange =
  | { kind: 'relative'; preset: Preset }
  | { kind: 'absolute'; from: number; to: number };

export interface DashboardState {
  range: TimeRange;
  refresh: RefreshInterval;
  ruleSet: string | null;
}

export const DEFAULT_RANGE: TimeRange = { kind: 'relative', preset: '1h' };
export const MIN_SPAN = 60_000;
export const MAX_SPAN = 24 * 60 * 60 * 1000;

const DEFAULT_REFRESH: RefreshInterval = '10s';
const REFRESH_MILLIS: Record<RefreshInterval, number> = {
  off: 0,
  '10s': 10_000,
  '30s': 30_000,
  '1m': 60_000,
};

function isPreset(value: string): value is Preset {
  return (PRESETS as readonly string[]).includes(value);
}

function isRefresh(value: string | null): value is RefreshInterval {
  return value !== null && (REFRESH_OPTIONS as readonly string[]).includes(value);
}

export function parseState(params: URLSearchParams): DashboardState {
  const from = params.get('from');
  const to = params.get('to');
  let range: TimeRange = DEFAULT_RANGE;
  const relative = from?.match(/^now-(\w+)$/);
  if (relative && (to === null || to === 'now') && isPreset(relative[1])) {
    range = { kind: 'relative', preset: relative[1] };
  } else if (from && to && /^\d+$/.test(from) && /^\d+$/.test(to)) {
    const start = Number(from);
    const end = Number(to);
    if (start < end && end - start <= MAX_SPAN) {
      range = { kind: 'absolute', from: start, to: end };
    }
  }
  const refresh = params.get('refresh');
  return {
    range,
    refresh: isRefresh(refresh) ? refresh : DEFAULT_REFRESH,
    ruleSet: params.get('ruleSet') || null,
  };
}

export function serializeState(
  state: DashboardState,
  base: URLSearchParams = new URLSearchParams()
): URLSearchParams {
  const params = new URLSearchParams(base);
  if (state.range.kind === 'relative') {
    params.set('from', `now-${state.range.preset}`);
    params.set('to', 'now');
  } else {
    params.set('from', String(state.range.from));
    params.set('to', String(state.range.to));
  }
  params.set('refresh', state.refresh);
  if (state.ruleSet) params.set('ruleSet', state.ruleSet);
  else params.delete('ruleSet');
  return params;
}

export function apiRangeParams(range: TimeRange): Record<string, string> {
  return range.kind === 'relative'
    ? { window: range.preset }
    : { from: String(range.from), to: String(range.to) };
}

export function rangeKey(range: TimeRange): string {
  return range.kind === 'relative' ? range.preset : `${range.from}-${range.to}`;
}

export function refreshMillis(state: DashboardState): number {
  return state.range.kind === 'absolute' ? 0 : REFRESH_MILLIS[state.refresh];
}

export function zoomTo(from: number, to: number, now: number): TimeRange {
  let start = Math.min(from, to);
  let end = Math.min(Math.max(from, to), now);
  if (end - start < MIN_SPAN) {
    const center = (start + end) / 2;
    start = Math.round(center - MIN_SPAN / 2);
    end = start + MIN_SPAN;
  }
  if (end > now) {
    start -= end - now;
    end = now;
  }
  return { kind: 'absolute', from: start, to: end };
}

export function zoomOut(range: TimeRange, now: number): TimeRange {
  if (range.kind === 'relative') {
    const index = PRESETS.indexOf(range.preset);
    return { kind: 'relative', preset: PRESETS[Math.min(index + 1, PRESETS.length - 1)] };
  }
  const span = (range.to - range.from) * 2;
  if (span >= MAX_SPAN) {
    return { kind: 'relative', preset: '24h' };
  }
  const center = (range.from + range.to) / 2;
  const end = Math.min(now, Math.round(center + span / 2));
  return { kind: 'absolute', from: end - span, to: end };
}

export function rangeLabel(range: TimeRange, locale: Locale): string {
  if (range.kind === 'relative') {
    return translate(locale, 'range.last', {
      window: translate(locale, `window.${range.preset}` as MessageKey),
    });
  }
  return translate(locale, 'range.absolute', {
    from: formatDateTime(range.from),
    to: formatDateTime(range.to),
  });
}
```

```ts
// src/lib/stats.ts
export type Severity = 'ok' | 'warn' | 'bad';

export const WARN_RATE = 0.01;
export const BAD_RATE = 0.05;

interface BucketLike {
  allowed: number;
  rejected: number;
}

export function summarize(buckets: BucketLike[]): { total: number; rejected: number; rate: number } {
  let allowed = 0;
  let rejected = 0;
  for (const bucket of buckets) {
    allowed += bucket.allowed;
    rejected += bucket.rejected;
  }
  const total = allowed + rejected;
  return { total, rejected, rate: total ? rejected / total : 0 };
}

export function rateSeverity(rate: number): Severity {
  if (rate >= BAD_RATE) return 'bad';
  if (rate >= WARN_RATE) return 'warn';
  return 'ok';
}

export function legendStats(values: number[]): { mean: number; max: number; last: number } {
  if (values.length === 0) return { mean: 0, max: 0, last: 0 };
  const sum = values.reduce((acc, value) => acc + value, 0);
  return { mean: sum / values.length, max: Math.max(...values), last: values[values.length - 1] };
}

export function bucketRates(buckets: BucketLike[]): number[] {
  return buckets.map((bucket) => {
    const total = bucket.allowed + bucket.rejected;
    return total ? (bucket.rejected / total) * 100 : 0;
  });
}
```

```ts
// src/lib/csv.ts
type Cell = string | number | null | undefined;

function cell(value: Cell): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (typeof value === 'string' && /^[=+\-@]/.test(text)) {
    text = `'${text}`;
  }
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: string[], rows: Cell[][]): string {
  return `${[headers, ...rows].map((row) => row.map(cell).join(',')).join('\n')}\n`;
}

export function downloadCsv(name: string, csv: string): void {
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
```

`src/lib/format.ts`에 추가:

```ts
export function formatBucket(millis: number): string {
  return millis < 60_000 ? `${millis / 1000}s` : `${millis / 60_000}m`;
}

export function formatHourMinute(timestamp: number): string {
  const date = new Date(timestamp);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${formatClock(timestamp)}`;
}
```

`src/lib/api.ts`: `fetchOverview`, `fetchTimeseries`, `fetchTopRejected`를 아래로 바꾼다.

```ts
export type RangeParams = Record<string, string>;

export async function fetchOverview(range: RangeParams): Promise<ApiOverview> {
  const params = new URLSearchParams(range);
  return handleResponse<ApiOverview>(
    await fetch(`${API_BASE_PATH}/api/monitoring/overview?${params.toString()}`)
  );
}

export async function fetchTimeseries(
  range: RangeParams,
  ruleSetId?: string
): Promise<ApiTimeseries> {
  const params = new URLSearchParams(range);
  if (ruleSetId) params.set('ruleSetId', ruleSetId);
  return handleResponse<ApiTimeseries>(
    await fetch(`${API_BASE_PATH}/api/monitoring/timeseries?${params.toString()}`)
  );
}

export async function fetchTopRejected(
  range: RangeParams,
  limit = 20,
  ruleSetId?: string
): Promise<ApiRejectedKey[]> {
  const params = new URLSearchParams(range);
  params.set('limit', String(limit));
  if (ruleSetId) params.set('ruleSetId', ruleSetId);
  return handleResponse<ApiRejectedKey[]>(
    await fetch(`${API_BASE_PATH}/api/monitoring/top-rejected?${params.toString()}`)
  );
}
```

`src/lib/i18n.ts`의 `en`과 `ko`에 같은 키를 추가한다.

| 키 | en | ko |
|---|---|---|
| `window.15m` | 15 min | 15분 |
| `window.6h` | 6 hours | 6시간 |
| `range.last` | Last {window} | 최근 {window} |
| `range.absolute` | {from} to {to} | {from} ~ {to} |
| `range.zoomOut` | Zoom out | 축소 |
| `refresh.now` | Refresh | 새로고침 |
| `refresh.interval` | Auto refresh | 자동 갱신 |
| `refresh.off` | Off | 끄기 |
| `tv.enter` | TV mode | TV 모드 |
| `tv.exit` | Exit TV mode (Esc) | TV 모드 끝내기 (Esc) |
| `panel.menu` | Panel menu | 패널 메뉴 |
| `panel.view` | View | 크게 보기 |
| `panel.data` | Inspect data | 데이터 보기 |
| `panel.csv` | Download CSV | CSV 내려받기 |
| `row.summary` | Summary | 요약 |
| `row.trend` | Trends | 추이 |
| `row.ruleSets` | Rule sets | 규칙 묶음 |
| `var.ruleSet` | Rule set | 규칙 묶음 |
| `var.all` | All | 전체 |
| `legend.series` | Series | 계열 |
| `legend.mean` | Mean | 평균 |
| `legend.max` | Max | 최대 |
| `legend.last` | Last | 마지막 |
| `overview.rangeInvalid` | That time range cannot be queried. | 그 기간은 조회할 수 없습니다. |
| `overview.rangeReset` | Show the last hour | 최근 1시간 보기 |
| `severity.ok` | Normal | 정상 |
| `severity.warn` | Warning | 주의 |
| `severity.bad` | Critical | 위험 |
| `nav.expand` | Expand menu | 메뉴 펼치기 |
| `nav.collapse` | Collapse menu | 메뉴 접기 |
| `nav.language` | Language | 언어 |
| `nav.theme` | Theme | 테마 |

- [ ] **Step 3: 확인** `npm run test -- src/lib && npm run typecheck`

- [ ] **Step 4: Commit** `feat(ui): add dashboard time ranges, panel statistics and CSV export`

---

### Task 3: 테마, 사이드바, TV 모드

**Files:**
- Replace: `src/app/globals.css`, `src/modules/console/Shell.tsx`, `src/app/(console)/layout.tsx`
- Create: `src/modules/console/kiosk.tsx`, `src/modules/console/persistentFlag.ts`
- Modify: `src/modules/admin/contexts/ThemeContext.tsx`(기본 다크), `src/app/layout.tsx`(`data-theme="dark"`), `src/modules/console/useLive.ts`(갱신 주기 인자)

**Interfaces:**
- Produces: 색 클래스 추가 `s1`, `s2`, `good`, `warning`, `grid`. `useKiosk(): { kiosk, setKiosk }`. `usePersistentFlag(key, fallback): [boolean, (value: boolean) => void]`. `useLive(key, fetcher, refreshMs = REFRESH_MS)`.

- [ ] **Step 1: 색**

`globals.css`의 `:root[data-theme='dark']`와 `@media (prefers-color-scheme: dark)` 두 블록을 아래 값으로 바꾸고, 라이트 `:root`에는 계열과 상태 값을 추가한다. `@theme inline`에 `--color-s1: var(--c-s1)`, `--color-s2`, `--color-good`, `--color-warning`, `--color-grid`를 추가한다. 맨 끝에 uPlot 선택 영역 색을 둔다.

```css
  /* dark */
  --c-bg: #111217;
  --c-panel: #181b1f;
  --c-panel2: #22252b;
  --c-line: #2a2d33;
  --c-line-strong: #3b3f46;
  --c-fg: #d8d9da;
  --c-fg2: #c2c4c7;
  --c-muted: #8e9196;
  --c-faint: #6c7077;
  --c-bad: #f87171;
  --c-bad-soft: #3a1517;
  --c-ok: #4ade80;
  --c-ok-soft: #10291a;
  --c-warn: #fcd34d;
  --c-warn-soft: #2d2410;
  --c-warn-line: #8a6a12;
  --c-bar: #4a4e56;
  --c-select: #1d2a40;
  --c-s1: #3987e5;
  --c-s2: #d03b3b;
  --c-good: #0ca30c;
  --c-warning: #fab219;
  --c-grid: #ffffff14;
```

```css
  /* light additions */
  --c-s1: #2a78d6;
  --c-s2: #d03b3b;
  --c-good: #0ca30c;
  --c-warning: #fab219;
  --c-grid: #0000000f;
```

```css
.u-select {
  background: color-mix(in srgb, var(--c-s1) 18%, transparent);
}
```

`ThemeContext.tsx`의 `readMode` 기본값과 서버 스냅샷을 `'system'`에서 `'dark'`로 바꾼다. `app/layout.tsx`의 `<html>`에 `data-theme="dark"`를 추가한다.

- [ ] **Step 2: 공통 훅**

```ts
// src/modules/console/persistentFlag.ts
'use client';

import { useCallback, useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
const memory = new Map<string, boolean>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function read(key: string, fallback: boolean): boolean {
  if (memory.has(key)) return memory.get(key) as boolean;
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : value === '1';
  } catch {
    return fallback;
  }
}

export function usePersistentFlag(key: string, fallback: boolean): [boolean, (value: boolean) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => read(key, fallback),
    () => fallback
  );
  const set = useCallback(
    (next: boolean) => {
      memory.set(key, next);
      try {
        window.localStorage.setItem(key, next ? '1' : '0');
      } catch {
        // Storage can be blocked, the choice then lasts for this page only.
      }
      listeners.forEach((listener) => listener());
    },
    [key]
  );
  return [value, set];
}
```

```tsx
// src/modules/console/kiosk.tsx
'use client';

import { createContext, useContext } from 'react';

export interface KioskValue {
  kiosk: boolean;
  setKiosk: (on: boolean) => void;
}

export const KioskContext = createContext<KioskValue>({ kiosk: false, setKiosk: () => {} });

export const useKiosk = () => useContext(KioskContext);
```

`useLive.ts`: 시그니처를 `useLive<T>(key: string | null, fetcher: () => Promise<T>, refreshMs: number = REFRESH_MS)`로 바꾸고 `refreshInterval: refreshMs`를 쓴다.

- [ ] **Step 3: 사이드바와 TV 모드**

```tsx
// src/modules/console/Shell.tsx
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { signOut } from 'next-auth/react';
import {
  Gauge,
  History,
  KeyRound,
  Languages,
  ListChecks,
  LogOut,
  Minimize2,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  SunMoon,
} from 'lucide-react';

import { AUDIT_FAILED_EVENT } from '@/lib/api';
import { type MessageKey } from '@/lib/i18n';
import { type ColorMode, useTheme } from '@/modules/admin';

import { useI18n } from './I18nProvider';
import { KioskContext } from './kiosk';
import { useMe } from './MeProvider';
import { usePersistentFlag } from './persistentFlag';
import { Notice } from './ui';

const NAV: { href: string; label: MessageKey; icon: typeof Gauge; adminOnly: boolean }[] = [
  { href: '/overview', label: 'nav.overview', icon: Gauge, adminOnly: false },
  { href: '/rules', label: 'nav.rules', icon: ListChecks, adminOnly: false },
  { href: '/keys', label: 'nav.keys', icon: KeyRound, adminOnly: true },
  { href: '/audit', label: 'nav.audit', icon: History, adminOnly: true },
];

const NEXT_MODE: Record<ColorMode, ColorMode> = { dark: 'light', light: 'system', system: 'dark' };
const MODE_ICON = { dark: Moon, light: Sun, system: SunMoon };

const RAIL_BUTTON =
  'flex h-8 w-full items-center gap-2 rounded px-2 text-muted hover:bg-panel2 hover:text-fg';

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const { t, locale, setLocale } = useI18n();
  const { mode, setMode } = useTheme();
  const { me, isAdmin } = useMe();
  const [expanded, setExpanded] = usePersistentFlag('studio-sidebar-expanded', false);
  const [auditFailed, setAuditFailed] = useState(false);

  const kiosk = params.has('kiosk');
  const setKiosk = useCallback(
    (on: boolean) => {
      const next = new URLSearchParams(params.toString());
      if (on) next.set('kiosk', '');
      else next.delete('kiosk');
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, pathname, router]
  );
  const kioskValue = useMemo(() => ({ kiosk, setKiosk }), [kiosk, setKiosk]);

  useEffect(() => {
    const onFailure = () => setAuditFailed(true);
    window.addEventListener(AUDIT_FAILED_EVENT, onFailure);
    return () => window.removeEventListener(AUDIT_FAILED_EVENT, onFailure);
  }, []);

  useEffect(() => {
    if (!kiosk) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setKiosk(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [kiosk, setKiosk]);

  const ModeIcon = MODE_ICON[mode];
  const label = (text: string) => (expanded ? <span className="truncate">{text}</span> : null);

  return (
    <KioskContext.Provider value={kioskValue}>
      <div className="flex min-h-screen bg-bg text-fg">
        {!kiosk && (
          <aside
            className={`sticky top-0 flex h-screen shrink-0 flex-col border-r border-line bg-panel px-1.5 py-2 text-xs ${expanded ? 'w-44' : 'w-12'}`}
          >
            <div className="mb-3 flex h-8 items-center gap-2 px-2 text-sm font-semibold">
              <span className="inline-block h-4 w-4 shrink-0 rounded bg-s1" />
              {label('FluxGate')}
            </div>
            <nav className="flex flex-col gap-0.5">
              {NAV.filter((item) => !item.adminOnly || isAdmin).map((item) => {
                const active = pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={t(item.label)}
                    aria-current={active ? 'page' : undefined}
                    className={`relative flex h-8 items-center gap-2 rounded px-2 ${active ? 'bg-panel2 text-fg' : 'text-muted hover:bg-panel2 hover:text-fg'}`}
                  >
                    {active && <span className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded bg-s1" />}
                    <Icon size={16} className="shrink-0" />
                    {label(t(item.label))}
                  </Link>
                );
              })}
            </nav>
            <div className="mt-auto flex flex-col gap-0.5">
              {expanded && me && (
                <div className="mb-1 px-2 text-[11px] text-muted">
                  <div className="truncate text-fg2">{me.name || me.username}</div>
                  <div>{t(me.canWrite ? 'role.admin' : 'role.viewer')}</div>
                </div>
              )}
              <button
                type="button"
                title={t('nav.language')}
                className={RAIL_BUTTON}
                onClick={() => setLocale(locale === 'ko' ? 'en' : 'ko')}
              >
                <Languages size={16} className="shrink-0" />
                {label(locale === 'ko' ? '한국어' : 'English')}
              </button>
              <button
                type="button"
                title={`${t('nav.theme')}: ${t(`mode.${mode}` as MessageKey)}`}
                className={RAIL_BUTTON}
                onClick={() => setMode(NEXT_MODE[mode])}
              >
                <ModeIcon size={16} className="shrink-0" />
                {label(t(`mode.${mode}` as MessageKey))}
              </button>
              <button
                type="button"
                title={t('common.signOut')}
                className={RAIL_BUTTON}
                onClick={() => signOut({ callbackUrl: '/login' })}
              >
                <LogOut size={16} className="shrink-0" />
                {label(t('common.signOut'))}
              </button>
              <button
                type="button"
                title={t(expanded ? 'nav.collapse' : 'nav.expand')}
                className={RAIL_BUTTON}
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? (
                  <PanelLeftClose size={16} className="shrink-0" />
                ) : (
                  <PanelLeftOpen size={16} className="shrink-0" />
                )}
                {label(t('nav.collapse'))}
              </button>
            </div>
          </aside>
        )}
        <main className="min-w-0 flex-1 p-4">
          {kiosk && (
            <button
              type="button"
              onClick={() => setKiosk(false)}
              className="fixed top-2 right-2 z-50 inline-flex items-center gap-1 rounded border border-line bg-panel2 px-2 py-1 text-xs text-fg2 opacity-60 hover:opacity-100"
            >
              <Minimize2 size={12} />
              {t('tv.exit')}
            </button>
          )}
          {auditFailed && (
            <Notice tone="warn" onClose={() => setAuditFailed(false)}>
              {t('common.auditFailed')}
            </Notice>
          )}
          {children}
        </main>
      </div>
    </KioskContext.Provider>
  );
}
```

```tsx
// src/app/(console)/layout.tsx
'use client';

import React, { Suspense } from 'react';

import { ThemeProvider } from '@/modules/admin';
import { I18nProvider } from '@/modules/console/I18nProvider';
import { MeProvider } from '@/modules/console/MeProvider';
import { Shell } from '@/modules/console/Shell';

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <I18nProvider>
        <MeProvider>
          <Suspense>
            <Shell>{children}</Shell>
          </Suspense>
        </MeProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
```

- [ ] **Step 4: 확인** `npm run lint && npm run typecheck && npm run build`

- [ ] **Step 5: Commit** `feat(ui): default to a Grafana like dark theme with an icon rail and TV mode`

---

### Task 4: 패널 컴포넌트와 uPlot 시계열

**Files:**
- Replace: `src/modules/console/ui.tsx`, `src/modules/console/charts.tsx`
- Create: `src/modules/console/TimeRangePicker.tsx`, `src/modules/console/useDashboardState.ts`

**Interfaces:**
- Consumes: Task 2, 3
- Produces:
  - ui: 기존 `TH`, `TD`, `BUTTON`, `BUTTON_PRIMARY`, `INPUT`, `PageHeader`, `WindowPicker`, `LiveStatus`, `Notice`, `Forbidden` 유지. 추가 `TableData`, `Panel({ title, actions, className, bodyClassName, data, csvName, children })`(children은 노드 또는 `(large: boolean) => ReactNode`), `DataTable`, `Row({ id, title, children })`, `StatPanel({ title, value, unit, severity, spark, color })`, `SeverityIcon({ severity })`, `severityMark(severity)`
  - charts: `SeriesSpec { label; color; values }`, `TimeSeries({ times, series, height, syncKey, onZoom, formatTime, formatTooltipTime })`, `Legend({ series })`, `Sparkline({ values, color, width, height, area, stretch, className })`, `BarGauge({ value, max, color, label })`
  - `TimeRangePicker({ state, onChange, onRefresh })`
  - `useDashboardState(): [DashboardState, (next: Partial<DashboardState>) => void]`

- [ ] **Step 1: 구현**

```tsx
// src/modules/console/ui.tsx
'use client';

import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  EllipsisVertical,
  Maximize2,
  Table2,
  XOctagon,
} from 'lucide-react';

import { downloadCsv, toCsv } from '@/lib/csv';
import { formatAgo, formatClock } from '@/lib/format';
import { type MessageKey } from '@/lib/i18n';
import { type Severity } from '@/lib/stats';

import { Sparkline } from './charts';
import { useI18n } from './I18nProvider';
import { useKiosk } from './kiosk';
import { usePersistentFlag } from './persistentFlag';
import { useNow } from './useLive';

export const TH = 'border-b border-line px-2 py-1.5 text-left text-[11px] font-medium text-s1';
export const TD = 'border-b border-line/60 px-2 py-1.5 align-top';
export const BUTTON =
  'inline-flex items-center gap-1 rounded border border-line-strong bg-panel2 px-2 py-1 text-xs text-fg hover:border-fg2 disabled:opacity-50';
export const BUTTON_PRIMARY =
  'inline-flex items-center gap-1 rounded bg-s1 px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50';
export const INPUT =
  'rounded border border-line-strong bg-panel2 px-2 py-1 text-xs text-fg placeholder:text-faint focus:border-s1 focus:outline-none';

export interface TableData {
  headers: string[];
  rows: (string | number | null)[][];
}

export function PageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  const { kiosk } = useKiosk();
  if (kiosk) return null;
  return (
    <div className="sticky top-0 z-30 -mx-4 -mt-4 mb-3 flex flex-wrap items-center gap-2 border-b border-line bg-panel px-4 py-2">
      <div className="text-xs text-muted">
        FluxGate<span className="mx-1.5">›</span>
        <span className="font-medium text-fg">{title}</span>
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function DataTable({ data }: { data: TableData }) {
  return (
    <table className="w-full">
      <thead>
        <tr>
          {data.headers.map((header) => (
            <th key={header} className={TH}>
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.rows.map((row, index) => (
          <tr key={index}>
            {row.map((value, column) => (
              <td key={column} className={`${TD} num`}>
                {value ?? ''}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MenuItem({
  icon: Icon,
  onClick,
  children,
}: {
  icon: typeof Maximize2;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-line"
    >
      <Icon size={13} />
      {children}
    </button>
  );
}

export function Panel({
  title,
  actions,
  className = '',
  bodyClassName = '',
  data,
  csvName,
  children,
}: {
  title?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  data?: TableData;
  csvName?: string;
  children: React.ReactNode | ((large: boolean) => React.ReactNode);
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<'normal' | 'view' | 'data'>('normal');
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (mode === 'normal') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMode('normal');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode]);

  const body = (large: boolean) => (typeof children === 'function' ? children(large) : children);
  const choose = (next: 'view' | 'data') => {
    setMenuOpen(false);
    setMode(next);
  };

  return (
    <section className={`relative rounded border border-line bg-panel ${className}`}>
      {title && (
        <header className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-fg">
          <span className="truncate">{title}</span>
          <div className="ml-auto flex items-center gap-1">
            {actions}
            <div className="relative">
              <button
                type="button"
                aria-label={t('panel.menu')}
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen(!menuOpen)}
                className="rounded px-0.5 text-muted hover:bg-panel2 hover:text-fg"
              >
                <EllipsisVertical size={14} />
              </button>
              {menuOpen && (
                <div
                  className="absolute right-0 z-40 mt-1 w-40 rounded border border-line bg-panel2 py-1 text-xs font-normal shadow-lg"
                  onMouseLeave={() => setMenuOpen(false)}
                >
                  <MenuItem icon={Maximize2} onClick={() => choose('view')}>
                    {t('panel.view')}
                  </MenuItem>
                  {data && (
                    <MenuItem icon={Table2} onClick={() => choose('data')}>
                      {t('panel.data')}
                    </MenuItem>
                  )}
                  {data && (
                    <MenuItem
                      icon={Download}
                      onClick={() => {
                        setMenuOpen(false);
                        downloadCsv(csvName ?? 'panel.csv', toCsv(data.headers, data.rows));
                      }}
                    >
                      {t('panel.csv')}
                    </MenuItem>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>
      )}
      <div className={bodyClassName}>{body(false)}</div>
      {mode !== 'normal' && (
        <div className="fixed inset-0 z-50 flex flex-col bg-bg p-6" role="dialog" aria-modal>
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-sm font-semibold">{title}</h2>
            <button type="button" className={`${BUTTON} ml-auto`} onClick={() => setMode('normal')}>
              {t('common.close')}
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto rounded border border-line bg-panel p-3">
            {mode === 'view' ? body(true) : data && <DataTable data={data} />}
          </div>
        </div>
      )}
    </section>
  );
}

export function Row({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  const [open, setOpen] = usePersistentFlag(`studio-row-${id}`, true);
  const Icon = open ? ChevronDown : ChevronRight;
  return (
    <div className="mb-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="mb-1.5 flex items-center gap-1 text-xs font-medium text-fg2 hover:text-fg"
      >
        <Icon size={14} />
        {title}
      </button>
      {open && children}
    </div>
  );
}

const SEVERITY_ICON = { ok: CheckCircle2, warn: AlertTriangle, bad: XOctagon };
const SEVERITY_TEXT = { ok: 'text-ok', warn: 'text-warn', bad: 'text-bad' };
const SEVERITY_MARK = { ok: '--c-good', warn: '--c-warning', bad: '--c-s2' };

export function severityMark(severity: Severity): string {
  return SEVERITY_MARK[severity];
}

export function SeverityIcon({ severity, size = 14 }: { severity: Severity; size?: number }) {
  const { t } = useI18n();
  const Icon = SEVERITY_ICON[severity];
  return (
    <Icon
      size={size}
      role="img"
      aria-label={t(`severity.${severity}` as MessageKey)}
      className={SEVERITY_TEXT[severity]}
    />
  );
}

export function StatPanel({
  title,
  value,
  unit,
  severity,
  spark,
  color = '--c-s1',
}: {
  title: string;
  value: string;
  unit?: string;
  severity?: Severity;
  spark?: number[];
  color?: string;
}) {
  return (
    <Panel
      title={title}
      data={spark ? { headers: ['#', title], rows: spark.map((point, index) => [index + 1, point]) } : undefined}
      csvName={`${title}.csv`}
    >
      {(large) => (
        <div className={`relative ${large ? 'h-96' : 'h-16'}`}>
          <div
            className={`relative z-10 flex items-center gap-1.5 px-3 ${severity ? SEVERITY_TEXT[severity] : 'text-fg'}`}
          >
            {severity && <SeverityIcon severity={severity} size={18} />}
            <span className={`num leading-9 ${large ? 'text-6xl' : 'text-2xl'}`}>{value}</span>
            {unit && <span className="text-sm text-muted">{unit}</span>}
          </div>
          {spark && (
            <Sparkline
              values={spark}
              color={color}
              area
              stretch
              height={large ? 240 : 36}
              className="absolute inset-x-0 bottom-0"
            />
          )}
        </div>
      )}
    </Panel>
  );
}

export function WindowPicker<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="inline-flex rounded border border-line-strong bg-panel2 p-0.5" role="group">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          aria-pressed={option === value}
          className={`rounded-sm px-2 py-0.5 text-xs ${option === value ? 'bg-s1 text-white' : 'text-fg2 hover:bg-line'}`}
        >
          {t(`window.${option}` as MessageKey)}
        </button>
      ))}
    </div>
  );
}

export function LiveStatus({ updatedAt, error }: { updatedAt: number | null; error: unknown }) {
  const { t, locale } = useI18n();
  const now = useNow();
  if (error && updatedAt) {
    return (
      <span className="rounded border border-warn-line bg-warn-soft px-2 py-0.5 text-[11px] text-warn">
        {t('common.refreshFailed', { time: formatClock(updatedAt) })}
      </span>
    );
  }
  if (!updatedAt || !now) return null;
  return (
    <span className="text-[11px] text-muted">
      {t('common.updated', { ago: formatAgo(updatedAt, now, locale) })}
    </span>
  );
}

export function Notice({
  tone = 'info',
  children,
  onClose,
}: {
  tone?: 'info' | 'bad' | 'warn';
  children: React.ReactNode;
  onClose?: () => void;
}) {
  const { t } = useI18n();
  const style =
    tone === 'bad'
      ? 'border-bad bg-bad-soft text-bad'
      : tone === 'warn'
        ? 'border-warn-line bg-warn-soft text-warn'
        : 'border-line bg-panel2 text-fg2';
  return (
    <div className={`mb-3 flex items-start gap-2 rounded border px-3 py-2 text-xs ${style}`}>
      <div className="flex-1">{children}</div>
      {onClose && (
        <button type="button" onClick={onClose} className="text-[11px] underline">
          {t('common.dismiss')}
        </button>
      )}
    </div>
  );
}

export function Forbidden() {
  const { t } = useI18n();
  return <Notice tone="warn">{t('common.forbidden')}</Notice>;
}
```

```tsx
// src/modules/console/charts.tsx
'use client';

import 'uplot/dist/uPlot.min.css';

import React, { useEffect, useRef, useState } from 'react';
import uPlot from 'uplot';

import { formatCount } from '@/lib/format';
import { legendStats } from '@/lib/stats';
import { useTheme } from '@/modules/admin';

import { useI18n } from './I18nProvider';

export interface SeriesSpec {
  label: string;
  color: string;
  values: number[];
}

interface Hover {
  idx: number;
  left: number;
  top: number;
  flip: boolean;
}

function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#8e9196';
}

function translucent(color: string): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? `${color}26` : color;
}

function toData(times: number[], series: SeriesSpec[]): uPlot.AlignedData {
  return [times.map((time) => time / 1000), ...series.map((spec) => spec.values)];
}

export function TimeSeries({
  times,
  series,
  height = 220,
  syncKey,
  onZoom,
  formatTime,
  formatTooltipTime,
}: {
  times: number[];
  series: SeriesSpec[];
  height?: number;
  syncKey?: string;
  onZoom?: (from: number, to: number) => void;
  formatTime: (timestamp: number) => string;
  formatTooltipTime?: (timestamp: number) => string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<uPlot | null>(null);
  const latest = useRef({ times, series, onZoom, formatTime });
  const [hover, setHover] = useState<Hover | null>(null);
  const { mode } = useTheme();
  const signature = series.map((spec) => `${spec.label}:${spec.color}`).join('|');

  useEffect(() => {
    latest.current = { times, series, onZoom, formatTime };
    chart.current?.setData(toData(times, series));
  }, [times, series, onZoom, formatTime]);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const initial = latest.current;
    const axis = {
      stroke: token('--c-muted'),
      grid: { stroke: token('--c-grid'), width: 1 },
      ticks: { show: false },
      font: '11px system-ui, sans-serif',
    };
    const plot = new uPlot(
      {
        width: element.clientWidth,
        height,
        legend: { show: false },
        cursor: {
          sync: syncKey ? { key: syncKey } : undefined,
          drag: { x: true, y: false, setScale: false },
          points: { size: 7 },
        },
        scales: { x: { time: true } },
        axes: [
          {
            ...axis,
            values: (_plot, splits) => splits.map((split) => latest.current.formatTime(split * 1000)),
          },
          { ...axis, size: 48 },
        ],
        series: [
          {},
          ...initial.series.map((spec) => {
            const color = token(spec.color);
            return {
              label: spec.label,
              stroke: color,
              width: 2,
              fill: translucent(color),
              points: { show: false },
            };
          }),
        ],
        hooks: {
          setSelect: [
            (u) => {
              const zoom = latest.current.onZoom;
              if (zoom && u.select.width > 4) {
                zoom(
                  Math.round(u.posToVal(u.select.left, 'x') * 1000),
                  Math.round(u.posToVal(u.select.left + u.select.width, 'x') * 1000)
                );
              }
              u.setSelect({ left: 0, top: 0, width: 0, height: 0 }, false);
            },
          ],
          setCursor: [
            (u) => {
              const { idx, left, top } = u.cursor;
              if (idx == null || left == null || left < 0) {
                setHover(null);
                return;
              }
              setHover({
                idx,
                left: left + u.over.offsetLeft,
                top: (top ?? 0) + u.over.offsetTop,
                flip: left > u.over.clientWidth * 0.6,
              });
            },
          ],
        },
      },
      toData(initial.times, initial.series),
      element
    );
    chart.current = plot;
    const observer = new ResizeObserver(() => plot.setSize({ width: element.clientWidth, height }));
    observer.observe(element);
    return () => {
      observer.disconnect();
      plot.destroy();
      chart.current = null;
    };
  }, [mode, height, syncKey, signature]);

  const tooltipTime = formatTooltipTime ?? formatTime;
  const point = hover !== null && times[hover.idx] !== undefined ? hover : null;

  return (
    <div className="relative" onMouseLeave={() => setHover(null)}>
      <div ref={host} />
      {point && (
        <div
          className="pointer-events-none absolute z-10 min-w-32 rounded border border-line bg-panel2 px-2 py-1.5 text-[11px] shadow-lg"
          style={{
            left: point.left,
            top: Math.max(0, point.top - 12),
            transform: point.flip ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)',
          }}
        >
          <div className="num mb-1 text-muted">{tooltipTime(times[point.idx])}</div>
          {series.map((spec) => (
            <div key={spec.label} className="flex items-center gap-2">
              <span className="inline-block h-0.5 w-3" style={{ background: `var(${spec.color})` }} />
              <span className="text-fg2">{spec.label}</span>
              <span className="num ml-auto text-fg">{formatCount(spec.values[point.idx] ?? 0)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Legend({ series }: { series: SeriesSpec[] }) {
  const { t } = useI18n();
  const head = 'px-2 py-1 text-right font-normal text-muted';
  return (
    <table className="mt-1 w-full text-xs">
      <thead>
        <tr>
          <th className="px-2 py-1 text-left font-normal text-muted">{t('legend.series')}</th>
          <th className={head}>{t('legend.mean')}</th>
          <th className={head}>{t('legend.max')}</th>
          <th className={head}>{t('legend.last')}</th>
        </tr>
      </thead>
      <tbody>
        {series.map((spec) => {
          const stats = legendStats(spec.values);
          return (
            <tr key={spec.label}>
              <td className="px-2 py-0.5">
                <span
                  className="mr-2 inline-block h-0.5 w-3 align-middle"
                  style={{ background: `var(${spec.color})` }}
                />
                {spec.label}
              </td>
              <td className="num px-2 text-right">{stats.mean.toFixed(1)}</td>
              <td className="num px-2 text-right">{formatCount(stats.max)}</td>
              <td className="num px-2 text-right">{formatCount(stats.last)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function Sparkline({
  values,
  color = '--c-s2',
  width = 72,
  height = 16,
  area = false,
  stretch = false,
  className = '',
}: {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
  area?: boolean;
  stretch?: boolean;
  className?: string;
}) {
  const w = stretch ? 100 : width;
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const coords = values.map(
    (value, index) =>
      `${(index * step).toFixed(2)},${(height - 1 - (value / max) * (height - 2)).toFixed(2)}`
  );
  const active = values.some((value) => value > 0);
  const stroke = active ? `var(${color})` : 'var(--c-faint)';
  return (
    <svg
      viewBox={`0 0 ${w} ${height}`}
      width={stretch ? '100%' : width}
      height={height}
      preserveAspectRatio="none"
      aria-hidden
      className={className}
    >
      {area && coords.length > 1 && (
        <polygon points={`0,${height} ${coords.join(' ')} ${w},${height}`} fill={stroke} opacity={0.15} />
      )}
      <polyline
        points={coords.join(' ')}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function BarGauge({
  value,
  max,
  color,
  label,
}: {
  value: number;
  max: number;
  color: string;
  label: string;
}) {
  const ratio = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-sm bg-panel2">
        <div className="h-full rounded-sm" style={{ width: `${ratio * 100}%`, background: `var(${color})` }} />
      </div>
      <span className="num w-14 text-right">{label}</span>
    </div>
  );
}
```

```ts
// src/modules/console/useDashboardState.ts
'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { type DashboardState, parseState, serializeState } from '@/lib/timeRange';

export function useDashboardState(): [DashboardState, (next: Partial<DashboardState>) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const query = params.toString();
  const state = useMemo(() => parseState(new URLSearchParams(query)), [query]);
  const update = useCallback(
    (next: Partial<DashboardState>) => {
      const merged = { ...state, ...next };
      const serialized = serializeState(merged, new URLSearchParams(query)).toString();
      router.replace(`${pathname}?${serialized}`, { scroll: false });
    },
    [state, query, router, pathname]
  );
  return [state, update];
}
```

```tsx
// src/modules/console/TimeRangePicker.tsx
'use client';

import React, { useState } from 'react';
import { ChevronDown, Clock, Monitor, RefreshCw, ZoomOut } from 'lucide-react';

import {
  type DashboardState,
  PRESETS,
  rangeLabel,
  REFRESH_OPTIONS,
  type RefreshInterval,
  zoomOut,
} from '@/lib/timeRange';

import { useI18n } from './I18nProvider';
import { useKiosk } from './kiosk';
import { BUTTON, INPUT } from './ui';

export function TimeRangePicker({
  state,
  onChange,
  onRefresh,
}: {
  state: DashboardState;
  onChange: (next: Partial<DashboardState>) => void;
  onRefresh: () => void;
}) {
  const { t, locale } = useI18n();
  const { setKiosk } = useKiosk();
  const [open, setOpen] = useState(false);
  const absolute = state.range.kind === 'absolute';

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        className={BUTTON}
        title={t('range.zoomOut')}
        aria-label={t('range.zoomOut')}
        onClick={() => onChange({ range: zoomOut(state.range, Date.now()) })}
      >
        <ZoomOut size={13} />
      </button>
      <div className="relative">
        <button type="button" className={BUTTON} aria-expanded={open} onClick={() => setOpen(!open)}>
          <Clock size={13} />
          {rangeLabel(state.range, locale)}
          <ChevronDown size={12} />
        </button>
        {open && (
          <div
            className="absolute right-0 z-40 mt-1 w-44 rounded border border-line bg-panel2 py-1 text-xs shadow-lg"
            onMouseLeave={() => setOpen(false)}
          >
            {PRESETS.map((preset) => {
              const active = state.range.kind === 'relative' && state.range.preset === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  className={`block w-full px-3 py-1.5 text-left hover:bg-line ${active ? 'font-medium text-s1' : ''}`}
                  onClick={() => {
                    setOpen(false);
                    onChange({ range: { kind: 'relative', preset } });
                  }}
                >
                  {rangeLabel({ kind: 'relative', preset }, locale)}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <button
        type="button"
        className={BUTTON}
        title={t('refresh.now')}
        aria-label={t('refresh.now')}
        onClick={onRefresh}
      >
        <RefreshCw size={13} />
      </button>
      <select
        aria-label={t('refresh.interval')}
        title={t('refresh.interval')}
        value={absolute ? 'off' : state.refresh}
        disabled={absolute}
        onChange={(event) => onChange({ refresh: event.target.value as RefreshInterval })}
        className={INPUT}
      >
        {REFRESH_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option === 'off' ? t('refresh.off') : option}
          </option>
        ))}
      </select>
      <button
        type="button"
        className={BUTTON}
        title={t('tv.enter')}
        aria-label={t('tv.enter')}
        onClick={() => setKiosk(true)}
      >
        <Monitor size={13} />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: 확인** `npm run lint && npm run typecheck`

- [ ] **Step 3: Commit** `feat(ui): add panels with menus, collapsible rows and uPlot time series`

---

### Task 5: 개요 화면

**Files:**
- Replace: `src/modules/console/screens/OverviewScreen.tsx`

- [ ] **Step 1: 구현**

```tsx
// src/modules/console/screens/OverviewScreen.tsx
'use client';

import React, { useCallback, useMemo } from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { useSWRConfig } from 'swr';

import {
  ApiError,
  fetchDashboardStats,
  fetchOverview,
  fetchTimeseries,
  fetchTopRejected,
} from '@/lib/api';
import {
  formatAgo,
  formatBucket,
  formatClock,
  formatCount,
  formatHourMinute,
  formatPercent,
  formatTimestamp,
} from '@/lib/format';
import { BAD_RATE, bucketRates, rateSeverity, summarize } from '@/lib/stats';
import { apiRangeParams, DEFAULT_RANGE, rangeKey, refreshMillis, zoomTo } from '@/lib/timeRange';

import { BarGauge, Legend, type SeriesSpec, Sparkline, TimeSeries } from '../charts';
import { useI18n } from '../I18nProvider';
import { useKiosk } from '../kiosk';
import { useMe } from '../MeProvider';
import { TimeRangePicker } from '../TimeRangePicker';
import {
  LiveStatus,
  Notice,
  PageHeader,
  Panel,
  Row,
  SeverityIcon,
  severityMark,
  StatPanel,
  TD,
  TH,
} from '../ui';
import { useDashboardState } from '../useDashboardState';
import { useLive, useNow } from '../useLive';

export function OverviewScreen() {
  const { t, locale } = useI18n();
  const { isAdmin } = useMe();
  const { kiosk } = useKiosk();
  const now = useNow();
  const { mutate } = useSWRConfig();
  const [state, update] = useDashboardState();

  const params = apiRangeParams(state.range);
  const key = rangeKey(state.range);
  const refresh = refreshMillis(state);
  const ruleSet = state.ruleSet ?? undefined;

  const series = useLive(`series:${key}:${ruleSet ?? ''}`, () => fetchTimeseries(params, ruleSet), refresh);
  const overview = useLive(`overview:${key}`, () => fetchOverview(params), refresh);
  const top = useLive(`top:${key}:${ruleSet ?? ''}`, () => fetchTopRejected(params, 10, ruleSet), refresh);
  const stats = useLive('stats', fetchDashboardStats, refresh);

  const buckets = useMemo(() => series.data?.buckets ?? [], [series.data]);
  const summary = summarize(buckets);
  const times = useMemo(() => buckets.map((bucket) => bucket.start), [buckets]);
  const lines: SeriesSpec[] = useMemo(
    () => [
      { label: t('decision.allowed'), color: '--c-s1', values: buckets.map((bucket) => bucket.allowed) },
      { label: t('decision.rejected'), color: '--c-s2', values: buckets.map((bucket) => bucket.rejected) },
    ],
    [buckets, t]
  );
  const onZoom = useCallback(
    (from: number, to: number) => update({ range: zoomTo(from, to, Date.now()) }),
    [update]
  );

  const allSets = overview.data?.ruleSets ?? [];
  const sets = allSets.filter((set) => !state.ruleSet || set.ruleSetId === state.ruleSet);
  const topRows = top.data ?? [];
  const maxRejected = Math.max(1, ...topRows.map((row) => row.rejected));
  const maxRate = Math.max(BAD_RATE * 2, ...sets.map((set) => set.rejectRate));
  const invalidRange =
    state.range.kind === 'absolute' && series.error instanceof ApiError && series.error.status === 400;
  const external = process.env.NEXT_PUBLIC_EXTERNAL_DASHBOARD_URL;
  const ago = (timestamp: number | null) =>
    timestamp && now ? formatAgo(timestamp, now, locale) : t('overview.never');

  return (
    <div>
      <PageHeader title={t('overview.title')}>
        {external && (
          <a
            href={external}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-fg2 hover:text-fg"
          >
            {t('overview.external')}
            <ExternalLink size={12} />
          </a>
        )}
        <LiveStatus updatedAt={series.updatedAt} error={series.error} />
        <TimeRangePicker state={state} onChange={update} onRefresh={() => mutate(() => true)} />
      </PageHeader>

      {!kiosk && (
        <div className="mb-3 flex items-center gap-2">
          <label className="flex items-center overflow-hidden rounded border border-line-strong text-xs">
            <span className="border-r border-line-strong bg-panel2 px-2 py-1 text-muted">
              {t('var.ruleSet')}
            </span>
            <select
              value={state.ruleSet ?? ''}
              onChange={(event) => update({ ruleSet: event.target.value || null })}
              className="bg-panel px-2 py-1 text-fg focus:outline-none"
            >
              <option value="">{t('var.all')}</option>
              {allSets.map((set) => (
                <option key={set.ruleSetId} value={set.ruleSetId}>
                  {set.ruleSetId}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {invalidRange && (
        <Notice tone="warn">
          {t('overview.rangeInvalid')}{' '}
          <button type="button" className="underline" onClick={() => update({ range: DEFAULT_RANGE })}>
            {t('overview.rangeReset')}
          </button>
        </Notice>
      )}
      {series.error && !series.data && !invalidRange && (
        <Notice tone="bad">{(series.error as Error).message}</Notice>
      )}
      {overview.data &&
        overview.data.total === 0 &&
        overview.data.ruleSets.every((set) => set.lastDecisionAt === null) && (
          <Notice>{t('overview.noEvents')}</Notice>
        )}

      <Row id="summary" title={t('row.summary')}>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <StatPanel
            title={t('overview.decisions')}
            value={series.data ? formatCount(summary.total) : '–'}
            spark={buckets.map((bucket) => bucket.allowed + bucket.rejected)}
            color="--c-s1"
          />
          <StatPanel
            title={t('overview.rejected')}
            value={series.data ? formatCount(summary.rejected) : '–'}
            spark={buckets.map((bucket) => bucket.rejected)}
            color="--c-s2"
          />
          <StatPanel
            title={t('overview.rejectRate')}
            value={series.data ? (summary.rate * 100).toFixed(1) : '–'}
            unit="%"
            severity={series.data ? rateSeverity(summary.rate) : undefined}
            spark={bucketRates(buckets)}
            color="--c-warning"
          />
          <StatPanel
            title={t('overview.activeRules')}
            value={stats.data ? String(stats.data.activeRules) : '–'}
            unit={stats.data ? `/ ${stats.data.totalRules}` : undefined}
          />
        </div>
      </Row>

      <Row id="trend" title={t('row.trend')}>
        <div className="grid items-start gap-2 lg:grid-cols-3">
          <Panel
            title={`${t('overview.trend')}${series.data ? ` · ${formatBucket(series.data.bucketMillis)}` : ''}`}
            className="lg:col-span-2"
            data={{
              headers: [t('col.time'), t('decision.allowed'), t('decision.rejected')],
              rows: buckets.map((bucket) => [formatTimestamp(bucket.start), bucket.allowed, bucket.rejected]),
            }}
            csvName="decisions.csv"
          >
            {(large) => (
              <div className="px-2 pb-2">
                <TimeSeries
                  times={times}
                  series={lines}
                  height={large ? 520 : 240}
                  syncKey="overview"
                  onZoom={onZoom}
                  formatTime={formatHourMinute}
                  formatTooltipTime={formatClock}
                />
                <Legend series={lines} />
              </div>
            )}
          </Panel>
          <Panel
            title={t('overview.topRejected')}
            data={{
              headers: [t('col.key'), t('col.ruleSet'), t('col.rejected'), t('col.lastRejected')],
              rows: topRows.map((row) => [row.key, row.ruleSetId, row.rejected, formatTimestamp(row.lastRejectedAt)]),
            }}
            csvName="top-rejected.csv"
          >
            <table className="w-full">
              <thead>
                <tr>
                  <th className={TH}>{t('col.key')}</th>
                  <th className={TH}>{t('col.ruleSet')}</th>
                  <th className={`${TH} w-32`}>{t('col.rejected')}</th>
                  <th className={TH}>{t('col.lastRejected')}</th>
                </tr>
              </thead>
              <tbody>
                {topRows.map((row) => (
                  <tr key={`${row.ruleSetId}:${row.key}`}>
                    <td className={`${TD} num`}>
                      {isAdmin && !row.masked ? (
                        <Link href={`/keys?value=${encodeURIComponent(row.key)}&transform=none`} className="text-s1 hover:underline">
                          {row.key}
                        </Link>
                      ) : (
                        row.key
                      )}
                    </td>
                    <td className={`${TD} num text-fg2`}>{row.ruleSetId}</td>
                    <td className={TD}>
                      <BarGauge value={row.rejected} max={maxRejected} color="--c-s2" label={formatCount(row.rejected)} />
                    </td>
                    <td className={`${TD} text-muted`}>{ago(row.lastRejectedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>
      </Row>

      <Row id="ruleSets" title={t('row.ruleSets')}>
        <Panel
          title={t('col.ruleSet')}
          data={{
            headers: [t('col.ruleSet'), t('col.decisions'), t('col.rejected'), t('col.rejectRate'), t('col.lastDecision')],
            rows: sets.map((set) => [
              set.ruleSetId,
              set.total,
              set.rejected,
              formatPercent(set.rejectRate),
              set.lastDecisionAt ? formatTimestamp(set.lastDecisionAt) : null,
            ]),
          }}
          csvName="rule-sets.csv"
        >
          <table className="w-full">
            <thead>
              <tr>
                <th className={TH}>{t('col.ruleSet')}</th>
                <th className={TH}>{t('col.trend')}</th>
                <th className={`${TH} text-right`}>{t('col.decisions')}</th>
                <th className={`${TH} text-right`}>{t('col.rejected')}</th>
                <th className={`${TH} w-56`}>{t('col.rejectRate')}</th>
                <th className={TH}>{t('col.lastDecision')}</th>
              </tr>
            </thead>
            <tbody>
              {sets.map((set) => {
                const severity = rateSeverity(set.rejectRate);
                const selected = state.ruleSet === set.ruleSetId;
                return (
                  <tr
                    key={set.ruleSetId}
                    onClick={() => update({ ruleSet: selected ? null : set.ruleSetId })}
                    className={`cursor-pointer hover:bg-panel2 ${selected ? 'bg-select' : ''}`}
                  >
                    <td className={`${TD} num`}>{set.ruleSetId}</td>
                    <td className={TD}>
                      <Sparkline values={set.trend} />
                    </td>
                    <td className={`${TD} num text-right`}>{formatCount(set.total)}</td>
                    <td className={`${TD} num text-right`}>{formatCount(set.rejected)}</td>
                    <td className={TD}>
                      <div className="flex items-center gap-1.5">
                        <SeverityIcon severity={severity} />
                        <div className="flex-1">
                          <BarGauge
                            value={set.rejectRate}
                            max={maxRate}
                            color={severityMark(severity)}
                            label={formatPercent(set.rejectRate)}
                          />
                        </div>
                      </div>
                    </td>
                    <td className={`${TD} text-muted`}>{ago(set.lastDecisionAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      </Row>
    </div>
  );
}
```

- [ ] **Step 2: 확인** `npm run format && npm run lint && npm run typecheck && npm run build`
- [ ] **Step 3: Commit** `feat(ui): rebuild the overview as a Grafana style dashboard`

---

### Task 6: 규칙, 키 조회, 변경 기록 화면

**Files:**
- Modify: `src/modules/console/screens/RulesScreen.tsx`, `KeysScreen.tsx`, `AuditScreen.tsx`

- [ ] **Step 1: 규칙 화면**

`RulesScreen.tsx`에서 표를 감싼 `<Panel>`을 아래로 바꾼다.

```tsx
      <Panel
        title={t('rules.title')}
        data={{
          headers: [t('col.ruleSet'), t('col.rule'), t('col.scope'), t('col.limit'), t('col.meaning'), t('col.enabled')],
          rows: (rules.data ?? []).map((rule) => [
            rule.ruleSetId,
            rule.id,
            rule.scope,
            rule.bands.map(formatLimit).join(' / '),
            rule.bands.map((band) => describeBand(band, locale)).join(' / '),
            rule.enabled ? 'on' : 'off',
          ]),
        }}
        csvName="rules.csv"
      >
```

- [ ] **Step 2: 키 조회 화면**

`KeysScreen.tsx`에서 조회 폼을 패널 모양 조회줄로 바꾸고(`className="mb-3 flex flex-wrap items-center gap-2 rounded border border-line bg-panel p-2"`), `StackedBars` 패널을 아래로 바꾼다.

```tsx
          <Panel
            title={t('keys.timeline')}
            className="mb-2"
            data={{
              headers: [t('col.time'), t('decision.allowed'), t('decision.rejected')],
              rows: result.buckets.map((bucket) => [formatTimestamp(bucket.start), bucket.allowed, bucket.rejected]),
            }}
            csvName="key-decisions.csv"
          >
            {(large) => (
              <div className="px-2 pb-2">
                <TimeSeries
                  times={result.buckets.map((bucket) => bucket.start)}
                  series={[
                    { label: t('decision.allowed'), color: '--c-s1', values: result.buckets.map((bucket) => bucket.allowed) },
                    { label: t('decision.rejected'), color: '--c-s2', values: result.buckets.map((bucket) => bucket.rejected) },
                  ]}
                  height={large ? 480 : 160}
                  formatTime={formatDateTime}
                  formatTooltipTime={formatTimestamp}
                />
              </div>
            )}
          </Panel>
```

최근 판정 `Panel`에 `data`(시각, 규칙, 요청, 판정, 남은 토큰, 다시 허용까지)와 `csvName="recent-decisions.csv"`를 넣는다. 상태 카드의 상태 글자 앞에 `SeverityIcon`을 둔다(`BLOCKED`는 `bad`, `RECOVERED`는 `warn`, `ALLOWED`는 `ok`).

- [ ] **Step 3: 변경 기록 화면**

`AuditScreen.tsx`의 표를 로그 목록으로 바꾼다. 한 줄에 시각(`formatTimestamp`), 동작 배지, 사용자, 대상, 내용 요약을 두고, 줄을 누르면 그 아래에 `fetchAuditEntry`로 받은 원문을 펼친다. 동작 배지 색은 생성 `text-ok`, 삭제 `text-bad`, 키 조회 `text-s1`, 그 밖은 `text-fg2`. 오른쪽 서랍은 지운다. 목록 `Panel`에 `data`(시각, 사용자, 동작, 대상)와 `csvName="audit.csv"`를 넣는다.

- [ ] **Step 4: 확인** `npm run format && npm run lint && npm run typecheck && npm run test && npm run build`
- [ ] **Step 5: Commit** `feat(ui): align rules, key lookup and audit screens with the dashboard look`

---

### Task 7: 실행 확인과 문서

- [ ] admin-api를 다시 띄우고(8095), UI 개발 서버를 확인한다.
- [ ] Playwright로 admin 로그인 뒤 확인한다: 개요 다크 기본, 시간 범위 6시간 선택, 시계열 드래그 확대 뒤 주소가 절대값으로 바뀌는지, 축소, 규칙 묶음 변수, 자동 갱신 끄기, 패널 크게 보기, 데이터 보기, 행 접기, 사이드바 펼치기, TV 모드와 Esc. 라이트 전환 화면도 캡처한다.
- [ ] README의 기능 목록에 시간 범위, 변수, TV 모드를 추가한다.
- [ ] 백엔드와 UI 전체 검증 뒤 커밋하고 `feature/monitoring-console`에 push한다. main 머지는 하지 않는다.
