# Studio 모니터링 콘솔 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 설계 문서 `docs/specs/2026-11-14-monitoring-console-design.md`대로 Studio를 판정 이력 기반 모니터링 콘솔로 바꾼다.

**Architecture:** admin-api에 `monitoring`, `audit` 패키지를 더해 서비스가 남긴 `rate_limit_events`를 읽어 집계하고, 키 조회와 감사 기록 API를 만든다. UI는 Next.js app router의 `(console)` 그룹으로 사이드바 레이아웃과 네 화면을 만들고, 브라우저 호출은 기존 BFF 프록시를 그대로 거친다. Redis는 읽지 않는다.

**Tech Stack:** Java 21, Spring Boot 3.3, MongoDB Java driver, Testcontainers, Next.js 16, React 19, Tailwind v4, SWR, Vitest.

## Global Constraints

- 브랜치는 `main`에서 만든 `feature/monitoring-console`. `dev`, `develop`은 섞지 않는다.
- 코드 주석 본문에는 한글, 영문, 숫자, 공백, `.`, `,`, `?`, `!`만 쓴다. Javadoc의 `{@code}` 같은 기호도 쓰지 않는다.
- admin-api는 `spotless:check`와 JaCoCo 기준(라인 0.80, 분기 0.70)을 통과해야 한다.
- UI는 `lint`, `format:check`, `typecheck`, `test`, `build`를 통과해야 한다.
- 판정 이력은 `timestamp`(epoch ms) 필드로만 기간을 거른다.
- 모니터링 기간은 `5m`, `1h`, `24h`, 키 조회 기간은 `1h`, `24h`, `7d`만 받는다.
- 역할은 기존 `ROLE_USER`(viewer), `ROLE_ADMIN`(admin)을 쓴다. 키 조회와 감사 기록은 ADMIN만.
- 키 조회는 감사 기록을 먼저 저장하고, 실패하면 503으로 조회를 거부한다. 규칙 변경은 감사 기록 실패 시 변경을 유지하고 `X-Studio-Audit: failed` 헤더를 붙인다.
- 같은 조건의 모니터링 조회는 10초 캐시한다. 마스킹은 캐시 뒤에 적용한다.
- 키 마스킹: 4자 이하는 `****`, 그보다 길면 앞 2자와 뒤 2자만 남긴다.
- 차트 라이브러리는 추가하지 않는다. 새 의존성은 UI의 `swr` 하나다.

## 로컬 명령

```bash
# admin-api, 코어 0.5.0은 MEMBER-6973/.m2-fluxgate에 설치돼 있다
export DOCKER_HOST=unix:///Users/jaeseoh/.colima/mep-502/docker.sock
export TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock
M2=-Dmaven.repo.local=/Users/jaeseoh/orca/projects/MEMBER-6973/.m2-fluxgate
cd fluxgate-studio-admin-api
./mvnw -B -ntp $M2 spotless:apply
./mvnw -B -ntp $M2 test -Dtest=ClassName
./mvnw -B -ntp $M2 verify spotless:check

# UI
cd fluxgate-studio-ui-nextjs
npm run test -- src/lib/ruleMeaning.test.ts
npm run lint && npm run format:check && npm run typecheck && npm run test && npm run build
```

## 파일 구조

admin-api, 패키지 `org.fluxgate.studio.admin`

| 파일 | 책임 |
|---|---|
| `monitoring/MonitoringWindow.java` | 허용 기간과 구간 길이 |
| `monitoring/KeyMasker.java` | 키 마스킹 |
| `monitoring/TtlCache.java` | 10초 결과 캐시 |
| `monitoring/MonitoringProperties.java` | `fluxgate.studio.monitoring.*` 설정 |
| `monitoring/Bucket.java`, `RuleSetActivity.java`, `RejectedKey.java`, `KeyDecision.java` | 집계 결과 레코드 |
| `monitoring/MongoEventStore.java` | 판정 이력 집계 쿼리와 인덱스 |
| `monitoring/MonitoringService.java` | 개요, 추이, 상위 차단 키, 빈 구간 채우기, 캐시 |
| `monitoring/OverviewResponse.java`, `RuleSetSummary.java`, `TimeseriesResponse.java`, `RejectedKeyResponse.java` | 응답 |
| `monitoring/KeyTransform.java`, `KeyStatus.java`, `KeyLookupRequest.java`, `KeyRuleSetStatus.java`, `KeyLookupResponse.java`, `KeyLookupService.java` | 키 조회 |
| `audit/AuditAction.java`, `AuditActor.java`, `AuditEntry.java`, `AuditQuery.java`, `AuditProperties.java` | 감사 기록 모델 |
| `audit/MongoAuditStore.java` | 감사 기록 저장, 검색, TTL 인덱스 |
| `audit/AuditService.java` | 기록 정책, 마스킹, 응답 헤더 |
| `audit/RuleDiff.java` | 규칙 스냅샷과 바뀐 필드 |
| `config/MonitoringConfig.java` | 저장소 빈, 시계, 기동 시 인덱스 |
| `controller/Roles.java` | 역할 표현식과 ADMIN 판별 |
| `controller/MeController.java`, `MeResponse.java` | 현재 사용자 |
| `controller/MonitoringController.java`, `KeyLookupController.java`, `AuditController.java` | 새 API |
| 수정: `controller/RuleController.java`, `controller/PolicyController.java`, `config/SecurityConfig.java`, `resources/application.yml` | 감사 기록 연결, 권한, 설정 |

UI, `fluxgate-studio-ui-nextjs/src`

| 파일 | 책임 |
|---|---|
| `lib/i18n.ts` | 사전, 번역 함수 |
| `lib/ruleMeaning.ts` | 한도의 실제 의미 문장, 한도 표기 |
| `lib/format.ts` | 시각, 경과 시간, 비율 표기 |
| `lib/ruleDiff.ts` | 저장 전 바뀐 값 비교 |
| 수정: `lib/api.ts` | 새 API 호출, 감사 실패 알림 |
| 수정: `app/api/proxy/[...path]/route.ts` | 허용 경로, 응답 헤더 |
| 수정: `app/globals.css` | 색 변수, 라이트와 다크 |
| 수정: `modules/admin/data/themes.ts`, `modules/admin/contexts/ThemeContext.tsx` | 테마 1종과 색 모드 |
| `modules/console/I18nProvider.tsx`, `MeProvider.tsx`, `useLive.ts`, `Shell.tsx`, `ui.tsx`, `charts.tsx`, `ConfirmChangeDialog.tsx` | 콘솔 공통 |
| `modules/console/screens/OverviewScreen.tsx`, `RulesScreen.tsx`, `KeysScreen.tsx`, `AuditScreen.tsx` | 네 화면 |
| `app/(console)/layout.tsx`, `app/(console)/overview/page.tsx` 외 3개 | 경로 |
| 삭제: `modules/admin/AdminDashboard.tsx`, `components/RuleCard.tsx`, `components/StatCard.tsx`, `components/ThemeSwitcher.tsx` | 옛 화면 |

---

### Task 1: 기간, 마스킹, 캐시, 설정

**Files:**
- Create: `fluxgate-studio-admin-api/src/main/java/org/fluxgate/studio/admin/monitoring/MonitoringWindow.java`
- Create: `.../monitoring/KeyMasker.java`, `.../monitoring/TtlCache.java`, `.../monitoring/MonitoringProperties.java`, `.../audit/AuditProperties.java`
- Test: `fluxgate-studio-admin-api/src/test/java/org/fluxgate/studio/admin/monitoring/MonitoringWindowTest.java`, `KeyMaskerTest.java`, `TtlCacheTest.java`, `MutableClock.java`

**Interfaces:**
- Produces: `MonitoringWindow.parse(String, Set<MonitoringWindow>)`, `code()`, `lengthMillis()`, `bucketMillis()`, 상수 `MONITORING`, `KEY_LOOKUP`. `KeyMasker.mask(String)`. `TtlCache(Duration, Clock)`, `<T> T get(String, Supplier<T>)`. `MonitoringProperties(String eventDatabase, String eventCollection, boolean createIndexes, Duration cacheTtl, Duration queryTimeout, List<String> keyTransforms)`. `AuditProperties(String collection, Duration retention)`.

- [ ] **Step 1: 실패하는 테스트 작성**

```java
// MonitoringWindowTest.java
package org.fluxgate.studio.admin.monitoring;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.fluxgate.studio.admin.exception.InvalidRuleException;
import org.junit.jupiter.api.Test;

class MonitoringWindowTest {

  @Test
  void parsesCodesInTheAllowedSet() {
    assertThat(MonitoringWindow.parse("5m", MonitoringWindow.MONITORING))
        .isEqualTo(MonitoringWindow.FIVE_MINUTES);
    assertThat(MonitoringWindow.parse("7d", MonitoringWindow.KEY_LOOKUP))
        .isEqualTo(MonitoringWindow.SEVEN_DAYS);
  }

  @Test
  void rejectsCodesOutsideTheAllowedSet() {
    assertThatThrownBy(() -> MonitoringWindow.parse("7d", MonitoringWindow.MONITORING))
        .isInstanceOf(InvalidRuleException.class)
        .hasMessageContaining("must be one of: 5m, 1h, 24h");
    assertThatThrownBy(() -> MonitoringWindow.parse(null, MonitoringWindow.MONITORING))
        .isInstanceOf(InvalidRuleException.class);
  }

  @Test
  void exposesLengthsAndBuckets() {
    assertThat(MonitoringWindow.ONE_HOUR.lengthMillis()).isEqualTo(3_600_000L);
    assertThat(MonitoringWindow.ONE_HOUR.bucketMillis()).isEqualTo(60_000L);
    assertThat(MonitoringWindow.FIVE_MINUTES.bucketMillis()).isEqualTo(10_000L);
    assertThat(MonitoringWindow.ONE_DAY.bucketMillis()).isEqualTo(900_000L);
  }
}
```

```java
// KeyMaskerTest.java
package org.fluxgate.studio.admin.monitoring;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class KeyMaskerTest {

  @Test
  void keepsTwoCharactersOnEachSide() {
    assertThat(KeyMasker.mask("123456789")).isEqualTo("12****89");
    assertThat(KeyMasker.mask("abcde")).isEqualTo("ab****de");
  }

  @Test
  void hidesShortKeysCompletely() {
    assertThat(KeyMasker.mask("abcd")).isEqualTo("****");
    assertThat(KeyMasker.mask("")).isEqualTo("****");
    assertThat(KeyMasker.mask(null)).isNull();
  }
}
```

```java
// MutableClock.java
package org.fluxgate.studio.admin.monitoring;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

final class MutableClock extends Clock {
  private Instant now;

  MutableClock(Instant now) {
    this.now = now;
  }

  void advance(Duration duration) {
    now = now.plus(duration);
  }

  @Override
  public ZoneId getZone() {
    return ZoneOffset.UTC;
  }

  @Override
  public Clock withZone(ZoneId zone) {
    return this;
  }

  @Override
  public Instant instant() {
    return now;
  }
}
```

```java
// TtlCacheTest.java
package org.fluxgate.studio.admin.monitoring;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class TtlCacheTest {
  private final MutableClock clock = new MutableClock(Instant.parse("2026-11-14T00:00:00Z"));

  @Test
  void reusesTheValueUntilTheTtlPasses() {
    TtlCache cache = new TtlCache(Duration.ofSeconds(10), clock);
    AtomicInteger loads = new AtomicInteger();

    assertThat(cache.get("k", loads::incrementAndGet)).isEqualTo(1);
    clock.advance(Duration.ofSeconds(9));
    assertThat(cache.get("k", loads::incrementAndGet)).isEqualTo(1);
    clock.advance(Duration.ofSeconds(1));
    assertThat(cache.get("k", loads::incrementAndGet)).isEqualTo(2);
  }

  @Test
  void keepsKeysApart() {
    TtlCache cache = new TtlCache(Duration.ofSeconds(10), clock);
    assertThat(cache.get("a", () -> "A")).isEqualTo("A");
    assertThat(cache.get("b", () -> "B")).isEqualTo("B");
  }

  @Test
  void zeroTtlDisablesCaching() {
    TtlCache cache = new TtlCache(Duration.ZERO, clock);
    AtomicInteger loads = new AtomicInteger();
    cache.get("k", loads::incrementAndGet);
    cache.get("k", loads::incrementAndGet);
    assertThat(loads).hasValue(2);
  }

  @Test
  void dropsExpiredEntriesWhenItGrows() {
    TtlCache cache = new TtlCache(Duration.ofSeconds(10), clock);
    for (int i = 0; i < TtlCache.MAX_ENTRIES; i++) {
      cache.get("k" + i, () -> "v");
    }
    clock.advance(Duration.ofSeconds(11));
    cache.get("fresh", () -> "v");
    assertThat(cache.size()).isEqualTo(1);
  }
}
```

- [ ] **Step 2: 실패 확인**

Run: `./mvnw -B -ntp $M2 test -Dtest='MonitoringWindowTest,KeyMaskerTest,TtlCacheTest'`
Expected: 컴파일 실패, `MonitoringWindow` 등 심볼 없음

- [ ] **Step 3: 구현**

```java
// MonitoringWindow.java
package org.fluxgate.studio.admin.monitoring;

import java.time.Duration;
import java.util.EnumSet;
import java.util.Set;
import java.util.stream.Collectors;
import org.fluxgate.studio.admin.exception.InvalidRuleException;

/** Query windows the console offers. Fixed windows bound every aggregation the console runs. */
public enum MonitoringWindow {
  FIVE_MINUTES("5m", Duration.ofMinutes(5), Duration.ofSeconds(10)),
  ONE_HOUR("1h", Duration.ofHours(1), Duration.ofMinutes(1)),
  ONE_DAY("24h", Duration.ofHours(24), Duration.ofMinutes(15)),
  SEVEN_DAYS("7d", Duration.ofDays(7), Duration.ofHours(6));

  public static final Set<MonitoringWindow> MONITORING =
      EnumSet.of(FIVE_MINUTES, ONE_HOUR, ONE_DAY);
  public static final Set<MonitoringWindow> KEY_LOOKUP =
      EnumSet.of(ONE_HOUR, ONE_DAY, SEVEN_DAYS);

  private final String code;
  private final Duration length;
  private final Duration bucket;

  MonitoringWindow(String code, Duration length, Duration bucket) {
    this.code = code;
    this.length = length;
    this.bucket = bucket;
  }

  public String code() {
    return code;
  }

  public long lengthMillis() {
    return length.toMillis();
  }

  public long bucketMillis() {
    return bucket.toMillis();
  }

  public static MonitoringWindow parse(String value, Set<MonitoringWindow> allowed) {
    for (MonitoringWindow window : allowed) {
      if (window.code.equals(value)) {
        return window;
      }
    }
    throw new InvalidRuleException(
        "window",
        "must be one of: "
            + allowed.stream().map(MonitoringWindow::code).collect(Collectors.joining(", ")));
  }
}
```

```java
// KeyMasker.java
package org.fluxgate.studio.admin.monitoring;

/** Hides the middle of a rate limit key for readers who must not see member identifiers. */
public final class KeyMasker {
  private static final String MASK = "****";

  private KeyMasker() {}

  public static String mask(String key) {
    if (key == null) {
      return null;
    }
    if (key.length() <= 4) {
      return MASK;
    }
    return key.substring(0, 2) + MASK + key.substring(key.length() - 2);
  }
}
```

```java
// TtlCache.java
package org.fluxgate.studio.admin.monitoring;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;

/** Small time based cache so that many open consoles cost the database one query per period. */
public final class TtlCache {
  static final int MAX_ENTRIES = 256;

  private record Entry(Object value, Instant expiresAt) {}

  private final Map<String, Entry> entries = new ConcurrentHashMap<>();
  private final Duration ttl;
  private final Clock clock;

  public TtlCache(Duration ttl, Clock clock) {
    this.ttl = ttl;
    this.clock = clock;
  }

  @SuppressWarnings("unchecked")
  public <T> T get(String key, Supplier<T> loader) {
    if (ttl.isZero() || ttl.isNegative()) {
      return loader.get();
    }
    Instant now = clock.instant();
    Entry cached = entries.get(key);
    if (cached != null && now.isBefore(cached.expiresAt())) {
      return (T) cached.value();
    }
    T value = loader.get();
    if (entries.size() >= MAX_ENTRIES) {
      entries.values().removeIf(entry -> !now.isBefore(entry.expiresAt()));
    }
    entries.put(key, new Entry(value, now.plus(ttl)));
    return value;
  }

  int size() {
    return entries.size();
  }
}
```

```java
// MonitoringProperties.java
package org.fluxgate.studio.admin.monitoring;

import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties(prefix = "fluxgate.studio.monitoring")
public record MonitoringProperties(
    @DefaultValue("") String eventDatabase,
    @DefaultValue("rate_limit_events") String eventCollection,
    @DefaultValue("true") boolean createIndexes,
    @DefaultValue("10s") Duration cacheTtl,
    @DefaultValue("5s") Duration queryTimeout,
    @DefaultValue({"none", "sha256"}) List<String> keyTransforms) {}
```

```java
// audit/AuditProperties.java
package org.fluxgate.studio.admin.audit;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties(prefix = "fluxgate.studio.audit")
public record AuditProperties(
    @DefaultValue("studio_audit_log") String collection,
    @DefaultValue("730d") Duration retention) {}
```

- [ ] **Step 4: 통과 확인**

Run: `./mvnw -B -ntp $M2 spotless:apply && ./mvnw -B -ntp $M2 test -Dtest='MonitoringWindowTest,KeyMaskerTest,TtlCacheTest'`
Expected: Tests run: 9, Failures: 0

- [ ] **Step 5: Commit**

```bash
git add fluxgate-studio-admin-api/src
git commit -m "feat(api): add monitoring windows, key masking and result cache"
```

---

### Task 2: 판정 이력 저장소와 기동 시 인덱스

**Files:**
- Create: `.../monitoring/Bucket.java`, `RuleSetActivity.java`, `RejectedKey.java`, `KeyDecision.java`, `MongoEventStore.java`
- Create: `.../config/MonitoringConfig.java`
- Modify: `fluxgate-studio-admin-api/src/main/resources/application.yml`
- Test: `.../monitoring/MongoEventStoreTest.java`, `.../config/MonitoringConfigTest.java`

**Interfaces:**
- Consumes: `MonitoringProperties`, `AuditProperties` (Task 1)
- Produces:
  - `record Bucket(long start, long allowed, long rejected)`
  - `record RuleSetActivity(String ruleSetId, long total, long rejected, long lastDecisionAt)`
  - `record RejectedKey(String ruleSetId, String key, long rejected, long lastRejectedAt)`
  - `record KeyDecision(long timestamp, String ruleSetId, String ruleId, String endpoint, String method, boolean allowed, long remainingTokens, long retryAfterMs)`
  - `MongoEventStore(MongoCollection<Document> nullable, Duration queryTimeout)`: `ensureIndexes()`, `List<RuleSetActivity> activityByRuleSet(long from, long to, String key)`, `List<Bucket> buckets(long from, long to, long bucketMillis, String ruleSetId, String key)`, `Map<String, List<Bucket>> bucketsByRuleSet(long from, long to, long bucketMillis)`, `List<RejectedKey> topRejected(long from, long to, String ruleSetId, int limit)`, `List<KeyDecision> recentDecisions(String key, long from, long to, int limit)`, `Map<String, KeyDecision> lastDecisionByRuleSet(String key, long from, long to)`
  - 빈: `Clock studioClock`, `MongoEventStore`, `ApplicationRunner monitoringIndexes`

- [ ] **Step 1: 실패하는 테스트 작성**

```java
// MongoEventStoreTest.java
package org.fluxgate.studio.admin.monitoring;

import static java.util.stream.Collectors.toMap;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.tuple;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.mongodb.MongoException;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import com.mongodb.client.MongoCollection;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Map;
import java.util.function.Function;
import org.bson.Document;
import org.fluxgate.studio.admin.exception.StorageConnectionException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.MongoDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers
class MongoEventStoreTest {
  @Container static final MongoDBContainer MONGO = new MongoDBContainer("mongo:7.0");

  /** Minute aligned start of every scenario. */
  private static final long T0 = 1_794_600_000_000L;

  private MongoClient client;
  private MongoCollection<Document> events;
  private MongoEventStore store;

  @BeforeEach
  void setUp() {
    client = MongoClients.create(MONGO.getReplicaSetUrl());
    events = client.getDatabase("studio_events").getCollection("rate_limit_events");
    events.drop();
    store = new MongoEventStore(events, Duration.ofSeconds(5));
  }

  @AfterEach
  void close() {
    client.close();
  }

  private void decision(long at, String ruleSetId, String key, boolean allowed) {
    Document doc =
        new Document("timestamp", at)
            .append("ruleSetId", ruleSetId)
            .append("ruleId", ruleSetId + "-rule")
            .append("allowed", allowed)
            .append("remainingTokens", allowed ? 3L : 0L)
            .append("retryAfterMs", allowed ? 0L : 2_000L)
            .append("endpoint", "/api/items")
            .append("method", "POST");
    if (key != null) {
      doc.append("userId", key);
    }
    events.insertOne(doc);
  }

  @Test
  void summarisesActivityPerRuleSetInsideTheWindow() {
    decision(T0 + 1_000, "a", "u1", true);
    decision(T0 + 2_000, "a", "u1", false);
    decision(T0 + 3_000, "b", "u2", true);
    decision(T0 - 1, "a", "u1", false);
    decision(T0 + 60_000, "a", "u1", false);

    Map<String, RuleSetActivity> byId =
        store.activityByRuleSet(T0, T0 + 60_000, null).stream()
            .collect(toMap(RuleSetActivity::ruleSetId, Function.identity()));

    assertThat(byId).containsOnlyKeys("a", "b");
    assertThat(byId.get("a")).isEqualTo(new RuleSetActivity("a", 2, 1, T0 + 2_000));
    assertThat(byId.get("b")).isEqualTo(new RuleSetActivity("b", 1, 0, T0 + 3_000));
  }

  @Test
  void narrowsActivityToOneKey() {
    decision(T0 + 1_000, "a", "u1", false);
    decision(T0 + 2_000, "a", "u2", true);

    assertThat(store.activityByRuleSet(T0, T0 + 60_000, "u1"))
        .containsExactly(new RuleSetActivity("a", 1, 1, T0 + 1_000));
  }

  @Test
  void groupsDecisionsIntoAlignedBuckets() {
    decision(T0 + 5_000, "a", "u1", true);
    decision(T0 + 65_000, "a", "u1", false);
    decision(T0 + 66_000, "b", "u1", false);

    assertThat(store.buckets(T0, T0 + 120_000, 60_000, null, null))
        .containsExactly(new Bucket(T0, 1, 0), new Bucket(T0 + 60_000, 0, 2));
    assertThat(store.buckets(T0, T0 + 120_000, 60_000, "a", null))
        .containsExactly(new Bucket(T0, 1, 0), new Bucket(T0 + 60_000, 0, 1));
    assertThat(store.buckets(T0, T0 + 120_000, 60_000, null, "u1")).hasSize(2);

    Map<String, java.util.List<Bucket>> perRuleSet =
        store.bucketsByRuleSet(T0, T0 + 120_000, 60_000);
    assertThat(perRuleSet).containsOnlyKeys("a", "b");
    assertThat(perRuleSet.get("a"))
        .containsExactly(new Bucket(T0, 1, 0), new Bucket(T0 + 60_000, 0, 1));
  }

  @Test
  void ranksRejectedKeysAndSkipsDecisionsWithoutKey() {
    decision(T0 + 1_000, "a", "u1", false);
    decision(T0 + 2_000, "a", "u1", false);
    decision(T0 + 3_000, "a", "u1", false);
    decision(T0 + 4_000, "a", "u2", false);
    decision(T0 + 5_000, "a", "u3", true);
    decision(T0 + 6_000, "a", null, false);

    assertThat(store.topRejected(T0, T0 + 60_000, null, 10))
        .extracting(RejectedKey::key, RejectedKey::rejected, RejectedKey::lastRejectedAt)
        .containsExactly(tuple("u1", 3L, T0 + 3_000), tuple("u2", 1L, T0 + 4_000));
    assertThat(store.topRejected(T0, T0 + 60_000, null, 1)).hasSize(1);
    assertThat(store.topRejected(T0, T0 + 60_000, "b", 10)).isEmpty();
  }

  @Test
  void returnsRecentAndLastDecisionsForOneKey() {
    decision(T0 + 1_000, "a", "u1", true);
    decision(T0 + 2_000, "a", "u1", false);
    decision(T0 + 3_000, "b", "u1", true);
    decision(T0 + 4_000, "a", "u2", false);

    assertThat(store.recentDecisions("u1", T0, T0 + 60_000, 2))
        .extracting(KeyDecision::timestamp)
        .containsExactly(T0 + 3_000, T0 + 2_000);

    Map<String, KeyDecision> last = store.lastDecisionByRuleSet("u1", T0, T0 + 60_000);
    assertThat(last).containsOnlyKeys("a", "b");
    assertThat(last.get("a"))
        .isEqualTo(
            new KeyDecision(T0 + 2_000, "a", "a-rule", "/api/items", "POST", false, 0, 2_000));
    assertThat(last.get("b").allowed()).isTrue();
  }

  @Test
  void createsTheQueryIndexes() {
    decision(T0, "a", "u1", true);
    store.ensureIndexes();

    assertThat(events.listIndexes().map(index -> index.getString("name")).into(new ArrayList<>()))
        .contains("timestamp_1", "ruleSetId_1_timestamp_1", "userId_1_timestamp_-1");
  }

  @Test
  void reportsAMissingCollectionAsUnavailable() {
    MongoEventStore disabled = new MongoEventStore(null, Duration.ofSeconds(1));
    assertThatThrownBy(() -> disabled.buckets(0, 1, 1, null, null))
        .isInstanceOf(StorageConnectionException.class);
  }

  @Test
  @SuppressWarnings("unchecked")
  void reportsDriverFailuresAsUnavailable() {
    MongoCollection<Document> broken = mock(MongoCollection.class);
    when(broken.aggregate(anyList())).thenThrow(new MongoException("boom"));
    MongoEventStore failing = new MongoEventStore(broken, Duration.ofSeconds(1));

    assertThatThrownBy(() -> failing.activityByRuleSet(0, 1, null))
        .isInstanceOf(StorageConnectionException.class);
  }
}
```

```java
// config/MonitoringConfigTest.java
package org.fluxgate.studio.admin.config;

import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import java.time.Duration;
import java.util.List;
import org.fluxgate.studio.admin.audit.MongoAuditStore;
import org.fluxgate.studio.admin.monitoring.MongoEventStore;
import org.fluxgate.studio.admin.monitoring.MonitoringProperties;
import org.junit.jupiter.api.Test;
import org.springframework.boot.DefaultApplicationArguments;

class MonitoringConfigTest {
  private final MonitoringConfig config = new MonitoringConfig();

  private static MonitoringProperties properties(boolean createIndexes) {
    return new MonitoringProperties(
        "",
        "rate_limit_events",
        createIndexes,
        Duration.ofSeconds(10),
        Duration.ofSeconds(5),
        List.of("none", "sha256"));
  }

  @Test
  void skipsEventIndexesWhenDisabled() throws Exception {
    MongoEventStore events = mock(MongoEventStore.class);
    MongoAuditStore audit = mock(MongoAuditStore.class);

    config.monitoringIndexes(events, audit, properties(false))
        .run(new DefaultApplicationArguments());

    verify(events, never()).ensureIndexes();
    verify(audit).ensureIndexes();
  }

  @Test
  void keepsStartingWhenIndexCreationFails() throws Exception {
    MongoEventStore events = mock(MongoEventStore.class);
    MongoAuditStore audit = mock(MongoAuditStore.class);
    doThrow(new IllegalStateException("not authorized")).when(events).ensureIndexes();
    doThrow(new IllegalStateException("not authorized")).when(audit).ensureIndexes();

    config.monitoringIndexes(events, audit, properties(true))
        .run(new DefaultApplicationArguments());

    verify(events).ensureIndexes();
    verify(audit).ensureIndexes();
  }
}
```

`MonitoringConfigTest`는 Task 4의 `MongoAuditStore`를 쓰므로, 이 Task에서는 `MongoAuditStore` 자리에 빈 클래스를 먼저 만든다(Task 4에서 채운다).

```java
// audit/MongoAuditStore.java, Task 4에서 교체
package org.fluxgate.studio.admin.audit;

public class MongoAuditStore {
  public void ensureIndexes() {}
}
```

- [ ] **Step 2: 실패 확인**

Run: `./mvnw -B -ntp $M2 test -Dtest='MongoEventStoreTest,MonitoringConfigTest'`
Expected: 컴파일 실패, `MongoEventStore` 없음

- [ ] **Step 3: 구현**

```java
// Bucket.java
package org.fluxgate.studio.admin.monitoring;

public record Bucket(long start, long allowed, long rejected) {}
```

```java
// RuleSetActivity.java
package org.fluxgate.studio.admin.monitoring;

public record RuleSetActivity(String ruleSetId, long total, long rejected, long lastDecisionAt) {}
```

```java
// RejectedKey.java
package org.fluxgate.studio.admin.monitoring;

public record RejectedKey(String ruleSetId, String key, long rejected, long lastRejectedAt) {}
```

```java
// KeyDecision.java
package org.fluxgate.studio.admin.monitoring;

public record KeyDecision(
    long timestamp,
    String ruleSetId,
    String ruleId,
    String endpoint,
    String method,
    boolean allowed,
    long remainingTokens,
    long retryAfterMs) {}
```

```java
// MongoEventStore.java
package org.fluxgate.studio.admin.monitoring;

import com.mongodb.MongoException;
import com.mongodb.client.MongoCollection;
import com.mongodb.client.model.Accumulators;
import com.mongodb.client.model.Aggregates;
import com.mongodb.client.model.Filters;
import com.mongodb.client.model.Indexes;
import com.mongodb.client.model.Sorts;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import org.bson.Document;
import org.bson.conversions.Bson;
import org.fluxgate.studio.admin.exception.StorageConnectionException;

/** Reads the rate limit decisions services record. Studio never writes to this collection. */
public class MongoEventStore {

  private static final String TIMESTAMP = "timestamp";
  private static final String FIELD_TIMESTAMP = "$" + TIMESTAMP;
  private static final Document ALLOWED = countWhen(true);
  private static final Document REJECTED = countWhen(false);

  private final MongoCollection<Document> collection;
  private final long maxTimeMillis;

  public MongoEventStore(MongoCollection<Document> collection, Duration queryTimeout) {
    this.collection = collection;
    this.maxTimeMillis = queryTimeout.toMillis();
  }

  public void ensureIndexes() {
    MongoCollection<Document> events = events();
    events.createIndex(Indexes.ascending(TIMESTAMP));
    events.createIndex(
        Indexes.compoundIndex(Indexes.ascending("ruleSetId"), Indexes.ascending(TIMESTAMP)));
    events.createIndex(
        Indexes.compoundIndex(Indexes.ascending("userId"), Indexes.descending(TIMESTAMP)));
  }

  public List<RuleSetActivity> activityByRuleSet(long from, long to, String key) {
    List<RuleSetActivity> result = new ArrayList<>();
    for (Document doc :
        aggregate(
            List.of(
                Aggregates.match(range(from, to, null, key)),
                Aggregates.group(
                    "$ruleSetId",
                    Accumulators.sum("total", 1),
                    Accumulators.sum("rejected", REJECTED),
                    Accumulators.max("lastAt", FIELD_TIMESTAMP))))) {
      result.add(
          new RuleSetActivity(
              doc.getString("_id"),
              number(doc, "total"),
              number(doc, "rejected"),
              number(doc, "lastAt")));
    }
    return result;
  }

  public List<Bucket> buckets(
      long from, long to, long bucketMillis, String ruleSetId, String key) {
    List<Bucket> result = new ArrayList<>();
    for (Document doc :
        aggregate(
            List.of(
                Aggregates.match(range(from, to, ruleSetId, key)),
                Aggregates.group(
                    bucketStart(bucketMillis),
                    Accumulators.sum("allowed", ALLOWED),
                    Accumulators.sum("rejected", REJECTED)),
                Aggregates.sort(Sorts.ascending("_id"))))) {
      result.add(new Bucket(number(doc, "_id"), number(doc, "allowed"), number(doc, "rejected")));
    }
    return result;
  }

  public Map<String, List<Bucket>> bucketsByRuleSet(long from, long to, long bucketMillis) {
    Map<String, List<Bucket>> result = new LinkedHashMap<>();
    for (Document doc :
        aggregate(
            List.of(
                Aggregates.match(
                    Filters.and(range(from, to, null, null), Filters.ne("ruleSetId", null))),
                Aggregates.group(
                    new Document("ruleSetId", "$ruleSetId")
                        .append("start", bucketStart(bucketMillis)),
                    Accumulators.sum("allowed", ALLOWED),
                    Accumulators.sum("rejected", REJECTED)),
                Aggregates.sort(Sorts.ascending("_id.start"))))) {
      Document id = doc.get("_id", Document.class);
      result
          .computeIfAbsent(id.getString("ruleSetId"), ignored -> new ArrayList<>())
          .add(new Bucket(number(id, "start"), number(doc, "allowed"), number(doc, "rejected")));
    }
    return result;
  }

  public List<RejectedKey> topRejected(long from, long to, String ruleSetId, int limit) {
    List<RejectedKey> result = new ArrayList<>();
    for (Document doc :
        aggregate(
            List.of(
                Aggregates.match(
                    Filters.and(
                        range(from, to, ruleSetId, null),
                        Filters.eq("allowed", false),
                        Filters.nin("userId", null, ""))),
                Aggregates.group(
                    new Document("ruleSetId", "$ruleSetId").append("key", "$userId"),
                    Accumulators.sum("rejected", 1),
                    Accumulators.max("lastAt", FIELD_TIMESTAMP)),
                Aggregates.sort(
                    Sorts.orderBy(Sorts.descending("rejected"), Sorts.descending("lastAt"))),
                Aggregates.limit(limit)))) {
      Document id = doc.get("_id", Document.class);
      result.add(
          new RejectedKey(
              id.getString("ruleSetId"),
              id.getString("key"),
              number(doc, "rejected"),
              number(doc, "lastAt")));
    }
    return result;
  }

  public List<KeyDecision> recentDecisions(String key, long from, long to, int limit) {
    try {
      List<KeyDecision> result = new ArrayList<>();
      for (Document doc :
          events()
              .find(range(from, to, null, key))
              .sort(Sorts.descending(TIMESTAMP))
              .limit(limit)
              .maxTime(maxTimeMillis, TimeUnit.MILLISECONDS)) {
        result.add(decision(doc));
      }
      return result;
    } catch (MongoException e) {
      throw unavailable(e);
    }
  }

  public Map<String, KeyDecision> lastDecisionByRuleSet(String key, long from, long to) {
    Map<String, KeyDecision> result = new LinkedHashMap<>();
    for (Document doc :
        aggregate(
            List.of(
                Aggregates.match(range(from, to, null, key)),
                Aggregates.sort(Sorts.descending(TIMESTAMP)),
                Aggregates.group("$ruleSetId", Accumulators.first("last", "$$ROOT"))))) {
      result.put(doc.getString("_id"), decision(doc.get("last", Document.class)));
    }
    return result;
  }

  private static Bson range(long from, long to, String ruleSetId, String key) {
    List<Bson> filters = new ArrayList<>();
    filters.add(Filters.gte(TIMESTAMP, from));
    filters.add(Filters.lt(TIMESTAMP, to));
    if (ruleSetId != null) {
      filters.add(Filters.eq("ruleSetId", ruleSetId));
    }
    if (key != null) {
      filters.add(Filters.eq("userId", key));
    }
    return Filters.and(filters);
  }

  private static Document bucketStart(long bucketMillis) {
    return new Document(
        "$subtract",
        List.of(FIELD_TIMESTAMP, new Document("$mod", List.of(FIELD_TIMESTAMP, bucketMillis))));
  }

  private static Document countWhen(boolean allowed) {
    return new Document(
        "$cond", List.of(new Document("$eq", List.of("$allowed", allowed)), 1, 0));
  }

  private List<Document> aggregate(List<Bson> pipeline) {
    try {
      return events()
          .aggregate(pipeline)
          .maxTime(maxTimeMillis, TimeUnit.MILLISECONDS)
          .into(new ArrayList<>());
    } catch (MongoException e) {
      throw unavailable(e);
    }
  }

  private MongoCollection<Document> events() {
    if (collection == null) {
      throw new StorageConnectionException(
          "MongoDB", "event history needs the FluxGate Mongo connection");
    }
    return collection;
  }

  private static StorageConnectionException unavailable(MongoException e) {
    return new StorageConnectionException("MongoDB", "event query failed", e);
  }

  private static KeyDecision decision(Document doc) {
    return new KeyDecision(
        number(doc, TIMESTAMP),
        doc.getString("ruleSetId"),
        doc.getString("ruleId"),
        doc.getString("endpoint"),
        doc.getString("method"),
        Boolean.TRUE.equals(doc.getBoolean("allowed")),
        number(doc, "remainingTokens"),
        number(doc, "retryAfterMs"));
  }

  private static long number(Document doc, String field) {
    return doc.get(field) instanceof Number value ? value.longValue() : 0L;
  }
}
```

```java
// config/MonitoringConfig.java
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
```

`application.yml`의 `fluxgate.studio` 아래, `security` 블록 다음에 추가한다.

```yaml
    monitoring:
      event-database: ${FLUXGATE_EVENT_DB:}
      event-collection: ${FLUXGATE_EVENT_COLLECTION:rate_limit_events}
      create-indexes: ${FLUXGATE_EVENT_CREATE_INDEXES:true}
      cache-ttl: 10s
      query-timeout: 5s
      key-transforms: none,sha256
    audit:
      collection: ${STUDIO_AUDIT_COLLECTION:studio_audit_log}
      retention: ${STUDIO_AUDIT_RETENTION:730d}
```

- [ ] **Step 4: 통과 확인**

Run: `./mvnw -B -ntp $M2 spotless:apply && ./mvnw -B -ntp $M2 test -Dtest='MongoEventStoreTest,MonitoringConfigTest'`
Expected: Tests run: 10, Failures: 0

- [ ] **Step 5: Commit**

```bash
git add fluxgate-studio-admin-api/src
git commit -m "feat(api): read decision history from the event collection"
```

---

### Task 3: 모니터링 API, 현재 사용자 API, 권한

**Files:**
- Create: `.../monitoring/MonitoringService.java`, `OverviewResponse.java`, `RuleSetSummary.java`, `TimeseriesResponse.java`, `RejectedKeyResponse.java`
- Create: `.../audit/AuditActor.java`
- Create: `.../controller/Roles.java`, `MeController.java`, `MeResponse.java`, `MonitoringController.java`
- Modify: `.../config/SecurityConfig.java`
- Test: `.../monitoring/MonitoringServiceTest.java`, `.../controller/MonitoringControllerSecurityTest.java`

**Interfaces:**
- Consumes: `MongoEventStore`, `MonitoringProperties`, `TtlCache`, `KeyMasker`, `MonitoringWindow` (Task 1, 2), `RuleService.getAllRules()`
- Produces:
  - `MonitoringService(MongoEventStore, RuleService, MonitoringProperties, Clock)`: `OverviewResponse overview(MonitoringWindow)`, `TimeseriesResponse timeseries(MonitoringWindow, String ruleSetId)`, `List<RejectedKeyResponse> topRejected(MonitoringWindow, String ruleSetId, int limit, boolean revealKeys)`, `public static List<Bucket> fill(List<Bucket>, long from, long to, long bucketMillis)`
  - `record OverviewResponse(String window, long from, long to, long total, long rejected, double rejectRate, List<RuleSetSummary> ruleSets)`
  - `record RuleSetSummary(String ruleSetId, long total, long rejected, double rejectRate, Long lastDecisionAt, List<Long> trend)`
  - `record TimeseriesResponse(String window, long from, long to, long bucketMillis, List<Bucket> buckets)`
  - `record RejectedKeyResponse(String ruleSetId, String key, boolean masked, long rejected, long lastRejectedAt)`
  - `record AuditActor(String subject, String username, String name)`, `static AuditActor from(Authentication)`
  - `Roles.READER`, `Roles.WRITER`, `Roles.isAdmin(Authentication)`
  - `record MeResponse(String username, String name, List<String> roles, boolean canWrite)`

- [ ] **Step 1: 실패하는 테스트 작성**

```java
// MonitoringServiceTest.java
package org.fluxgate.studio.admin.monitoring;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
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

  private static RuleResponse rule(String ruleSetId) {
    return new RuleResponse(
        ruleSetId + "-rule", "n", true, "PER_USER", "userId", "REJECT_REQUEST", List.of(),
        ruleSetId, List.of(), Map.of(), 1L);
  }

  @Test
  void overviewTotalsEveryDecisionAndListsRegisteredRuleSetsWithoutTraffic() {
    when(store.activityByRuleSet(NOW - HOUR, NOW, null))
        .thenReturn(
            List.of(new RuleSetActivity("a", 10, 2, NOW - 5), new RuleSetActivity(null, 5, 1, NOW)));
    when(store.activityByRuleSet(NOW - DAY, NOW, null))
        .thenReturn(List.of(new RuleSetActivity("a", 30, 3, NOW - 5)));
    when(ruleService.getAllRules()).thenReturn(List.of(rule("c")));

    OverviewResponse overview = service.overview(MonitoringWindow.ONE_HOUR);

    assertThat(overview.total()).isEqualTo(15);
    assertThat(overview.rejected()).isEqualTo(3);
    assertThat(overview.rejectRate()).isEqualTo(0.2);
    assertThat(overview.ruleSets()).extracting(RuleSetSummary::ruleSetId).containsExactly("a", "c");
    RuleSetSummary idle = overview.ruleSets().get(1);
    assertThat(idle.total()).isZero();
    assertThat(idle.rejectRate()).isZero();
    assertThat(idle.lastDecisionAt()).isNull();
    assertThat(idle.trend()).hasSize(MonitoringService.TREND_POINTS).containsOnly(0L);
    assertThat(overview.ruleSets().get(0).lastDecisionAt()).isEqualTo(NOW - 5);
  }

  @Test
  void overviewShowsLastDecisionFromTheLast24HoursEvenWithoutCurrentTraffic() {
    when(store.activityByRuleSet(NOW - 300_000, NOW, null)).thenReturn(List.of());
    when(store.activityByRuleSet(NOW - DAY, NOW, null))
        .thenReturn(List.of(new RuleSetActivity("b", 4, 0, NOW - HOUR)));

    OverviewResponse overview = service.overview(MonitoringWindow.FIVE_MINUTES);

    assertThat(overview.ruleSets()).singleElement().satisfies(summary -> {
      assertThat(summary.ruleSetId()).isEqualTo("b");
      assertThat(summary.total()).isZero();
      assertThat(summary.lastDecisionAt()).isEqualTo(NOW - HOUR);
    });
  }

  @Test
  void overviewTrendCarriesRejectedCountsPerBucket() {
    long bucket = HOUR / MonitoringService.TREND_POINTS;
    when(store.activityByRuleSet(anyLong(), anyLong(), isNull()))
        .thenReturn(List.of(new RuleSetActivity("a", 3, 2, NOW - 1)));
    when(store.bucketsByRuleSet(NOW - HOUR, NOW, bucket))
        .thenReturn(Map.of("a", List.of(new Bucket(NOW - bucket, 1, 2))));

    List<Long> trend = service.overview(MonitoringWindow.ONE_HOUR).ruleSets().get(0).trend();

    assertThat(trend).hasSize(MonitoringService.TREND_POINTS);
    assertThat(trend.get(trend.size() - 1)).isEqualTo(2L);
  }

  @Test
  void overviewIsCachedForTheConfiguredTtl() {
    when(store.activityByRuleSet(anyLong(), anyLong(), isNull())).thenReturn(List.of());

    service.overview(MonitoringWindow.ONE_HOUR);
    service.overview(MonitoringWindow.ONE_HOUR);

    verify(store, times(2)).activityByRuleSet(anyLong(), anyLong(), isNull());
  }

  @Test
  void timeseriesFillsEmptyBuckets() {
    when(store.buckets(NOW - HOUR, NOW, 60_000, "a", null))
        .thenReturn(List.of(new Bucket(NOW - 60_000, 4, 1)));

    TimeseriesResponse series = service.timeseries(MonitoringWindow.ONE_HOUR, "a");

    assertThat(series.bucketMillis()).isEqualTo(60_000);
    assertThat(series.buckets()).hasSize(60);
    assertThat(series.buckets().get(0)).isEqualTo(new Bucket(NOW - HOUR, 0, 0));
    assertThat(series.buckets().get(59)).isEqualTo(new Bucket(NOW - 60_000, 4, 1));
  }

  @Test
  void topRejectedMasksKeysUnlessRevealed() {
    when(store.topRejected(NOW - HOUR, NOW, null, 20))
        .thenReturn(List.of(new RejectedKey("a", "123456789", 3, NOW - 10)));

    assertThat(service.topRejected(MonitoringWindow.ONE_HOUR, null, 20, false))
        .containsExactly(new RejectedKeyResponse("a", "12****89", true, 3, NOW - 10));
    assertThat(service.topRejected(MonitoringWindow.ONE_HOUR, null, 20, true))
        .containsExactly(new RejectedKeyResponse("a", "123456789", false, 3, NOW - 10));
    verify(store, times(1)).topRejected(NOW - HOUR, NOW, null, 20);
  }

  @Test
  void topRejectedRejectsLimitsOutsideTheRange() {
    assertThatThrownBy(() -> service.topRejected(MonitoringWindow.ONE_HOUR, null, 0, true))
        .isInstanceOf(InvalidRuleException.class);
    assertThatThrownBy(() -> service.topRejected(MonitoringWindow.ONE_HOUR, null, 101, true))
        .isInstanceOf(InvalidRuleException.class);
  }

  @Test
  void fillAlignsToBucketBoundaries() {
    assertThat(MonitoringService.fill(Collections.emptyList(), 90_000, 200_000, 60_000))
        .extracting(Bucket::start)
        .containsExactly(60_000L, 120_000L, 180_000L);
    verify(store, times(0)).buckets(anyLong(), anyLong(), anyLong(), eq("x"), isNull());
  }
}
```

```java
// controller/MonitoringControllerSecurityTest.java
package org.fluxgate.studio.admin.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import org.fluxgate.studio.admin.config.SecurityConfig;
import org.fluxgate.studio.admin.monitoring.MonitoringService;
import org.fluxgate.studio.admin.monitoring.MonitoringWindow;
import org.fluxgate.studio.admin.monitoring.OverviewResponse;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(controllers = {MonitoringController.class, MeController.class})
@Import(SecurityConfig.class)
@TestPropertySource(
    properties = {
      "spring.security.oauth2.resourceserver.jwt.issuer-uri=http://localhost:18080/realms/fluxgate",
      "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://localhost:18080/realms/fluxgate/protocol/openid-connect/certs",
      "app.security.cors.allowed-origins=http://localhost:3000"
    })
class MonitoringControllerSecurityTest {

  @Autowired private MockMvc mockMvc;
  @MockBean private MonitoringService monitoringService;

  @Test
  void anonymousCallersAreRejected() throws Exception {
    mockMvc.perform(get("/api/monitoring/overview")).andExpect(status().isUnauthorized());
  }

  @Test
  @WithMockUser(roles = "USER")
  void viewersReadTheOverview() throws Exception {
    when(monitoringService.overview(MonitoringWindow.ONE_HOUR))
        .thenReturn(new OverviewResponse("1h", 0, 1, 0, 0, 0, List.of()));

    mockMvc
        .perform(get("/api/monitoring/overview"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.window").value("1h"));
  }

  @Test
  @WithMockUser(roles = "USER")
  void unknownWindowsAreBadRequests() throws Exception {
    mockMvc.perform(get("/api/monitoring/overview?window=7d")).andExpect(status().isBadRequest());
  }

  @Test
  @WithMockUser(roles = "USER")
  void viewersReceiveMaskedKeys() throws Exception {
    mockMvc.perform(get("/api/monitoring/top-rejected")).andExpect(status().isOk());
    verify(monitoringService).topRejected(MonitoringWindow.ONE_HOUR, null, 20, false);
  }

  @Test
  @WithMockUser(roles = "ADMIN")
  void adminsReceiveRawKeys() throws Exception {
    mockMvc
        .perform(get("/api/monitoring/top-rejected?window=24h&ruleSetId=a&limit=5"))
        .andExpect(status().isOk());
    verify(monitoringService).topRejected(MonitoringWindow.ONE_DAY, "a", 5, true);
  }

  @Test
  @WithMockUser(roles = "USER")
  void viewersReadTheTimeseries() throws Exception {
    mockMvc.perform(get("/api/monitoring/timeseries?window=5m")).andExpect(status().isOk());
    verify(monitoringService).timeseries(MonitoringWindow.FIVE_MINUTES, null);
  }

  @Test
  void meDescribesTheSignedInAdmin() throws Exception {
    mockMvc
        .perform(
            get("/api/me")
                .with(
                    jwt()
                        .jwt(token -> token.claim("preferred_username", "alice").claim("name", "Alice"))
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
    verify(monitoringService, org.mockito.Mockito.never()).overview(any());
  }
}
```

- [ ] **Step 2: 실패 확인**

Run: `./mvnw -B -ntp $M2 test -Dtest='MonitoringServiceTest,MonitoringControllerSecurityTest'`
Expected: 컴파일 실패, `MonitoringService` 없음

- [ ] **Step 3: 구현**

```java
// OverviewResponse.java
package org.fluxgate.studio.admin.monitoring;

import java.util.List;

public record OverviewResponse(
    String window,
    long from,
    long to,
    long total,
    long rejected,
    double rejectRate,
    List<RuleSetSummary> ruleSets) {}
```

```java
// RuleSetSummary.java
package org.fluxgate.studio.admin.monitoring;

import java.util.List;

public record RuleSetSummary(
    String ruleSetId,
    long total,
    long rejected,
    double rejectRate,
    Long lastDecisionAt,
    List<Long> trend) {}
```

```java
// TimeseriesResponse.java
package org.fluxgate.studio.admin.monitoring;

import java.util.List;

public record TimeseriesResponse(
    String window, long from, long to, long bucketMillis, List<Bucket> buckets) {}
```

```java
// RejectedKeyResponse.java
package org.fluxgate.studio.admin.monitoring;

public record RejectedKeyResponse(
    String ruleSetId, String key, boolean masked, long rejected, long lastRejectedAt) {}
```

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
  private final Clock clock;
  private final TtlCache cache;

  public MonitoringService(
      MongoEventStore store,
      RuleService ruleService,
      MonitoringProperties properties,
      Clock clock) {
    this.store = store;
    this.ruleService = ruleService;
    this.clock = clock;
    this.cache = new TtlCache(properties.cacheTtl(), clock);
  }

  public OverviewResponse overview(MonitoringWindow window) {
    return cache.get("overview:" + window.code(), () -> computeOverview(window));
  }

  public TimeseriesResponse timeseries(MonitoringWindow window, String ruleSetId) {
    return cache.get(
        "timeseries:" + window.code() + ":" + ruleSetId,
        () -> {
          long to = clock.millis();
          long from = to - window.lengthMillis();
          long bucket = window.bucketMillis();
          return new TimeseriesResponse(
              window.code(),
              from,
              to,
              bucket,
              fill(store.buckets(from, to, bucket, ruleSetId, null), from, to, bucket));
        });
  }

  public List<RejectedKeyResponse> topRejected(
      MonitoringWindow window, String ruleSetId, int limit, boolean revealKeys) {
    if (limit < 1 || limit > MAX_TOP_KEYS) {
      throw new InvalidRuleException("limit", "must be between 1 and " + MAX_TOP_KEYS);
    }
    List<RejectedKey> keys =
        cache.get(
            "top:" + window.code() + ":" + ruleSetId + ":" + limit,
            () -> {
              long to = clock.millis();
              return store.topRejected(to - window.lengthMillis(), to, ruleSetId, limit);
            });
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

  private OverviewResponse computeOverview(MonitoringWindow window) {
    long to = clock.millis();
    long from = to - window.lengthMillis();
    long trendBucket = Math.max(1, window.lengthMillis() / TREND_POINTS);

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
        window.code(), from, to, total, rejected, rate(rejected, total), summaries);
  }
}
```

```java
// audit/AuditActor.java
package org.fluxgate.studio.admin.audit;

import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

/** Who performed an action, taken from the Keycloak access token when there is one. */
public record AuditActor(String subject, String username, String name) {

  public static AuditActor from(Authentication authentication) {
    if (authentication instanceof JwtAuthenticationToken token) {
      Jwt jwt = token.getToken();
      String username = firstNonBlank(jwt.getClaimAsString("preferred_username"), token.getName());
      return new AuditActor(
          jwt.getSubject(), username, firstNonBlank(jwt.getClaimAsString("name"), username));
    }
    String name = authentication == null ? "anonymous" : authentication.getName();
    return new AuditActor(null, name, name);
  }

  private static String firstNonBlank(String value, String fallback) {
    return value == null || value.isBlank() ? fallback : value;
  }
}
```

```java
// controller/Roles.java
package org.fluxgate.studio.admin.controller;

import org.springframework.security.core.Authentication;

final class Roles {
  static final String READER = "hasAnyRole('USER', 'ADMIN')";
  static final String WRITER = "hasRole('ADMIN')";

  private Roles() {}

  static boolean isAdmin(Authentication authentication) {
    return authentication != null
        && authentication.getAuthorities().stream()
            .anyMatch(authority -> "ROLE_ADMIN".equals(authority.getAuthority()));
  }
}
```

```java
// controller/MeResponse.java
package org.fluxgate.studio.admin.controller;

import java.util.List;

public record MeResponse(String username, String name, List<String> roles, boolean canWrite) {}
```

```java
// controller/MeController.java
package org.fluxgate.studio.admin.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.fluxgate.studio.admin.audit.AuditActor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Tag(name = "Session", description = "The signed in operator")
public class MeController {

  @GetMapping("/api/me")
  @PreAuthorize(Roles.READER)
  @Operation(summary = "Current operator", description = "Name and roles of the caller")
  public MeResponse me(Authentication authentication) {
    AuditActor actor = AuditActor.from(authentication);
    List<String> roles =
        authentication.getAuthorities().stream()
            .map(GrantedAuthority::getAuthority)
            .filter(authority -> authority.startsWith("ROLE_"))
            .map(authority -> authority.substring("ROLE_".length()))
            .sorted()
            .toList();
    return new MeResponse(actor.username(), actor.name(), roles, Roles.isAdmin(authentication));
  }
}
```

```java
// controller/MonitoringController.java
package org.fluxgate.studio.admin.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.fluxgate.studio.admin.monitoring.MonitoringService;
import org.fluxgate.studio.admin.monitoring.MonitoringWindow;
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

  public MonitoringController(MonitoringService monitoringService) {
    this.monitoringService = monitoringService;
  }

  @GetMapping("/overview")
  @PreAuthorize(Roles.READER)
  @Operation(summary = "Overview", description = "Totals and per rule set activity")
  public OverviewResponse overview(@RequestParam(defaultValue = "1h") String window) {
    return monitoringService.overview(parse(window));
  }

  @GetMapping("/timeseries")
  @PreAuthorize(Roles.READER)
  @Operation(summary = "Timeseries", description = "Allowed and rejected decisions per bucket")
  public TimeseriesResponse timeseries(
      @RequestParam(defaultValue = "1h") String window,
      @RequestParam(required = false) String ruleSetId) {
    return monitoringService.timeseries(parse(window), blankToNull(ruleSetId));
  }

  @GetMapping("/top-rejected")
  @PreAuthorize(Roles.READER)
  @Operation(summary = "Top rejected keys", description = "Keys are masked for the read only role")
  public List<RejectedKeyResponse> topRejected(
      @RequestParam(defaultValue = "1h") String window,
      @RequestParam(required = false) String ruleSetId,
      @RequestParam(defaultValue = "20") int limit,
      Authentication authentication) {
    return monitoringService.topRejected(
        parse(window), blankToNull(ruleSetId), limit, Roles.isAdmin(authentication));
  }

  private static MonitoringWindow parse(String window) {
    return MonitoringWindow.parse(window, MonitoringWindow.MONITORING);
  }

  private static String blankToNull(String value) {
    return value == null || value.isBlank() ? null : value;
  }
}
```

`SecurityConfig.securityFilterChain`에서 API 문서 규칙 바로 다음에 추가한다.

```java
                    // Key lookup and the audit log expose member identifiers, admin only
                    .requestMatchers("/api/keys/**", "/api/audit/**")
                    .hasRole(ROLE_ADMIN)
```

주석 정책 때문에 위 주석은 `// Key lookup and the audit log expose member identifiers, so they are admin only`처럼 기호 없이 쓴다.

- [ ] **Step 4: 통과 확인**

Run: `./mvnw -B -ntp $M2 spotless:apply && ./mvnw -B -ntp $M2 test -Dtest='MonitoringServiceTest,MonitoringControllerSecurityTest'`
Expected: Tests run: 17, Failures: 0

- [ ] **Step 5: Commit**

```bash
git add fluxgate-studio-admin-api/src
git commit -m "feat(api): add monitoring and current operator endpoints"
```

---

### Task 4: 감사 기록과 규칙, 정책 변경 연결

**Files:**
- Create: `.../audit/AuditAction.java`, `AuditEntry.java`, `AuditQuery.java`, `RuleDiff.java`, `AuditService.java`
- Replace: `.../audit/MongoAuditStore.java` (Task 2의 빈 클래스)
- Modify: `.../config/MonitoringConfig.java` (감사 저장소 빈)
- Modify: `.../controller/RuleController.java`, `.../controller/PolicyController.java`
- Modify tests: `RuleControllerTest`, `RuleControllerSecurityTest`, `ApiDocsSecurityTest`, `OpenApiRuntimeCompatibilityTest`, `PolicyControllerTest`
- Test: `.../audit/MongoAuditStoreTest.java`, `AuditServiceTest.java`, `RuleDiffTest.java`, `.../controller/RuleControllerAuditTest.java`

**Interfaces:**
- Consumes: `AuditActor`, `AuditProperties`, `KeyMasker`, `Clock`
- Produces:
  - `enum AuditAction { RULE_CREATE, RULE_UPDATE, RULE_TOGGLE, RULE_DELETE, RULES_DELETE_ALL, RULES_IMPORT, POLICY_PUBLISH, POLICY_ROLLBACK, KEY_LOOKUP }`
  - `record AuditEntry(String id, Instant at, AuditActor actor, AuditAction action, Map<String,Object> target, Map<String,Object> before, Map<String,Object> after, Map<String,Object> detail)`
  - `record AuditQuery(AuditAction action, String actor, String text, Instant from, Instant to, int page, int size)`
  - `MongoAuditStore(MongoCollection<Document> nullable, Duration retention)`: `ensureIndexes()`, `void insert(AuditEntry)`, `PageResponse<AuditEntry> search(AuditQuery)`, `Optional<AuditEntry> findById(String)`
  - `AuditService(MongoAuditStore, Clock)`: `boolean recordChange(Authentication, AuditAction, Map target, Map before, Map after, Map detail)`, `void recordKeyLookup(Authentication, String value, String transform, String window)`, `PageResponse<AuditEntry> search(AuditQuery)`, `Optional<AuditEntry> find(String id)`, `static <B extends ResponseEntity.HeadersBuilder<B>> B flag(B, boolean audited)`, 상수 `HEADER = "X-Studio-Audit"`
  - `RuleDiff.snapshot(RuleResponse)`, `RuleDiff.target(RuleResponse)`, `RuleDiff.ruleSet(String)`, `RuleDiff.diff(RuleResponse before, RuleResponse after)` 반환 `RuleDiff.Change(Map before, Map after)`

- [ ] **Step 1: 실패하는 테스트 작성**

```java
// audit/RuleDiffTest.java
package org.fluxgate.studio.admin.audit;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import org.fluxgate.studio.admin.dto.response.RateBandResponse;
import org.fluxgate.studio.admin.dto.response.RuleResponse;
import org.junit.jupiter.api.Test;

class RuleDiffTest {

  private static RuleResponse rule(boolean enabled, long capacity) {
    return new RuleResponse(
        "r1", "Rule", enabled, "PER_USER", "userId", "REJECT_REQUEST",
        List.of(new RateBandResponse(60, capacity, null)), "set", List.of("t"), Map.of(), 3L);
  }

  @Test
  void keepsOnlyTheFieldsThatChanged() {
    RuleDiff.Change change = RuleDiff.diff(rule(true, 30), rule(false, 20));

    assertThat(change.before()).containsOnlyKeys("enabled", "bands");
    assertThat(change.before().get("enabled")).isEqualTo(true);
    assertThat(change.after().get("enabled")).isEqualTo(false);
    assertThat(change.after().get("bands"))
        .isEqualTo(List.of(Map.of("windowSeconds", 60L, "capacity", 20L)));
  }

  @Test
  void treatsAMissingRuleAsEmpty() {
    RuleDiff.Change change = RuleDiff.diff(null, rule(true, 30));

    assertThat(change.after()).containsKeys("name", "bands", "ruleSetId");
    assertThat(change.before()).containsEntry("name", null);
  }

  @Test
  void describesTheTarget() {
    assertThat(RuleDiff.target(rule(true, 1)))
        .containsEntry("ruleSetId", "set")
        .containsEntry("ruleId", "r1");
    assertThat(RuleDiff.ruleSet("set")).containsOnlyKeys("ruleSetId");
    assertThat(RuleDiff.snapshot(null)).isEmpty();
  }
}
```

```java
// audit/MongoAuditStoreTest.java
package org.fluxgate.studio.admin.audit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import com.mongodb.client.MongoCollection;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Map;
import org.bson.Document;
import org.fluxgate.studio.admin.dto.response.PageResponse;
import org.fluxgate.studio.admin.exception.StorageConnectionException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.MongoDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers
class MongoAuditStoreTest {
  @Container static final MongoDBContainer MONGO = new MongoDBContainer("mongo:7.0");
  private static final Instant T0 = Instant.parse("2026-11-14T00:00:00Z");

  private MongoClient client;
  private MongoCollection<Document> collection;
  private MongoAuditStore store;

  @BeforeEach
  void setUp() {
    client = MongoClients.create(MONGO.getReplicaSetUrl());
    collection = client.getDatabase("studio_audit").getCollection("studio_audit_log");
    collection.drop();
    store = new MongoAuditStore(collection, Duration.ofDays(730));
  }

  @AfterEach
  void close() {
    client.close();
  }

  private static Map<String, Object> map(Object... pairs) {
    Map<String, Object> map = new LinkedHashMap<>();
    for (int i = 0; i < pairs.length; i += 2) {
      map.put((String) pairs[i], pairs[i + 1]);
    }
    return map;
  }

  private void entry(Instant at, String user, AuditAction action, String ruleId) {
    store.insert(
        new AuditEntry(
            null,
            at,
            new AuditActor("sub-" + user, user, user.toUpperCase()),
            action,
            ruleId == null ? null : map("ruleSetId", "checkout", "ruleId", ruleId),
            map("enabled", true),
            map("enabled", false),
            null));
  }

  @Test
  void storesAndReadsBackAnEntry() {
    entry(T0, "alice", AuditAction.RULE_TOGGLE, "checkout-per-user");

    PageResponse<AuditEntry> page =
        store.search(new AuditQuery(null, null, null, null, null, 0, 10));

    assertThat(page.totalElements()).isEqualTo(1);
    AuditEntry stored = page.content().get(0);
    assertThat(stored.id()).isNotBlank();
    assertThat(stored.at()).isEqualTo(T0);
    assertThat(stored.actor()).isEqualTo(new AuditActor("sub-alice", "alice", "ALICE"));
    assertThat(stored.action()).isEqualTo(AuditAction.RULE_TOGGLE);
    assertThat(stored.target()).containsEntry("ruleId", "checkout-per-user");
    assertThat(stored.after()).containsEntry("enabled", false);
    assertThat(store.findById(stored.id())).contains(stored);
  }

  @Test
  void filtersAndPagesNewestFirst() {
    entry(T0, "alice", AuditAction.RULE_UPDATE, "checkout-per-user");
    entry(T0.plusSeconds(1), "bob", AuditAction.RULE_UPDATE, "login-per-ip");
    entry(T0.plusSeconds(2), "alice", AuditAction.KEY_LOOKUP, null);

    assertThat(store.search(new AuditQuery(null, null, null, null, null, 0, 2)).content())
        .extracting(entry -> entry.actor().username())
        .containsExactly("alice", "bob");
    assertThat(
            store
                .search(new AuditQuery(AuditAction.RULE_UPDATE, "alice", null, null, null, 0, 10))
                .totalElements())
        .isEqualTo(1);
    assertThat(
            store
                .search(new AuditQuery(null, null, "LOGIN", null, null, 0, 10))
                .content()
                .get(0)
                .target())
        .containsEntry("ruleId", "login-per-ip");
    assertThat(
            store
                .search(new AuditQuery(null, null, null, T0.plusSeconds(1), T0.plusSeconds(2), 0, 10))
                .totalElements())
        .isEqualTo(1);
  }

  @Test
  void ignoresMalformedIds() {
    assertThat(store.findById("not-an-object-id")).isEmpty();
  }

  @Test
  void createsTheRetentionIndex() {
    store.ensureIndexes();

    Document ttl =
        collection.listIndexes().into(new ArrayList<>()).stream()
            .filter(index -> "at_1".equals(index.getString("name")))
            .findFirst()
            .orElseThrow();
    assertThat(ttl.get("expireAfterSeconds", Number.class).longValue())
        .isEqualTo(Duration.ofDays(730).toSeconds());
  }

  @Test
  void skipsTheTtlWhenRetentionIsZero() {
    new MongoAuditStore(collection, Duration.ZERO).ensureIndexes();

    Document index =
        collection.listIndexes().into(new ArrayList<>()).stream()
            .filter(candidate -> "at_1".equals(candidate.getString("name")))
            .findFirst()
            .orElseThrow();
    assertThat(index.containsKey("expireAfterSeconds")).isFalse();
  }

  @Test
  void reportsAMissingCollectionAsUnavailable() {
    MongoAuditStore disabled = new MongoAuditStore(null, Duration.ZERO);
    assertThatThrownBy(() -> disabled.search(new AuditQuery(null, null, null, null, null, 0, 1)))
        .isInstanceOf(StorageConnectionException.class);
  }
}
```

```java
// audit/AuditServiceTest.java
package org.fluxgate.studio.admin.audit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import org.fluxgate.studio.admin.dto.response.PageResponse;
import org.fluxgate.studio.admin.exception.StorageConnectionException;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.TestingAuthenticationToken;

class AuditServiceTest {
  private static final Instant NOW = Instant.parse("2026-11-14T05:00:00Z");

  private final MongoAuditStore store = mock(MongoAuditStore.class);
  private final AuditService service =
      new AuditService(store, Clock.fixed(NOW, ZoneOffset.UTC));
  private final TestingAuthenticationToken alice =
      new TestingAuthenticationToken("alice", "n/a", "ROLE_ADMIN");

  @Test
  void recordsAChangeWithTheCallerAndTime() {
    assertThat(
            service.recordChange(
                alice, AuditAction.RULE_UPDATE, Map.of("ruleId", "r"), Map.of(), Map.of(), null))
        .isTrue();

    ArgumentCaptor<AuditEntry> captor = ArgumentCaptor.forClass(AuditEntry.class);
    verify(store).insert(captor.capture());
    assertThat(captor.getValue().at()).isEqualTo(NOW);
    assertThat(captor.getValue().actor().username()).isEqualTo("alice");
  }

  @Test
  void reportsAFailedChangeRecordWithoutThrowing() {
    doThrow(new IllegalStateException("down")).when(store).insert(any());

    assertThat(service.recordChange(alice, AuditAction.RULE_DELETE, null, null, null, null))
        .isFalse();
  }

  @Test
  void refusesALookupThatCannotBeRecorded() {
    doThrow(new IllegalStateException("down")).when(store).insert(any());

    assertThatThrownBy(() -> service.recordKeyLookup(alice, "123456789", "none", "24h"))
        .isInstanceOf(StorageConnectionException.class);
  }

  @Test
  void masksLookupValuesInSearchResultsOnly() {
    AuditEntry lookup =
        new AuditEntry(
            "1", NOW, new AuditActor(null, "alice", "alice"), AuditAction.KEY_LOOKUP, null, null,
            null, Map.of("value", "123456789", "transform", "none"));
    when(store.search(any())).thenReturn(new PageResponse<>(List.of(lookup), 0, 10, 1));

    AuditEntry listed =
        service.search(new AuditQuery(null, null, null, null, null, 0, 10)).content().get(0);

    assertThat(listed.detail()).containsEntry("value", "12****89");
    assertThat(AuditService.masked(listed)).isEqualTo(listed);
  }

  @Test
  void flagsResponsesWhoseAuditFailed() {
    assertThat(AuditService.flag(ResponseEntity.ok(), false).build().getHeaders())
        .containsEntry(AuditService.HEADER, List.of("failed"));
    assertThat(AuditService.flag(ResponseEntity.ok(), true).build().getHeaders())
        .doesNotContainKey(AuditService.HEADER);
  }
}
```

```java
// controller/RuleControllerAuditTest.java
package org.fluxgate.studio.admin.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Map;
import org.fluxgate.studio.admin.audit.AuditAction;
import org.fluxgate.studio.admin.audit.AuditService;
import org.fluxgate.studio.admin.config.SecurityConfig;
import org.fluxgate.studio.admin.dto.response.RateBandResponse;
import org.fluxgate.studio.admin.dto.response.RuleResponse;
import org.fluxgate.studio.admin.service.RuleService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(controllers = RuleController.class)
@Import(SecurityConfig.class)
@TestPropertySource(
    properties = {
      "spring.security.oauth2.resourceserver.jwt.issuer-uri=http://localhost:18080/realms/fluxgate",
      "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://localhost:18080/realms/fluxgate/protocol/openid-connect/certs",
      "app.security.cors.allowed-origins=http://localhost:3000"
    })
class RuleControllerAuditTest {

  private static final String UPDATE_BODY =
      "{\"name\": \"Rule\", \"enabled\": true, \"scope\": \"PER_USER\", \"keyStrategyId\": \"userId\","
          + " \"onLimitExceedPolicy\": \"REJECT_REQUEST\","
          + " \"bands\": [{\"windowSeconds\": 60, \"capacity\": 20}], \"version\": 1}";

  @Autowired private MockMvc mockMvc;
  @MockBean private RuleService ruleService;
  @MockBean private AuditService auditService;

  private static RuleResponse rule(boolean enabled, long capacity, long version) {
    return new RuleResponse(
        "r1", "Rule", enabled, "PER_USER", "userId", "REJECT_REQUEST",
        List.of(new RateBandResponse(60, capacity, null)), "set", List.of(), Map.of(), version);
  }

  @Test
  @WithMockUser(roles = "ADMIN")
  void updateRecordsOnlyTheChangedFields() throws Exception {
    when(ruleService.getRuleById("set", "r1")).thenReturn(rule(true, 30, 1));
    when(ruleService.updateRule(eq("set"), eq("r1"), any(), eq(1L))).thenReturn(rule(true, 20, 2));
    when(auditService.recordChange(any(), any(), any(), any(), any(), any())).thenReturn(true);

    mockMvc
        .perform(
            put("/api/rules/r1?ruleSetId=set")
                .header("If-Match", "1")
                .contentType(MediaType.APPLICATION_JSON)
                .content(UPDATE_BODY))
        .andExpect(status().isOk())
        .andExpect(header().doesNotExist(AuditService.HEADER));

    verify(auditService)
        .recordChange(
            any(),
            eq(AuditAction.RULE_UPDATE),
            eq(Map.of("ruleSetId", "set", "ruleId", "r1")),
            eq(Map.of("bands", List.of(Map.of("windowSeconds", 60L, "capacity", 30L)))),
            eq(Map.of("bands", List.of(Map.of("windowSeconds", 60L, "capacity", 20L)))),
            isNull());
  }

  @Test
  @WithMockUser(roles = "ADMIN")
  void aFailedAuditIsReportedButTheChangeStands() throws Exception {
    when(ruleService.getRuleById("set", "r1")).thenReturn(rule(true, 30, 1));
    when(ruleService.toggleRule("set", "r1")).thenReturn(rule(false, 30, 2));
    when(auditService.recordChange(any(), any(), any(), any(), any(), any())).thenReturn(false);

    mockMvc
        .perform(patch("/api/rules/r1/toggle?ruleSetId=set"))
        .andExpect(status().isOk())
        .andExpect(header().string(AuditService.HEADER, "failed"));
  }

  @Test
  @WithMockUser(roles = "ADMIN")
  void deleteRecordsTheRemovedRule() throws Exception {
    when(ruleService.getRuleById("set", "r1")).thenReturn(rule(true, 30, 1));
    when(auditService.recordChange(any(), any(), any(), any(), any(), any())).thenReturn(true);

    mockMvc.perform(delete("/api/rules/r1?ruleSetId=set")).andExpect(status().isNoContent());

    verify(ruleService).deleteRule("set", "r1");
    verify(auditService)
        .recordChange(
            any(), eq(AuditAction.RULE_DELETE), eq(Map.of("ruleSetId", "set", "ruleId", "r1")),
            any(), isNull(), isNull());
  }
}
```

`RuleDiff.target`와 `snapshot`은 `LinkedHashMap`을 돌려주므로 `Map.of`와 `equals`가 맞는다. 밴드 `label`이 null이면 스냅샷에 넣지 않는다.

- [ ] **Step 2: 실패 확인**

Run: `./mvnw -B -ntp $M2 test -Dtest='RuleDiffTest,MongoAuditStoreTest,AuditServiceTest,RuleControllerAuditTest'`
Expected: 컴파일 실패, `AuditEntry` 등 없음

- [ ] **Step 3: 구현**

```java
// AuditAction.java
package org.fluxgate.studio.admin.audit;

public enum AuditAction {
  RULE_CREATE,
  RULE_UPDATE,
  RULE_TOGGLE,
  RULE_DELETE,
  RULES_DELETE_ALL,
  RULES_IMPORT,
  POLICY_PUBLISH,
  POLICY_ROLLBACK,
  KEY_LOOKUP
}
```

```java
// AuditEntry.java
package org.fluxgate.studio.admin.audit;

import java.time.Instant;
import java.util.Map;

public record AuditEntry(
    String id,
    Instant at,
    AuditActor actor,
    AuditAction action,
    Map<String, Object> target,
    Map<String, Object> before,
    Map<String, Object> after,
    Map<String, Object> detail) {}
```

```java
// AuditQuery.java
package org.fluxgate.studio.admin.audit;

import java.time.Instant;

public record AuditQuery(
    AuditAction action, String actor, String text, Instant from, Instant to, int page, int size) {}
```

```java
// RuleDiff.java
package org.fluxgate.studio.admin.audit;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.fluxgate.studio.admin.dto.response.RateBandResponse;
import org.fluxgate.studio.admin.dto.response.RuleResponse;

/** Turns rules into audit friendly maps and keeps only the fields an edit changed. */
public final class RuleDiff {

  public record Change(Map<String, Object> before, Map<String, Object> after) {}

  private RuleDiff() {}

  public static Map<String, Object> target(RuleResponse rule) {
    Map<String, Object> target = new LinkedHashMap<>();
    target.put("ruleSetId", rule.ruleSetId());
    target.put("ruleId", rule.id());
    return target;
  }

  public static Map<String, Object> ruleSet(String ruleSetId) {
    Map<String, Object> target = new LinkedHashMap<>();
    target.put("ruleSetId", ruleSetId);
    return target;
  }

  public static Map<String, Object> snapshot(RuleResponse rule) {
    Map<String, Object> snapshot = new LinkedHashMap<>();
    if (rule == null) {
      return snapshot;
    }
    snapshot.put("name", rule.name());
    snapshot.put("enabled", rule.enabled());
    snapshot.put("scope", rule.scope());
    snapshot.put("keyStrategyId", rule.keyStrategyId());
    snapshot.put("onLimitExceedPolicy", rule.onLimitExceedPolicy());
    snapshot.put(
        "bands",
        rule.bands() == null ? List.of() : rule.bands().stream().map(RuleDiff::band).toList());
    snapshot.put("ruleSetId", rule.ruleSetId());
    snapshot.put("tags", rule.tags());
    snapshot.put("attributes", rule.attributes());
    return snapshot;
  }

  public static Change diff(RuleResponse before, RuleResponse after) {
    Map<String, Object> previous = snapshot(before);
    Map<String, Object> next = snapshot(after);
    Set<String> fields = new LinkedHashSet<>(previous.keySet());
    fields.addAll(next.keySet());
    Map<String, Object> changedBefore = new LinkedHashMap<>();
    Map<String, Object> changedAfter = new LinkedHashMap<>();
    for (String field : fields) {
      if (!Objects.equals(previous.get(field), next.get(field))) {
        changedBefore.put(field, previous.get(field));
        changedAfter.put(field, next.get(field));
      }
    }
    return new Change(changedBefore, changedAfter);
  }

  private static Map<String, Object> band(RateBandResponse band) {
    Map<String, Object> map = new LinkedHashMap<>();
    map.put("windowSeconds", band.windowSeconds());
    map.put("capacity", band.capacity());
    if (band.label() != null) {
      map.put("label", band.label());
    }
    return map;
  }
}
```

```java
// MongoAuditStore.java
package org.fluxgate.studio.admin.audit;

import com.mongodb.MongoException;
import com.mongodb.client.MongoCollection;
import com.mongodb.client.model.Filters;
import com.mongodb.client.model.IndexOptions;
import com.mongodb.client.model.Indexes;
import com.mongodb.client.model.Sorts;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;
import org.bson.Document;
import org.bson.conversions.Bson;
import org.bson.types.ObjectId;
import org.fluxgate.studio.admin.dto.response.PageResponse;
import org.fluxgate.studio.admin.exception.StorageConnectionException;

/** Stores who changed or looked up what. Entries are never updated. */
public class MongoAuditStore {

  private final MongoCollection<Document> collection;
  private final Duration retention;

  public MongoAuditStore(MongoCollection<Document> collection, Duration retention) {
    this.collection = collection;
    this.retention = retention;
  }

  public void ensureIndexes() {
    IndexOptions options = new IndexOptions();
    if (retention != null && retention.toSeconds() > 0) {
      options.expireAfter(retention.toSeconds(), TimeUnit.SECONDS);
    }
    audit().createIndex(Indexes.ascending("at"), options);
    audit()
        .createIndex(Indexes.compoundIndex(Indexes.ascending("action"), Indexes.descending("at")));
  }

  public void insert(AuditEntry entry) {
    audit().insertOne(toDocument(entry));
  }

  public PageResponse<AuditEntry> search(AuditQuery query) {
    List<Bson> filters = new ArrayList<>();
    if (query.action() != null) {
      filters.add(Filters.eq("action", query.action().name()));
    }
    if (query.actor() != null) {
      filters.add(Filters.eq("actor.username", query.actor()));
    }
    if (query.text() != null) {
      Pattern pattern = Pattern.compile(Pattern.quote(query.text()), Pattern.CASE_INSENSITIVE);
      filters.add(
          Filters.or(
              Filters.regex("target.ruleSetId", pattern), Filters.regex("target.ruleId", pattern)));
    }
    if (query.from() != null) {
      filters.add(Filters.gte("at", Date.from(query.from())));
    }
    if (query.to() != null) {
      filters.add(Filters.lt("at", Date.from(query.to())));
    }
    Bson filter = filters.isEmpty() ? new Document() : Filters.and(filters);
    try {
      long total = audit().countDocuments(filter);
      List<AuditEntry> content = new ArrayList<>();
      for (Document doc :
          audit()
              .find(filter)
              .sort(Sorts.descending("at"))
              .skip(query.page() * query.size())
              .limit(query.size())) {
        content.add(fromDocument(doc));
      }
      return new PageResponse<>(content, query.page(), query.size(), total);
    } catch (MongoException e) {
      throw new StorageConnectionException("MongoDB", "audit query failed", e);
    }
  }

  public Optional<AuditEntry> findById(String id) {
    if (id == null || !ObjectId.isValid(id)) {
      return Optional.empty();
    }
    try {
      return Optional.ofNullable(audit().find(Filters.eq("_id", new ObjectId(id))).first())
          .map(MongoAuditStore::fromDocument);
    } catch (MongoException e) {
      throw new StorageConnectionException("MongoDB", "audit query failed", e);
    }
  }

  private MongoCollection<Document> audit() {
    if (collection == null) {
      throw new StorageConnectionException(
          "MongoDB", "the audit log needs the FluxGate Mongo connection");
    }
    return collection;
  }

  private static Document toDocument(AuditEntry entry) {
    AuditActor actor = entry.actor();
    return new Document("at", Date.from(entry.at()))
        .append(
            "actor",
            new Document("subject", actor.subject())
                .append("username", actor.username())
                .append("name", actor.name()))
        .append("action", entry.action().name())
        .append("target", document(entry.target()))
        .append("before", document(entry.before()))
        .append("after", document(entry.after()))
        .append("detail", document(entry.detail()));
  }

  private static AuditEntry fromDocument(Document doc) {
    Document actor = doc.get("actor", Document.class);
    return new AuditEntry(
        doc.getObjectId("_id").toHexString(),
        doc.getDate("at").toInstant(),
        new AuditActor(
            actor.getString("subject"), actor.getString("username"), actor.getString("name")),
        AuditAction.valueOf(doc.getString("action")),
        map(doc, "target"),
        map(doc, "before"),
        map(doc, "after"),
        map(doc, "detail"));
  }

  private static Document document(Map<String, Object> map) {
    return map == null ? null : new Document(map);
  }

  private static Map<String, Object> map(Document doc, String field) {
    Document value = doc.get(field, Document.class);
    return value == null ? null : new LinkedHashMap<>(value);
  }
}
```

```java
// AuditService.java
package org.fluxgate.studio.admin.audit;

import java.time.Clock;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import org.fluxgate.studio.admin.dto.response.PageResponse;
import org.fluxgate.studio.admin.exception.StorageConnectionException;
import org.fluxgate.studio.admin.monitoring.KeyMasker;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;

/** Applies the audit policy. A change is kept even when its record fails, a lookup is not. */
@Service
public class AuditService {

  public static final String HEADER = "X-Studio-Audit";
  public static final String FAILED = "failed";

  private static final Logger log = LoggerFactory.getLogger(AuditService.class);

  private final MongoAuditStore store;
  private final Clock clock;

  public AuditService(MongoAuditStore store, Clock clock) {
    this.store = store;
    this.clock = clock;
  }

  public boolean recordChange(
      Authentication authentication,
      AuditAction action,
      Map<String, Object> target,
      Map<String, Object> before,
      Map<String, Object> after,
      Map<String, Object> detail) {
    try {
      store.insert(
          new AuditEntry(
              null,
              clock.instant(),
              AuditActor.from(authentication),
              action,
              target,
              before,
              after,
              detail));
      return true;
    } catch (RuntimeException e) {
      log.error("Audit record for {} on {} was not stored", action, target, e);
      return false;
    }
  }

  public void recordKeyLookup(
      Authentication authentication, String value, String transform, String window) {
    Map<String, Object> detail = new LinkedHashMap<>();
    detail.put("value", value);
    detail.put("transform", transform);
    detail.put("window", window);
    try {
      store.insert(
          new AuditEntry(
              null,
              clock.instant(),
              AuditActor.from(authentication),
              AuditAction.KEY_LOOKUP,
              null,
              null,
              null,
              detail));
    } catch (RuntimeException e) {
      throw new StorageConnectionException("Audit log", "key lookup was not recorded", e);
    }
  }

  public PageResponse<AuditEntry> search(AuditQuery query) {
    PageResponse<AuditEntry> page = store.search(query);
    return new PageResponse<>(
        page.content().stream().map(AuditService::masked).toList(),
        page.page(),
        page.size(),
        page.totalElements());
  }

  public Optional<AuditEntry> find(String id) {
    return store.findById(id);
  }

  static AuditEntry masked(AuditEntry entry) {
    if (entry.action() != AuditAction.KEY_LOOKUP
        || entry.detail() == null
        || !(entry.detail().get("value") instanceof String value)
        || value.equals(KeyMasker.mask(value))) {
      return entry;
    }
    Map<String, Object> detail = new LinkedHashMap<>(entry.detail());
    detail.put("value", KeyMasker.mask(value));
    return new AuditEntry(
        entry.id(),
        entry.at(),
        entry.actor(),
        entry.action(),
        entry.target(),
        entry.before(),
        entry.after(),
        detail);
  }

  public static <B extends ResponseEntity.HeadersBuilder<B>> B flag(B builder, boolean audited) {
    return audited ? builder : builder.header(HEADER, FAILED);
  }
}
```

`masked`는 이미 가린 값을 다시 가리지 않도록 `value.equals(KeyMasker.mask(value))`를 확인한다. 이 때문에 테스트의 `AuditService.masked(listed)`가 같은 객체를 돌려준다.

`MonitoringConfig`에 감사 저장소 빈을 추가한다.

```java
  @Bean
  public MongoAuditStore mongoAuditStore(
      ObjectProvider<FluxgateMongoClientHolder> clients,
      @Value("${fluxgate.mongo.database:fluxgate}") String database,
      AuditProperties properties) {
    return new MongoAuditStore(
        collection(clients, database, properties.collection()), properties.retention());
  }
```

`RuleController` 수정. 생성자에 `AuditService`를 받고, 변경 메서드마다 `Authentication authentication` 인자를 추가한다.

```java
  private final RuleService ruleService;
  private final AuditService auditService;

  public RuleController(RuleService ruleService, AuditService auditService) {
    this.ruleService = ruleService;
    this.auditService = auditService;
  }
```

```java
  // importRules
  ImportResultResponse result = ruleService.importRules(request.rules());
  Map<String, Object> detail = new LinkedHashMap<>();
  detail.put("total", result.total());
  detail.put("created", result.created());
  detail.put("updated", result.updated());
  boolean audited =
      auditService.recordChange(
          authentication, AuditAction.RULES_IMPORT, null, null, null, detail);
  return AuditService.flag(ResponseEntity.ok(), audited).body(result);
```

```java
  // createRule
  RuleResponse created = ruleService.createRule(request);
  boolean audited =
      auditService.recordChange(
          authentication,
          AuditAction.RULE_CREATE,
          RuleDiff.target(created),
          null,
          RuleDiff.snapshot(created),
          null);
  return AuditService.flag(ResponseEntity.status(HttpStatus.CREATED), audited).body(created);
```

```java
  // updateRule
  boolean scoped = scoped(ruleSetId, unassigned);
  Long expected = parseIfMatch(ifMatch);
  RuleResponse before =
      scoped ? ruleService.getRuleById(ruleSetId, id) : ruleService.getRuleById(id);
  RuleResponse updated =
      scoped
          ? ruleService.updateRule(ruleSetId, id, request, expected)
          : ruleService.updateRule(id, request, expected);
  RuleDiff.Change change = RuleDiff.diff(before, updated);
  boolean audited =
      auditService.recordChange(
          authentication,
          AuditAction.RULE_UPDATE,
          RuleDiff.target(updated),
          change.before(),
          change.after(),
          null);
  return AuditService.flag(ResponseEntity.ok().eTag(String.valueOf(updated.version())), audited)
      .body(updated);
```

```java
  // deleteRule
  boolean scoped = scoped(ruleSetId, unassigned);
  RuleResponse before =
      scoped ? ruleService.getRuleById(ruleSetId, id) : ruleService.getRuleById(id);
  if (scoped) ruleService.deleteRule(ruleSetId, id);
  else ruleService.deleteRule(id);
  boolean audited =
      auditService.recordChange(
          authentication,
          AuditAction.RULE_DELETE,
          before == null ? null : RuleDiff.target(before),
          RuleDiff.snapshot(before),
          null,
          null);
  return AuditService.flag(ResponseEntity.status(HttpStatus.NO_CONTENT), audited).build();
```

```java
  // toggleRule
  boolean scoped = scoped(ruleSetId, unassigned);
  RuleResponse before =
      scoped ? ruleService.getRuleById(ruleSetId, id) : ruleService.getRuleById(id);
  RuleResponse toggled = scoped ? ruleService.toggleRule(ruleSetId, id) : ruleService.toggleRule(id);
  RuleDiff.Change change = RuleDiff.diff(before, toggled);
  boolean audited =
      auditService.recordChange(
          authentication,
          AuditAction.RULE_TOGGLE,
          RuleDiff.target(toggled),
          change.before(),
          change.after(),
          null);
  return AuditService.flag(ResponseEntity.ok(), audited).body(toggled);
```

```java
  // deleteByRuleSetId
  int count = ruleService.deleteByRuleSetId(ruleSetId);
  boolean audited =
      auditService.recordChange(
          authentication,
          AuditAction.RULES_DELETE_ALL,
          RuleDiff.ruleSet(ruleSetId),
          null,
          null,
          Map.of("deletedCount", count));
  return AuditService.flag(ResponseEntity.ok(), audited)
      .body(
          Map.of(
              "message", "Rules deleted successfully",
              "ruleSetId", ruleSetId,
              "deletedCount", count));
```

`PolicyController` 수정. 반환형을 `ResponseEntity<Document>`로 바꾸고 감사 기록을 붙인다.

```java
  private final PolicyPublicationService service;
  private final AuditService auditService;

  public PolicyController(PolicyPublicationService service, AuditService auditService) {
    this.service = service;
    this.auditService = auditService;
  }

  @PostMapping("/publish")
  @PreAuthorize("hasRole('ADMIN')")
  public ResponseEntity<Document> publish(
      @PathVariable String id,
      @Valid @RequestBody PublishPolicyRequest request,
      Authentication authentication) {
    Document result = service.publish(id, request, authentication.getName());
    Map<String, Object> detail = policyDetail(request.operationId(), request.resetCounters(), result);
    detail.put("rules", request.rules().size());
    boolean audited =
        auditService.recordChange(
            authentication, AuditAction.POLICY_PUBLISH, RuleDiff.ruleSet(id), null, null, detail);
    return AuditService.flag(ResponseEntity.ok(), audited).body(result);
  }

  @PostMapping("/rollback")
  @PreAuthorize("hasRole('ADMIN')")
  public ResponseEntity<Document> rollback(
      @PathVariable String id,
      @Valid @RequestBody RollbackPolicyRequest request,
      Authentication authentication) {
    Document result = service.rollback(id, request, authentication.getName());
    Map<String, Object> detail = policyDetail(request.operationId(), request.resetCounters(), result);
    detail.put("targetRevision", request.targetRevision());
    boolean audited =
        auditService.recordChange(
            authentication, AuditAction.POLICY_ROLLBACK, RuleDiff.ruleSet(id), null, null, detail);
    return AuditService.flag(ResponseEntity.ok(), audited).body(result);
  }

  private static Map<String, Object> policyDetail(
      String operationId, Boolean resetCounters, Document result) {
    Map<String, Object> detail = new LinkedHashMap<>();
    detail.put("operationId", operationId);
    detail.put("resetCounters", resetCounters);
    if (result != null && result.containsKey("revision")) {
      detail.put("revision", result.get("revision"));
    }
    return detail;
  }
```

기존 테스트 수정:

- `RuleControllerTest`: `new RuleController(ruleService)`를 `new RuleController(ruleService, auditService)`로 바꾸고, 필드 `private final AuditService auditService = mock(AuditService.class);`를 추가한다. 변경 메서드 호출에 마지막 인자로 `null`을 넘긴다.
- `RuleControllerSecurityTest`, `ApiDocsSecurityTest`, `OpenApiRuntimeCompatibilityTest`, `PolicyControllerTest`: `@MockBean private AuditService auditService;`를 추가한다.

- [ ] **Step 4: 통과 확인**

Run: `./mvnw -B -ntp $M2 spotless:apply && ./mvnw -B -ntp $M2 test`
Expected: 전체 테스트 통과, 실패 0

- [ ] **Step 5: Commit**

```bash
git add fluxgate-studio-admin-api/src
git commit -m "feat(api): record rule and policy changes in an audit log"
```

---

### Task 5: 키 조회 API

**Files:**
- Create: `.../monitoring/KeyTransform.java`, `KeyStatus.java`, `KeyLookupRequest.java`, `KeyRuleSetStatus.java`, `KeyLookupResponse.java`, `KeyLookupService.java`
- Create: `.../controller/KeyLookupController.java`
- Test: `.../monitoring/KeyTransformTest.java`, `KeyLookupServiceTest.java`, `.../controller/KeyLookupControllerSecurityTest.java`

**Interfaces:**
- Consumes: `MongoEventStore`, `AuditService.recordKeyLookup`, `MonitoringService.fill`, `MonitoringWindow.KEY_LOOKUP`, `MonitoringProperties.keyTransforms()`
- Produces:
  - `enum KeyTransform { NONE, SHA256 }`: `code()`, `apply(String)`, `static KeyTransform parse(String, List<String> enabled)`
  - `enum KeyStatus { ALLOWED, BLOCKED, RECOVERED }`
  - `record KeyLookupRequest(@NotBlank @Size(max = 512) String value, @NotBlank String transform, @NotBlank String window)`
  - `record KeyRuleSetStatus(String ruleSetId, KeyStatus status, long lastDecisionAt, boolean lastAllowed, long remainingTokens, Long blockedUntil, long allowed, long rejected)`
  - `record KeyLookupResponse(String key, String transform, String window, long from, long to, long bucketMillis, List<KeyRuleSetStatus> ruleSets, List<Bucket> buckets, List<KeyDecision> recent)`
  - `KeyLookupService`: `List<String> transforms()`, `KeyLookupResponse lookup(KeyLookupRequest, Authentication)`, `static KeyRuleSetStatus status(RuleSetActivity, KeyDecision, long now)`
  - `GET /api/keys/transforms`, `POST /api/keys/decisions`

- [ ] **Step 1: 실패하는 테스트 작성**

```java
// KeyTransformTest.java
package org.fluxgate.studio.admin.monitoring;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import org.fluxgate.studio.admin.exception.InvalidRuleException;
import org.junit.jupiter.api.Test;

class KeyTransformTest {

  @Test
  void hashesWithLowercaseSha256() {
    assertThat(KeyTransform.SHA256.apply("abc"))
        .isEqualTo("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    assertThat(KeyTransform.NONE.apply("abc")).isEqualTo("abc");
  }

  @Test
  void acceptsOnlyEnabledTransforms() {
    assertThat(KeyTransform.parse("sha256", List.of("none", "sha256")))
        .isEqualTo(KeyTransform.SHA256);
    assertThatThrownBy(() -> KeyTransform.parse("sha256", List.of("none")))
        .isInstanceOf(InvalidRuleException.class)
        .hasMessageContaining("must be one of: none");
  }
}
```

```java
// KeyLookupServiceTest.java
package org.fluxgate.studio.admin.monitoring;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import org.fluxgate.studio.admin.audit.AuditService;
import org.fluxgate.studio.admin.exception.InvalidRuleException;
import org.fluxgate.studio.admin.exception.StorageConnectionException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.springframework.security.authentication.TestingAuthenticationToken;

class KeyLookupServiceTest {
  private static final long NOW = 1_794_600_000_000L;
  private static final long DAY = 86_400_000L;

  private final MongoEventStore store = mock(MongoEventStore.class);
  private final AuditService audit = mock(AuditService.class);
  private final TestingAuthenticationToken admin =
      new TestingAuthenticationToken("alice", "n/a", "ROLE_ADMIN");
  private KeyLookupService service;

  @BeforeEach
  void setUp() {
    service =
        new KeyLookupService(
            store,
            audit,
            new MonitoringProperties(
                "", "rate_limit_events", true, Duration.ofSeconds(10), Duration.ofSeconds(5),
                List.of("none", "sha256")),
            Clock.fixed(Instant.ofEpochMilli(NOW), ZoneOffset.UTC));
    when(store.buckets(anyLong(), anyLong(), anyLong(), any(), anyString())).thenReturn(List.of());
    when(store.recentDecisions(anyString(), anyLong(), anyLong(), eq(100))).thenReturn(List.of());
  }

  private static KeyDecision decision(String ruleSetId, long at, boolean allowed, long retryAfter) {
    return new KeyDecision(at, ruleSetId, ruleSetId + "-rule", "/api/x", "POST", allowed, 4, retryAfter);
  }

  @Test
  void recordsTheLookupBeforeReadingHistory() {
    when(store.activityByRuleSet(NOW - DAY, NOW, "123456789"))
        .thenReturn(List.of(new RuleSetActivity("a", 5, 1, NOW - 1_000)));
    when(store.lastDecisionByRuleSet("123456789", NOW - DAY, NOW))
        .thenReturn(Map.of("a", decision("a", NOW - 1_000, false, 5_000)));

    KeyLookupResponse response =
        service.lookup(new KeyLookupRequest(" 123456789 ", "none", "24h"), admin);

    InOrder order = inOrder(audit, store);
    order.verify(audit).recordKeyLookup(admin, "123456789", "none", "24h");
    order.verify(store).lastDecisionByRuleSet("123456789", NOW - DAY, NOW);
    assertThat(response.key()).isEqualTo("123456789");
    assertThat(response.bucketMillis()).isEqualTo(900_000L);
    assertThat(response.buckets()).hasSize(96);
    assertThat(response.ruleSets())
        .containsExactly(
            new KeyRuleSetStatus("a", KeyStatus.BLOCKED, NOW - 1_000, false, 4, NOW + 4_000, 4, 1));
  }

  @Test
  void looksUpTheHashedKeyButAuditsTheInput() {
    service.lookup(new KeyLookupRequest("abc", "sha256", "1h"), admin);

    String hash = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    verify(audit).recordKeyLookup(admin, "abc", "sha256", "1h");
    verify(store).activityByRuleSet(NOW - 3_600_000L, NOW, hash);
  }

  @Test
  void doesNotQueryWhenTheLookupCannotBeAudited() {
    doThrow(new StorageConnectionException("Audit log", "down"))
        .when(audit)
        .recordKeyLookup(any(), anyString(), anyString(), anyString());

    assertThatThrownBy(() -> service.lookup(new KeyLookupRequest("u1", "none", "1h"), admin))
        .isInstanceOf(StorageConnectionException.class);
    verifyNoInteractions(store);
  }

  @Test
  void rejectsInvalidInputBeforeAuditing() {
    assertThatThrownBy(() -> service.lookup(new KeyLookupRequest("u1", "none", "5m"), admin))
        .isInstanceOf(InvalidRuleException.class);
    assertThatThrownBy(() -> service.lookup(new KeyLookupRequest("u1", "md5", "1h"), admin))
        .isInstanceOf(InvalidRuleException.class);
    assertThatThrownBy(() -> service.lookup(new KeyLookupRequest("   ", "none", "1h"), admin))
        .isInstanceOf(InvalidRuleException.class);
    verify(audit, never()).recordKeyLookup(any(), anyString(), anyString(), anyString());
  }

  @Test
  void derivesTheStatusFromTheLastDecision() {
    RuleSetActivity activity = new RuleSetActivity("a", 3, 1, NOW - 10_000);

    assertThat(KeyLookupService.status(activity, decision("a", NOW - 10_000, true, 0), NOW).status())
        .isEqualTo(KeyStatus.ALLOWED);
    assertThat(
            KeyLookupService.status(activity, decision("a", NOW - 10_000, false, 20_000), NOW)
                .status())
        .isEqualTo(KeyStatus.BLOCKED);
    assertThat(
            KeyLookupService.status(activity, decision("a", NOW - 10_000, false, 5_000), NOW)
                .status())
        .isEqualTo(KeyStatus.RECOVERED);
    assertThat(KeyLookupService.status(activity, decision("a", NOW, true, 0), NOW).blockedUntil())
        .isNull();
  }

  @Test
  void listsTheEnabledTransforms() {
    assertThat(service.transforms()).containsExactly("none", "sha256");
  }
}
```

```java
// controller/KeyLookupControllerSecurityTest.java
package org.fluxgate.studio.admin.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import org.fluxgate.studio.admin.config.SecurityConfig;
import org.fluxgate.studio.admin.exception.StorageConnectionException;
import org.fluxgate.studio.admin.monitoring.KeyLookupResponse;
import org.fluxgate.studio.admin.monitoring.KeyLookupService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(controllers = KeyLookupController.class)
@Import(SecurityConfig.class)
@TestPropertySource(
    properties = {
      "spring.security.oauth2.resourceserver.jwt.issuer-uri=http://localhost:18080/realms/fluxgate",
      "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://localhost:18080/realms/fluxgate/protocol/openid-connect/certs",
      "app.security.cors.allowed-origins=http://localhost:3000"
    })
class KeyLookupControllerSecurityTest {
  private static final String BODY = "{\"value\":\"u1\",\"transform\":\"none\",\"window\":\"24h\"}";

  @Autowired private MockMvc mockMvc;
  @MockBean private KeyLookupService keyLookupService;

  @Test
  @WithMockUser(roles = "USER")
  void viewersCannotLookUpKeys() throws Exception {
    mockMvc
        .perform(post("/api/keys/decisions").contentType(MediaType.APPLICATION_JSON).content(BODY))
        .andExpect(status().isForbidden());
  }

  @Test
  @WithMockUser(roles = "ADMIN")
  void adminsLookUpKeys() throws Exception {
    when(keyLookupService.lookup(any(), any()))
        .thenReturn(
            new KeyLookupResponse("u1", "none", "24h", 0, 1, 1, List.of(), List.of(), List.of()));

    mockMvc
        .perform(post("/api/keys/decisions").contentType(MediaType.APPLICATION_JSON).content(BODY))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.key").value("u1"));
  }

  @Test
  @WithMockUser(roles = "ADMIN")
  void blankValuesAreBadRequests() throws Exception {
    mockMvc
        .perform(
            post("/api/keys/decisions")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"value\":\"\",\"transform\":\"none\",\"window\":\"24h\"}"))
        .andExpect(status().isBadRequest());
  }

  @Test
  @WithMockUser(roles = "ADMIN")
  void anUnrecordableLookupIsServiceUnavailable() throws Exception {
    when(keyLookupService.lookup(any(), any()))
        .thenThrow(new StorageConnectionException("Audit log", "down"));

    mockMvc
        .perform(post("/api/keys/decisions").contentType(MediaType.APPLICATION_JSON).content(BODY))
        .andExpect(status().isServiceUnavailable());
  }

  @Test
  @WithMockUser(roles = "ADMIN")
  void adminsListTransforms() throws Exception {
    when(keyLookupService.transforms()).thenReturn(List.of("none", "sha256"));

    mockMvc
        .perform(get("/api/keys/transforms"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[1]").value("sha256"));
  }
}
```

- [ ] **Step 2: 실패 확인**

Run: `./mvnw -B -ntp $M2 test -Dtest='KeyTransformTest,KeyLookupServiceTest,KeyLookupControllerSecurityTest'`
Expected: 컴파일 실패

- [ ] **Step 3: 구현**

```java
// KeyTransform.java
package org.fluxgate.studio.admin.monitoring;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import org.fluxgate.studio.admin.exception.InvalidRuleException;

/** How a typed key is turned into the key services stored. */
public enum KeyTransform {
  NONE("none") {
    @Override
    public String apply(String value) {
      return value;
    }
  },
  SHA256("sha256") {
    @Override
    public String apply(String value) {
      try {
        return HexFormat.of()
            .formatHex(
                MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
      } catch (NoSuchAlgorithmException e) {
        throw new IllegalStateException("SHA-256 is unavailable", e);
      }
    }
  };

  private final String code;

  KeyTransform(String code) {
    this.code = code;
  }

  public String code() {
    return code;
  }

  public abstract String apply(String value);

  public static KeyTransform parse(String code, List<String> enabled) {
    for (KeyTransform transform : values()) {
      if (transform.code.equals(code) && enabled.contains(transform.code)) {
        return transform;
      }
    }
    throw new InvalidRuleException("transform", "must be one of: " + String.join(", ", enabled));
  }
}
```

```java
// KeyStatus.java
package org.fluxgate.studio.admin.monitoring;

public enum KeyStatus {
  ALLOWED,
  BLOCKED,
  RECOVERED
}
```

```java
// KeyLookupRequest.java
package org.fluxgate.studio.admin.monitoring;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record KeyLookupRequest(
    @NotBlank @Size(max = 512) String value, @NotBlank String transform, @NotBlank String window) {}
```

```java
// KeyRuleSetStatus.java
package org.fluxgate.studio.admin.monitoring;

public record KeyRuleSetStatus(
    String ruleSetId,
    KeyStatus status,
    long lastDecisionAt,
    boolean lastAllowed,
    long remainingTokens,
    Long blockedUntil,
    long allowed,
    long rejected) {}
```

```java
// KeyLookupResponse.java
package org.fluxgate.studio.admin.monitoring;

import java.util.List;

public record KeyLookupResponse(
    String key,
    String transform,
    String window,
    long from,
    long to,
    long bucketMillis,
    List<KeyRuleSetStatus> ruleSets,
    List<Bucket> buckets,
    List<KeyDecision> recent) {}
```

```java
// KeyLookupService.java
package org.fluxgate.studio.admin.monitoring;

import java.time.Clock;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import org.fluxgate.studio.admin.audit.AuditService;
import org.fluxgate.studio.admin.exception.InvalidRuleException;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;

/** Answers whether one key is blocked, based on the last recorded decision per rule set. */
@Service
public class KeyLookupService {

  static final int RECENT_LIMIT = 100;

  private final MongoEventStore store;
  private final AuditService auditService;
  private final MonitoringProperties properties;
  private final Clock clock;

  public KeyLookupService(
      MongoEventStore store,
      AuditService auditService,
      MonitoringProperties properties,
      Clock clock) {
    this.store = store;
    this.auditService = auditService;
    this.properties = properties;
    this.clock = clock;
  }

  public List<String> transforms() {
    return properties.keyTransforms();
  }

  public KeyLookupResponse lookup(KeyLookupRequest request, Authentication authentication) {
    MonitoringWindow window = MonitoringWindow.parse(request.window(), MonitoringWindow.KEY_LOOKUP);
    KeyTransform transform = KeyTransform.parse(request.transform(), properties.keyTransforms());
    String value = request.value() == null ? "" : request.value().trim();
    if (value.isEmpty()) {
      throw new InvalidRuleException("value", "must not be blank");
    }

    auditService.recordKeyLookup(authentication, value, transform.code(), window.code());

    String key = transform.apply(value);
    long to = clock.millis();
    long from = to - window.lengthMillis();
    long bucket = window.bucketMillis();

    Map<String, KeyDecision> last = store.lastDecisionByRuleSet(key, from, to);
    List<KeyRuleSetStatus> statuses = new ArrayList<>();
    for (RuleSetActivity activity : store.activityByRuleSet(from, to, key)) {
      KeyDecision decision = last.get(activity.ruleSetId());
      if (decision != null) {
        statuses.add(status(activity, decision, to));
      }
    }
    statuses.sort(Comparator.comparingLong(KeyRuleSetStatus::lastDecisionAt).reversed());

    return new KeyLookupResponse(
        key,
        transform.code(),
        window.code(),
        from,
        to,
        bucket,
        statuses,
        MonitoringService.fill(store.buckets(from, to, bucket, null, key), from, to, bucket),
        store.recentDecisions(key, from, to, RECENT_LIMIT));
  }

  static KeyRuleSetStatus status(RuleSetActivity activity, KeyDecision last, long now) {
    Long blockedUntil = last.allowed() ? null : last.timestamp() + last.retryAfterMs();
    KeyStatus status;
    if (last.allowed()) {
      status = KeyStatus.ALLOWED;
    } else if (now < blockedUntil) {
      status = KeyStatus.BLOCKED;
    } else {
      status = KeyStatus.RECOVERED;
    }
    return new KeyRuleSetStatus(
        activity.ruleSetId(),
        status,
        last.timestamp(),
        last.allowed(),
        last.remainingTokens(),
        blockedUntil,
        activity.total() - activity.rejected(),
        activity.rejected());
  }
}
```

```java
// controller/KeyLookupController.java
package org.fluxgate.studio.admin.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import org.fluxgate.studio.admin.monitoring.KeyLookupRequest;
import org.fluxgate.studio.admin.monitoring.KeyLookupResponse;
import org.fluxgate.studio.admin.monitoring.KeyLookupService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/keys")
@Tag(name = "Key lookup", description = "Decision history of one key, admin only and audited")
public class KeyLookupController {

  private final KeyLookupService keyLookupService;

  public KeyLookupController(KeyLookupService keyLookupService) {
    this.keyLookupService = keyLookupService;
  }

  @GetMapping("/transforms")
  @PreAuthorize(Roles.WRITER)
  @Operation(summary = "Key transforms", description = "How a typed key can be matched")
  public List<String> transforms() {
    return keyLookupService.transforms();
  }

  @PostMapping("/decisions")
  @PreAuthorize(Roles.WRITER)
  @Operation(
      summary = "Look up a key",
      description = "The lookup is recorded in the audit log before any data is read")
  public KeyLookupResponse lookup(
      @Valid @RequestBody KeyLookupRequest request, Authentication authentication) {
    return keyLookupService.lookup(request, authentication);
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `./mvnw -B -ntp $M2 spotless:apply && ./mvnw -B -ntp $M2 test -Dtest='KeyTransformTest,KeyLookupServiceTest,KeyLookupControllerSecurityTest'`
Expected: Tests run: 13, Failures: 0

- [ ] **Step 5: Commit**

```bash
git add fluxgate-studio-admin-api/src
git commit -m "feat(api): add audited key lookup"
```

---

### Task 6: 감사 기록 조회 API와 백엔드 전체 검증

**Files:**
- Create: `.../controller/AuditController.java`
- Test: `.../controller/AuditControllerSecurityTest.java`

**Interfaces:**
- Consumes: `AuditService.search`, `AuditService.find`, `AuditQuery`, `AuditAction`
- Produces: `GET /api/audit?action=&actor=&q=&from=&to=&page=&size=` 응답 `PageResponse<AuditEntry>`, `GET /api/audit/{id}` 응답 `AuditEntry` 또는 404

- [ ] **Step 1: 실패하는 테스트 작성**

```java
// controller/AuditControllerSecurityTest.java
package org.fluxgate.studio.admin.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.fluxgate.studio.admin.audit.AuditAction;
import org.fluxgate.studio.admin.audit.AuditActor;
import org.fluxgate.studio.admin.audit.AuditEntry;
import org.fluxgate.studio.admin.audit.AuditQuery;
import org.fluxgate.studio.admin.audit.AuditService;
import org.fluxgate.studio.admin.config.SecurityConfig;
import org.fluxgate.studio.admin.dto.response.PageResponse;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(controllers = AuditController.class)
@Import(SecurityConfig.class)
@TestPropertySource(
    properties = {
      "spring.security.oauth2.resourceserver.jwt.issuer-uri=http://localhost:18080/realms/fluxgate",
      "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://localhost:18080/realms/fluxgate/protocol/openid-connect/certs",
      "app.security.cors.allowed-origins=http://localhost:3000"
    })
class AuditControllerSecurityTest {
  private static final AuditEntry ENTRY =
      new AuditEntry(
          "abc", Instant.parse("2026-11-14T05:00:00Z"), new AuditActor(null, "alice", "Alice"),
          AuditAction.RULE_UPDATE, Map.of("ruleId", "r1"), Map.of(), Map.of(), null);

  @Autowired private MockMvc mockMvc;
  @MockBean private AuditService auditService;

  @Test
  @WithMockUser(roles = "USER")
  void viewersCannotReadTheAuditLog() throws Exception {
    mockMvc.perform(get("/api/audit")).andExpect(status().isForbidden());
  }

  @Test
  @WithMockUser(roles = "ADMIN")
  void adminsSearchWithFilters() throws Exception {
    when(auditService.search(any())).thenReturn(new PageResponse<>(List.of(ENTRY), 0, 50, 1));

    mockMvc
        .perform(get("/api/audit?action=RULE_UPDATE&actor=alice&q=r1&from=1&to=2"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.content[0].action").value("RULE_UPDATE"))
        .andExpect(jsonPath("$.content[0].at").value("2026-11-14T05:00:00Z"));

    verify(auditService)
        .search(
            new AuditQuery(
                AuditAction.RULE_UPDATE,
                "alice",
                "r1",
                Instant.ofEpochMilli(1),
                Instant.ofEpochMilli(2),
                0,
                50));
  }

  @Test
  @WithMockUser(roles = "ADMIN")
  void unknownActionsAndSizesAreBadRequests() throws Exception {
    mockMvc.perform(get("/api/audit?action=NOPE")).andExpect(status().isBadRequest());
    mockMvc.perform(get("/api/audit?size=500")).andExpect(status().isBadRequest());
    mockMvc.perform(get("/api/audit?page=-1")).andExpect(status().isBadRequest());
  }

  @Test
  @WithMockUser(roles = "ADMIN")
  void readsOneEntryOrAnswersNotFound() throws Exception {
    when(auditService.find("abc")).thenReturn(Optional.of(ENTRY));
    when(auditService.find("missing")).thenReturn(Optional.empty());

    mockMvc.perform(get("/api/audit/abc")).andExpect(status().isOk());
    mockMvc.perform(get("/api/audit/missing")).andExpect(status().isNotFound());
  }
}
```

- [ ] **Step 2: 실패 확인**

Run: `./mvnw -B -ntp $M2 test -Dtest=AuditControllerSecurityTest`
Expected: 컴파일 실패, `AuditController` 없음

- [ ] **Step 3: 구현**

```java
// controller/AuditController.java
package org.fluxgate.studio.admin.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.Instant;
import java.util.Arrays;
import java.util.stream.Collectors;
import org.fluxgate.studio.admin.audit.AuditAction;
import org.fluxgate.studio.admin.audit.AuditEntry;
import org.fluxgate.studio.admin.audit.AuditQuery;
import org.fluxgate.studio.admin.audit.AuditService;
import org.fluxgate.studio.admin.dto.response.PageResponse;
import org.fluxgate.studio.admin.exception.InvalidRuleException;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/audit")
@Tag(name = "Audit", description = "Who changed or looked up what, admin only")
public class AuditController {

  static final int MAX_PAGE_SIZE = 200;

  private final AuditService auditService;

  public AuditController(AuditService auditService) {
    this.auditService = auditService;
  }

  @GetMapping
  @PreAuthorize(Roles.WRITER)
  @Operation(summary = "Search the audit log", description = "Lookup values are masked here")
  public PageResponse<AuditEntry> search(
      @RequestParam(required = false) String action,
      @RequestParam(required = false) String actor,
      @RequestParam(required = false) String q,
      @RequestParam(required = false) Long from,
      @RequestParam(required = false) Long to,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "50") int size) {
    if (page < 0) {
      throw new InvalidRuleException("page", "must be 0 or greater");
    }
    if (size < 1 || size > MAX_PAGE_SIZE) {
      throw new InvalidRuleException("size", "must be between 1 and " + MAX_PAGE_SIZE);
    }
    return auditService.search(
        new AuditQuery(
            parseAction(action),
            blankToNull(actor),
            blankToNull(q),
            from == null ? null : Instant.ofEpochMilli(from),
            to == null ? null : Instant.ofEpochMilli(to),
            page,
            size));
  }

  @GetMapping("/{id}")
  @PreAuthorize(Roles.WRITER)
  @Operation(summary = "One audit entry", description = "Shows the lookup value unmasked")
  public ResponseEntity<AuditEntry> get(@PathVariable String id) {
    return ResponseEntity.of(auditService.find(id));
  }

  private static AuditAction parseAction(String action) {
    if (action == null || action.isBlank()) {
      return null;
    }
    try {
      return AuditAction.valueOf(action);
    } catch (IllegalArgumentException e) {
      throw new InvalidRuleException(
          "action",
          "must be one of: "
              + Arrays.stream(AuditAction.values())
                  .map(Enum::name)
                  .collect(Collectors.joining(", ")));
    }
  }

  private static String blankToNull(String value) {
    return value == null || value.isBlank() ? null : value;
  }
}
```

- [ ] **Step 4: 백엔드 전체 검증**

Run: `./mvnw -B -ntp $M2 spotless:apply && ./mvnw -B -ntp $M2 verify spotless:check`
Expected: BUILD SUCCESS, JaCoCo 기준 통과

- [ ] **Step 5: Commit**

```bash
git add fluxgate-studio-admin-api/src
git commit -m "feat(api): expose the audit log to admins"
```

---

### Task 7: BFF 프록시 허용 경로와 감사 헤더

**Files:**
- Modify: `fluxgate-studio-ui-nextjs/src/app/api/proxy/[...path]/route.ts`
- Test: `fluxgate-studio-ui-nextjs/src/app/api/proxy/[...path]/route.test.ts`

**Interfaces:**
- Produces: 브라우저가 `/api/proxy/api/monitoring/**`, `/api/proxy/api/keys/**`, `/api/proxy/api/audit/**`, `/api/proxy/api/me`를 호출할 수 있고, 응답에 `x-studio-audit` 헤더가 전달된다.

- [ ] **Step 1: 실패하는 테스트 작성** (`route.test.ts`의 `describe('BFF proxy route')` 안에 추가)

```ts
  it.each([
    [['api', 'monitoring', 'overview'], '/api/monitoring/overview'],
    [['api', 'keys', 'decisions'], '/api/keys/decisions'],
    [['api', 'audit'], '/api/audit'],
    [['api', 'me'], '/api/me'],
  ])('forwards the console path %j', async (segments, expected) => {
    const response = await GET(requestFor('GET'), contextFor(segments));

    expect(response.status).toBe(200);
    const [target] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(target.pathname).toBe(expected);
  });

  it('still refuses paths outside the console API', async () => {
    const response = await GET(requestFor('GET'), contextFor(['api', 'rule-sets', 'a', 'active']));

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passes the audit failure header through to the browser', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json', 'x-studio-audit': 'failed' },
      })
    );

    const response = await GET(requestFor('GET'), contextFor(['api', 'rules']));

    expect(response.headers.get('x-studio-audit')).toBe('failed');
  });
```

- [ ] **Step 2: 실패 확인**

Run: `npm run test -- 'src/app/api/proxy/[...path]/route.test.ts'`
Expected: `forwards the console path` 4건과 헤더 테스트 실패

- [ ] **Step 3: 구현** (`route.ts`)

```ts
const ALLOWED_PREFIXES = [
  'api/rules',
  'api/dashboard',
  'api/monitoring',
  'api/keys',
  'api/audit',
  'api/me',
];
```

```ts
const FORWARDED_RESPONSE_HEADERS = ['content-type', 'etag', 'content-disposition', 'x-studio-audit'];
```

- [ ] **Step 4: 통과 확인**

Run: `npm run test -- 'src/app/api/proxy/[...path]/route.test.ts'`
Expected: 전부 통과

- [ ] **Step 5: Commit**

```bash
git add fluxgate-studio-ui-nextjs/src/app/api/proxy
git commit -m "feat(ui): let the proxy reach the console API"
```

---

### Task 8: 번역, 한도 문장, 표기 함수, API 호출

**Files:**
- Create: `fluxgate-studio-ui-nextjs/src/lib/i18n.ts`, `src/lib/ruleMeaning.ts`, `src/lib/format.ts`, `src/lib/ruleDiff.ts`
- Modify: `src/lib/api.ts`
- Test: `src/lib/i18n.test.ts`, `src/lib/ruleMeaning.test.ts`, `src/lib/format.test.ts`, `src/lib/ruleDiff.test.ts`, `src/lib/api.test.ts`

**Interfaces:**
- Produces:
  - `type Locale = 'en' | 'ko'`, `type MessageKey`, `translate(locale, key, vars?)`, `defaultLocale()`, `messages`
  - `describeBand(band, locale)`, `formatPeriod(seconds, locale)`, `formatLimit(band)`
  - `formatAgo(ts, now, locale)`, `formatPercent(rate)`, `formatCount(n)`, `formatClock(ts)`, `formatDateTime(ts)`
  - `diffRules(before: Rule | null, after: Partial<Rule>): FieldChange[]`, `interface FieldChange { field: string; before: string; after: string }`
  - api: 타입 `ApiMe`, `ApiBucket`, `ApiRuleSetSummary`, `ApiOverview`, `ApiTimeseries`, `ApiRejectedKey`, `ApiKeyDecision`, `ApiKeyStatus`, `ApiKeyLookup`, `ApiAuditEntry`, 상수 `AUDIT_FAILED_EVENT`, 함수 `fetchMe`, `fetchOverview`, `fetchTimeseries`, `fetchTopRejected`, `fetchKeyTransforms`, `lookupKey`, `fetchAudit`, `fetchAuditEntry`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/lib/ruleMeaning.test.ts
import { describe, expect, it } from 'vitest';

import { describeBand, formatLimit, formatPeriod } from './ruleMeaning';

describe('rule meaning', () => {
  it('describes a whole second refill period', () => {
    expect(describeBand({ windowSeconds: 60, capacity: 30 }, 'ko')).toBe(
      '처음 30회 연속, 이후 2초마다 1회'
    );
    expect(describeBand({ windowSeconds: 60, capacity: 30 }, 'en')).toBe(
      '30 at once, then 1 every 2s'
    );
  });

  it('switches to minutes and hours on exact multiples', () => {
    expect(formatPeriod(120, 'ko')).toBe('2분');
    expect(formatPeriod(3600, 'ko')).toBe('1시간');
    expect(describeBand({ windowSeconds: 600, capacity: 5 }, 'ko')).toBe(
      '처음 5회 연속, 이후 2분마다 1회'
    );
  });

  it('rounds fractional periods and says so', () => {
    expect(describeBand({ windowSeconds: 60, capacity: 7 }, 'ko')).toBe(
      '처음 7회 연속, 이후 약 8.6초마다 1회'
    );
    expect(formatPeriod(8.57, 'en')).toBe('about 8.6s');
  });

  it('returns nothing for an incomplete band', () => {
    expect(describeBand({ windowSeconds: 0, capacity: 5 }, 'en')).toBe('');
    expect(describeBand({ windowSeconds: 60, capacity: 0 }, 'en')).toBe('');
  });

  it('formats the compact limit', () => {
    expect(formatLimit({ windowSeconds: 600, capacity: 5 })).toBe('600s·5');
  });
});
```

```ts
// src/lib/i18n.test.ts
import { describe, expect, it } from 'vitest';

import { en, ko, translate } from './i18n';

describe('translate', () => {
  it('fills placeholders', () => {
    expect(translate('en', 'keys.counts', { allowed: 3, rejected: 1 })).toBe(
      'Allowed 3 · Rejected 1'
    );
  });

  it('leaves unknown placeholders visible', () => {
    expect(translate('en', 'keys.counts')).toBe('Allowed {allowed} · Rejected {rejected}');
  });

  it('has a Korean entry for every English key', () => {
    expect(Object.keys(ko).sort()).toEqual(Object.keys(en).sort());
  });
});
```

```ts
// src/lib/format.test.ts
import { describe, expect, it } from 'vitest';

import { formatAgo, formatCount, formatPercent } from './format';

describe('format', () => {
  const now = 1_794_600_000_000;

  it('formats elapsed time in the largest whole unit', () => {
    expect(formatAgo(now - 3_000, now, 'en')).toBe('3s ago');
    expect(formatAgo(now - 120_000, now, 'ko')).toBe('2분 전');
    expect(formatAgo(now - 7_200_000, now, 'en')).toBe('2h ago');
    expect(formatAgo(now - 172_800_000, now, 'en')).toBe('2d ago');
    expect(formatAgo(now + 5_000, now, 'en')).toBe('0s ago');
  });

  it('formats rates and counts', () => {
    expect(formatPercent(0.029)).toBe('2.9%');
    expect(formatPercent(0)).toBe('0.0%');
    expect(formatCount(61634)).toBe('61,634');
  });
});
```

```ts
// src/lib/ruleDiff.test.ts
import { describe, expect, it } from 'vitest';

import { type Rule } from '@/modules/admin/types';

import { diffRules } from './ruleDiff';

const rule: Rule = {
  id: 'r1',
  name: 'Rule',
  enabled: true,
  scope: 'PER_USER',
  keyStrategyId: 'userId',
  onLimitExceedPolicy: 'REJECT_REQUEST',
  bands: [{ windowSeconds: 60, capacity: 30, label: '' }],
  ruleSetId: 'set',
  tags: ['a'],
  attributes: {},
  version: 1,
};

describe('diffRules', () => {
  it('lists only the fields that change', () => {
    expect(
      diffRules(rule, { ...rule, bands: [{ windowSeconds: 60, capacity: 20, label: '' }] })
    ).toEqual([{ field: 'bands', before: '60s·30', after: '60s·20' }]);
  });

  it('treats a new rule as a change from nothing', () => {
    const changes = diffRules(null, rule);
    expect(changes.find((change) => change.field === 'name')).toEqual({
      field: 'name',
      before: '',
      after: 'Rule',
    });
  });

  it('returns nothing when the edit is a no op', () => {
    expect(diffRules(rule, { ...rule })).toEqual([]);
  });
});
```

`src/lib/api.test.ts` 끝에 추가:

```ts
describe('console API', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('announces an audit failure the Admin API reports', async () => {
    const target = new EventTarget();
    const listener = vi.fn();
    target.addEventListener(AUDIT_FAILED_EVENT, listener);
    vi.stubGlobal('window', target);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('{"id":"r1"}', {
          status: 200,
          headers: { 'content-type': 'application/json', 'x-studio-audit': 'failed' },
        })
      )
    );

    await toggleRule('r1', 'set');

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('sends key lookups in the request body, never in the URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"key":"u1"}', { status: 200, headers: { 'content-type': 'application/json' } })
    );
    vi.stubGlobal('fetch', fetchMock);

    await lookupKey({ value: '123456789', transform: 'none', window: '24h' });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/proxy/api/keys/decisions');
    expect(url).not.toContain('123456789');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      value: '123456789',
      transform: 'none',
      window: '24h',
    });
  });

  it('builds monitoring query strings', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })
    );
    vi.stubGlobal('fetch', fetchMock);

    await fetchTopRejected('24h', 5, 'checkout api');
    await fetchAudit({ action: 'RULE_UPDATE', q: 'r1', page: 2, size: 50 });

    expect(fetchMock.mock.calls[0][0]).toBe(
      '/api/proxy/api/monitoring/top-rejected?window=24h&limit=5&ruleSetId=checkout+api'
    );
    expect(fetchMock.mock.calls[1][0]).toBe(
      '/api/proxy/api/audit?page=2&size=50&action=RULE_UPDATE&q=r1'
    );
  });
});
```

같은 파일의 import에 `AUDIT_FAILED_EVENT`, `fetchAudit`, `fetchTopRejected`, `lookupKey`, `toggleRule`을 추가한다.

- [ ] **Step 2: 실패 확인**

Run: `npm run test -- src/lib`
Expected: 모듈 없음으로 실패

- [ ] **Step 3: 구현**

```ts
// src/lib/i18n.ts
export type Locale = 'en' | 'ko';

export const en = {
  'nav.overview': 'Overview',
  'nav.rules': 'Rules',
  'nav.keys': 'Key lookup',
  'nav.audit': 'Audit log',
  'role.admin': 'admin',
  'role.viewer': 'viewer',
  'common.signOut': 'Sign out',
  'common.updated': 'Updated {ago}',
  'common.refreshFailed': 'Refresh failed. Showing data from {time}.',
  'common.loading': 'Loading…',
  'common.forbidden': 'You do not have permission to view this page.',
  'common.cancel': 'Cancel',
  'common.close': 'Close',
  'common.previous': 'Previous',
  'common.next': 'Next',
  'common.auditFailed': 'The change was saved, but its audit record failed. Check the Admin API log.',
  'common.dismiss': 'Dismiss',
  'common.page': 'Page {page} of {pages}',
  'mode.system': 'System theme',
  'mode.light': 'Light',
  'mode.dark': 'Dark',
  'window.5m': '5 min',
  'window.1h': '1 hour',
  'window.24h': '24 hours',
  'window.7d': '7 days',
  'overview.title': 'Overview',
  'overview.decisions': 'Decisions',
  'overview.rejected': 'Rejected',
  'overview.rejectRate': 'Reject rate',
  'overview.activeRules': 'Active rules',
  'overview.ruleSets': 'Rule sets',
  'overview.trend': 'Allowed and rejected',
  'overview.topRejected': 'Most rejected keys',
  'overview.noEvents':
    'No decision history yet. Check that your services write to the event collection.',
  'overview.external': 'External dashboard',
  'overview.never': 'none in 24h',
  'col.ruleSet': 'Rule set',
  'col.trend': 'Trend',
  'col.decisions': 'Decisions',
  'col.rejectRate': 'Reject rate',
  'col.lastDecision': 'Last decision',
  'col.key': 'Key',
  'col.rejected': 'Rejected',
  'col.lastRejected': 'Last rejected',
  'col.rule': 'Rule',
  'col.scope': 'Target',
  'col.limit': 'Limit',
  'col.meaning': 'What it means',
  'col.enabled': 'On',
  'col.time': 'Time',
  'col.request': 'Request',
  'col.decision': 'Decision',
  'col.remaining': 'Tokens left',
  'col.retryAfter': 'Allowed again in',
  'col.user': 'User',
  'col.action': 'Action',
  'col.target': 'Target',
  'col.change': 'Change',
  'rules.title': 'Rules',
  'rules.search': 'Search rule sets, rules or tags',
  'rules.new': 'New rule',
  'rules.import': 'Import',
  'rules.export': 'Export',
  'rules.edit': 'Edit',
  'rules.simulate': 'Simulate',
  'rules.delete': 'Delete',
  'rules.deleteConfirm': 'Delete rule {id}?',
  'rules.importConfirm': 'Import {count} rules from {file}? Rules with the same id are overwritten.',
  'rules.imported': 'Imported {total} rules, {created} created and {updated} updated.',
  'rules.importInvalid': 'The file does not contain a rule array.',
  'rules.importNotJson': 'The file is not valid JSON.',
  'rules.readOnly': 'Read only',
  'rules.unassigned': 'No rule set',
  'rules.rejected24h': '{count} rejected in 24h',
  'rules.confirmTitle': 'Review the change',
  'rules.confirmNew': 'New rule {id}',
  'rules.confirmWarning':
    'Saving resets the counts in progress in every service that uses this rule set.',
  'rules.confirmSave': 'Save',
  'rules.conflict': 'Someone else changed this rule first. Reload and edit again.',
  'rules.empty': 'No rules match.',
  'keys.title': 'Key lookup',
  'keys.transform': 'Match as',
  'keys.value': 'Key value',
  'keys.placeholder': 'Member id, cguid …',
  'keys.lookup': 'Look up',
  'keys.basis': 'Based on the last recorded decision',
  'keys.status.ALLOWED': 'Allowed',
  'keys.status.BLOCKED': 'Blocked',
  'keys.status.RECOVERED': 'Recovered',
  'keys.blockedUntil': 'Expected release {time}',
  'keys.releasedAt': 'Released at {time}',
  'keys.remaining': '{count} tokens left',
  'keys.counts': 'Allowed {allowed} · Rejected {rejected}',
  'keys.timeline': 'Decisions over time',
  'keys.recent': 'Recent decisions',
  'keys.noResult': 'No decisions for this key in the selected window.',
  'keys.audited': 'Every lookup is recorded in the audit log.',
  'keys.transform.none': 'As typed',
  'keys.transform.sha256': 'SHA-256 hash',
  'audit.title': 'Audit log',
  'audit.allActions': 'All actions',
  'audit.actor': 'User name',
  'audit.search': 'Search rule set or rule',
  'audit.detail': 'Detail',
  'audit.lookupOf': 'Looked up {value}',
  'action.RULE_CREATE': 'Rule created',
  'action.RULE_UPDATE': 'Rule updated',
  'action.RULE_TOGGLE': 'Rule toggled',
  'action.RULE_DELETE': 'Rule deleted',
  'action.RULES_DELETE_ALL': 'Rule set deleted',
  'action.RULES_IMPORT': 'Rules imported',
  'action.POLICY_PUBLISH': 'Policy published',
  'action.POLICY_ROLLBACK': 'Policy rolled back',
  'action.KEY_LOOKUP': 'Key lookup',
  'decision.allowed': 'Allowed',
  'decision.rejected': 'Rejected',
  'meaning.burst': '{capacity} at once, then 1 every {period}',
  'meaning.about': 'about {value}',
  'unit.second': '{n}s',
  'unit.minute': '{n} min',
  'unit.hour': '{n} h',
  'ago.seconds': '{n}s ago',
  'ago.minutes': '{n}m ago',
  'ago.hours': '{n}h ago',
  'ago.days': '{n}d ago',
} as const;

export type MessageKey = keyof typeof en;

export const ko: Record<MessageKey, string> = {
  'nav.overview': '개요',
  'nav.rules': '규칙',
  'nav.keys': '키 조회',
  'nav.audit': '변경 기록',
  'role.admin': 'admin',
  'role.viewer': 'viewer',
  'common.signOut': '로그아웃',
  'common.updated': '{ago} 갱신',
  'common.refreshFailed': '갱신 실패. {time} 데이터를 보여 줍니다.',
  'common.loading': '불러오는 중…',
  'common.forbidden': '이 화면을 볼 권한이 없습니다.',
  'common.cancel': '취소',
  'common.close': '닫기',
  'common.previous': '이전',
  'common.next': '다음',
  'common.auditFailed': '변경은 저장됐지만 감사 기록에 실패했습니다. Admin API 로그를 확인하세요.',
  'common.dismiss': '닫기',
  'common.page': '{page} / {pages} 쪽',
  'mode.system': '시스템 테마',
  'mode.light': '라이트',
  'mode.dark': '다크',
  'window.5m': '5분',
  'window.1h': '1시간',
  'window.24h': '24시간',
  'window.7d': '7일',
  'overview.title': '개요',
  'overview.decisions': '판정',
  'overview.rejected': '차단',
  'overview.rejectRate': '차단율',
  'overview.activeRules': '활성 규칙',
  'overview.ruleSets': '규칙 묶음',
  'overview.trend': '허용·차단 추이',
  'overview.topRejected': '많이 차단된 키',
  'overview.noEvents': '판정 이력이 없습니다. 서비스가 이벤트 컬렉션에 기록하는지 확인하세요.',
  'overview.external': '외부 대시보드',
  'overview.never': '24시간 내 없음',
  'col.ruleSet': '규칙 묶음',
  'col.trend': '추이',
  'col.decisions': '판정',
  'col.rejectRate': '차단율',
  'col.lastDecision': '마지막 판정',
  'col.key': '키',
  'col.rejected': '차단',
  'col.lastRejected': '마지막 차단',
  'col.rule': '규칙',
  'col.scope': '대상',
  'col.limit': '한도',
  'col.meaning': '실제 의미',
  'col.enabled': '켜짐',
  'col.time': '시각',
  'col.request': '요청',
  'col.decision': '판정',
  'col.remaining': '남은 토큰',
  'col.retryAfter': '다시 허용까지',
  'col.user': '사용자',
  'col.action': '동작',
  'col.target': '대상',
  'col.change': '내용',
  'rules.title': '규칙',
  'rules.search': '규칙 묶음, 규칙 ID, 태그 검색',
  'rules.new': '새 규칙',
  'rules.import': '가져오기',
  'rules.export': '내보내기',
  'rules.edit': '수정',
  'rules.simulate': '시뮬레이션',
  'rules.delete': '삭제',
  'rules.deleteConfirm': '{id} 규칙을 삭제할까요?',
  'rules.importConfirm': '{file}에서 규칙 {count}개를 가져올까요? 같은 ID의 규칙은 덮어씁니다.',
  'rules.imported': '규칙 {total}개를 가져왔습니다. 새로 만든 것 {created}개, 바꾼 것 {updated}개.',
  'rules.importInvalid': '파일에 규칙 배열이 없습니다.',
  'rules.importNotJson': '파일이 올바른 JSON이 아닙니다.',
  'rules.readOnly': '읽기 전용',
  'rules.unassigned': '묶음 없음',
  'rules.rejected24h': '24시간 차단 {count}',
  'rules.confirmTitle': '변경 내용 확인',
  'rules.confirmNew': '새 규칙 {id}',
  'rules.confirmWarning':
    '저장하면 이 규칙 묶음을 쓰는 서비스에서 진행 중인 횟수가 모두 초기화됩니다.',
  'rules.confirmSave': '저장',
  'rules.conflict': '다른 사람이 먼저 바꿨습니다. 새로 불러온 뒤 다시 수정하세요.',
  'rules.empty': '조건에 맞는 규칙이 없습니다.',
  'keys.title': '키 조회',
  'keys.transform': '조회 방식',
  'keys.value': '키 값',
  'keys.placeholder': '회원번호, cguid …',
  'keys.lookup': '조회',
  'keys.basis': '마지막 판정 기준',
  'keys.status.ALLOWED': '허용',
  'keys.status.BLOCKED': '차단 중',
  'keys.status.RECOVERED': '해제됨',
  'keys.blockedUntil': '{time} 해제 예상',
  'keys.releasedAt': '{time} 해제',
  'keys.remaining': '남은 토큰 {count}',
  'keys.counts': '허용 {allowed} · 차단 {rejected}',
  'keys.timeline': '시간대별 판정',
  'keys.recent': '최근 판정',
  'keys.noResult': '선택한 기간에 이 키의 판정이 없습니다.',
  'keys.audited': '조회 내역은 변경 기록에 남습니다.',
  'keys.transform.none': '입력값 그대로',
  'keys.transform.sha256': 'SHA-256 해시',
  'audit.title': '변경 기록',
  'audit.allActions': '전체 동작',
  'audit.actor': '사용자 이름',
  'audit.search': '규칙 묶음, 규칙 검색',
  'audit.detail': '상세',
  'audit.lookupOf': '{value} 조회',
  'action.RULE_CREATE': '규칙 생성',
  'action.RULE_UPDATE': '규칙 수정',
  'action.RULE_TOGGLE': '규칙 켜기·끄기',
  'action.RULE_DELETE': '규칙 삭제',
  'action.RULES_DELETE_ALL': '규칙 묶음 삭제',
  'action.RULES_IMPORT': '규칙 가져오기',
  'action.POLICY_PUBLISH': '정책 게시',
  'action.POLICY_ROLLBACK': '정책 롤백',
  'action.KEY_LOOKUP': '키 조회',
  'decision.allowed': '허용',
  'decision.rejected': '차단',
  'meaning.burst': '처음 {capacity}회 연속, 이후 {period}마다 1회',
  'meaning.about': '약 {value}',
  'unit.second': '{n}초',
  'unit.minute': '{n}분',
  'unit.hour': '{n}시간',
  'ago.seconds': '{n}초 전',
  'ago.minutes': '{n}분 전',
  'ago.hours': '{n}시간 전',
  'ago.days': '{n}일 전',
};

export const messages: Record<Locale, Record<MessageKey, string>> = { en, ko };

export function translate(
  locale: Locale,
  key: MessageKey,
  vars?: Record<string, string | number>
): string {
  const template = messages[locale][key] ?? key;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    vars && name in vars ? String(vars[name]) : match
  );
}

export function defaultLocale(): Locale {
  return process.env.NEXT_PUBLIC_DEFAULT_LOCALE === 'ko' ? 'ko' : 'en';
}
```

```ts
// src/lib/ruleMeaning.ts
import { type Locale, translate } from './i18n';

interface BandLike {
  windowSeconds: number;
  capacity: number;
}

export function formatPeriod(seconds: number, locale: Locale): string {
  if (Number.isInteger(seconds)) {
    if (seconds >= 3600 && seconds % 3600 === 0) {
      return translate(locale, 'unit.hour', { n: seconds / 3600 });
    }
    if (seconds >= 60 && seconds % 60 === 0) {
      return translate(locale, 'unit.minute', { n: seconds / 60 });
    }
    return translate(locale, 'unit.second', { n: seconds });
  }
  return translate(locale, 'meaning.about', {
    value: translate(locale, 'unit.second', { n: seconds.toFixed(1) }),
  });
}

export function describeBand(band: BandLike, locale: Locale): string {
  if (!(band.capacity > 0) || !(band.windowSeconds > 0)) {
    return '';
  }
  return translate(locale, 'meaning.burst', {
    capacity: band.capacity,
    period: formatPeriod(band.windowSeconds / band.capacity, locale),
  });
}

export function formatLimit(band: BandLike): string {
  return `${band.windowSeconds}s·${band.capacity}`;
}
```

```ts
// src/lib/format.ts
import { type Locale, translate } from './i18n';

export function formatAgo(timestamp: number, now: number, locale: Locale): string {
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 60) return translate(locale, 'ago.seconds', { n: seconds });
  if (seconds < 3600) return translate(locale, 'ago.minutes', { n: Math.floor(seconds / 60) });
  if (seconds < 86400) return translate(locale, 'ago.hours', { n: Math.floor(seconds / 3600) });
  return translate(locale, 'ago.days', { n: Math.floor(seconds / 86400) });
}

export function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

export function formatCount(value: number): string {
  return value.toLocaleString('en-US');
}

const pad = (value: number) => String(value).padStart(2, '0');

export function formatClock(timestamp: number): string {
  const date = new Date(timestamp);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
```

```ts
// src/lib/ruleDiff.ts
import { type Rule } from '@/modules/admin/types';

import { formatLimit } from './ruleMeaning';

export interface FieldChange {
  field: string;
  before: string;
  after: string;
}

const FIELDS = [
  'name',
  'enabled',
  'scope',
  'keyStrategyId',
  'onLimitExceedPolicy',
  'bands',
  'ruleSetId',
  'tags',
] as const;

function show(field: (typeof FIELDS)[number], rule: Partial<Rule> | null): string {
  const value = rule?.[field];
  if (value === undefined || value === null) return '';
  if (field === 'bands') return (value as Rule['bands']).map(formatLimit).join(' / ');
  if (field === 'tags') return (value as string[]).join(', ');
  return String(value);
}

export function diffRules(before: Rule | null, after: Partial<Rule>): FieldChange[] {
  return FIELDS.map((field) => ({
    field,
    before: show(field, before),
    after: show(field, after),
  })).filter((change) => change.before !== change.after);
}
```

`src/lib/api.ts`에 추가한다. `handleResponse`의 맨 앞에 `notifyAuditFailure(response);`를 넣는다.

```ts
export const AUDIT_FAILED_EVENT = 'studio:audit-failed';

function notifyAuditFailure(response: Response): void {
  if (response.headers.get('x-studio-audit') === 'failed' && typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUDIT_FAILED_EVENT));
  }
}

export interface ApiMe {
  username: string;
  name: string;
  roles: string[];
  canWrite: boolean;
}

export interface ApiBucket {
  start: number;
  allowed: number;
  rejected: number;
}

export interface ApiRuleSetSummary {
  ruleSetId: string;
  total: number;
  rejected: number;
  rejectRate: number;
  lastDecisionAt: number | null;
  trend: number[];
}

export interface ApiOverview {
  window: string;
  from: number;
  to: number;
  total: number;
  rejected: number;
  rejectRate: number;
  ruleSets: ApiRuleSetSummary[];
}

export interface ApiTimeseries {
  window: string;
  from: number;
  to: number;
  bucketMillis: number;
  buckets: ApiBucket[];
}

export interface ApiRejectedKey {
  ruleSetId: string;
  key: string;
  masked: boolean;
  rejected: number;
  lastRejectedAt: number;
}

export interface ApiKeyDecision {
  timestamp: number;
  ruleSetId: string | null;
  ruleId: string | null;
  endpoint: string | null;
  method: string | null;
  allowed: boolean;
  remainingTokens: number;
  retryAfterMs: number;
}

export type ApiKeyStatusName = 'ALLOWED' | 'BLOCKED' | 'RECOVERED';

export interface ApiKeyStatus {
  ruleSetId: string | null;
  status: ApiKeyStatusName;
  lastDecisionAt: number;
  lastAllowed: boolean;
  remainingTokens: number;
  blockedUntil: number | null;
  allowed: number;
  rejected: number;
}

export interface ApiKeyLookup {
  key: string;
  transform: string;
  window: string;
  from: number;
  to: number;
  bucketMillis: number;
  ruleSets: ApiKeyStatus[];
  buckets: ApiBucket[];
  recent: ApiKeyDecision[];
}

export interface ApiAuditEntry {
  id: string;
  at: string;
  actor: { subject: string | null; username: string; name: string };
  action: string;
  target: Record<string, unknown> | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  detail: Record<string, unknown> | null;
}

export interface AuditSearch {
  action?: string;
  actor?: string;
  q?: string;
  page: number;
  size: number;
}

export async function fetchMe(): Promise<ApiMe> {
  return handleResponse<ApiMe>(await fetch(`${API_BASE_PATH}/api/me`));
}

export async function fetchOverview(range: string): Promise<ApiOverview> {
  const params = new URLSearchParams({ window: range });
  return handleResponse<ApiOverview>(
    await fetch(`${API_BASE_PATH}/api/monitoring/overview?${params.toString()}`)
  );
}

export async function fetchTimeseries(range: string, ruleSetId?: string): Promise<ApiTimeseries> {
  const params = new URLSearchParams({ window: range });
  if (ruleSetId) params.set('ruleSetId', ruleSetId);
  return handleResponse<ApiTimeseries>(
    await fetch(`${API_BASE_PATH}/api/monitoring/timeseries?${params.toString()}`)
  );
}

export async function fetchTopRejected(
  range: string,
  limit = 20,
  ruleSetId?: string
): Promise<ApiRejectedKey[]> {
  const params = new URLSearchParams({ window: range, limit: String(limit) });
  if (ruleSetId) params.set('ruleSetId', ruleSetId);
  return handleResponse<ApiRejectedKey[]>(
    await fetch(`${API_BASE_PATH}/api/monitoring/top-rejected?${params.toString()}`)
  );
}

export async function fetchKeyTransforms(): Promise<string[]> {
  return handleResponse<string[]>(await fetch(`${API_BASE_PATH}/api/keys/transforms`));
}

export async function lookupKey(request: {
  value: string;
  transform: string;
  window: string;
}): Promise<ApiKeyLookup> {
  return handleResponse<ApiKeyLookup>(
    await fetch(`${API_BASE_PATH}/api/keys/decisions`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(request),
    })
  );
}

export async function fetchAudit(search: AuditSearch): Promise<ApiPage<ApiAuditEntry>> {
  const params = new URLSearchParams({ page: String(search.page), size: String(search.size) });
  if (search.action) params.set('action', search.action);
  if (search.actor) params.set('actor', search.actor);
  if (search.q) params.set('q', search.q);
  return handleResponse<ApiPage<ApiAuditEntry>>(
    await fetch(`${API_BASE_PATH}/api/audit?${params.toString()}`)
  );
}

export async function fetchAuditEntry(id: string): Promise<ApiAuditEntry> {
  return handleResponse<ApiAuditEntry>(
    await fetch(`${API_BASE_PATH}/api/audit/${encodeURIComponent(id)}`)
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm run test -- src/lib && npm run typecheck`
Expected: 전부 통과

- [ ] **Step 5: Commit**

```bash
git add fluxgate-studio-ui-nextjs/src/lib
git commit -m "feat(ui): add translations, rule meaning text and console API calls"
```

---

### Task 9: 색 체계, 콘솔 공통 컴포넌트, 경로

**Files:**
- Modify: `src/app/globals.css`, `src/modules/admin/data/themes.ts`, `src/modules/admin/contexts/ThemeContext.tsx`, `src/modules/admin/index.ts`, `src/modules/admin/components/index.ts`, `src/app/page.tsx`, `src/app/layout.tsx`, `package.json`
- Delete: `src/modules/admin/AdminDashboard.tsx`, `src/modules/admin/components/RuleCard.tsx`, `src/modules/admin/components/StatCard.tsx`, `src/modules/admin/components/ThemeSwitcher.tsx`
- Create: `src/modules/console/I18nProvider.tsx`, `MeProvider.tsx`, `useLive.ts`, `Shell.tsx`, `ui.tsx`, `charts.tsx`
- Create: `src/app/(console)/layout.tsx`, `src/app/(console)/overview/page.tsx`, `src/app/(console)/rules/page.tsx`, `src/app/(console)/keys/page.tsx`, `src/app/(console)/audit/page.tsx`
- Create, 이 Task에서는 빈 화면: `src/modules/console/screens/OverviewScreen.tsx`, `RulesScreen.tsx`, `KeysScreen.tsx`, `AuditScreen.tsx`

**Interfaces:**
- Consumes: Task 8의 `translate`, `defaultLocale`, `fetchMe`, `AUDIT_FAILED_EVENT`
- Produces:
  - 색 클래스: `bg-bg`, `bg-panel`, `bg-panel2`, `border-line`, `border-line-strong`, `text-fg`, `text-fg2`, `text-muted`, `text-faint`, `text-bad`, `bg-bad`, `bg-bad-soft`, `text-ok`, `bg-ok-soft`, `text-warn`, `bg-warn-soft`, `border-warn-line`, `bg-bar`, `bg-select`, 숫자용 `num`
  - `useTheme(): { theme: Theme; mode: ColorMode; setMode(mode) }`, `type ColorMode = 'system' | 'light' | 'dark'`
  - `useI18n(): { locale: Locale; setLocale(locale): void; t(key, vars?): string }`
  - `useMe(): { me?: ApiMe; isAdmin: boolean; loading: boolean }`
  - `useLive<T>(key: string | null, fetcher: () => Promise<T>)`: `{ data, error, isLoading, updatedAt, mutate }`
  - `useNow(intervalMs = 1000): number`
  - ui: `Panel`, `PageHeader`, `StatTile`, `WindowPicker`, `LiveStatus`, `Forbidden`, `Notice`, 표 클래스 `TH`, `TD`
  - charts: `StackedBars({ buckets, height, describe })`, `Sparkline({ values })`

- [ ] **Step 1: 의존성 추가**

Run: `npm install swr@^2.5.1`
Expected: `package.json` dependencies에 `"swr": "^2.5.1"`

- [ ] **Step 2: 색 체계와 테마**

```css
/* src/app/globals.css */
@import 'tailwindcss';

:root {
  --c-bg: #fafafa;
  --c-panel: #ffffff;
  --c-panel2: #f4f4f5;
  --c-line: #e4e4e7;
  --c-line-strong: #d4d4d8;
  --c-fg: #18181b;
  --c-fg2: #3f3f46;
  --c-muted: #71717a;
  --c-faint: #a1a1aa;
  --c-bad: #dc2626;
  --c-bad-soft: #fef2f2;
  --c-ok: #16a34a;
  --c-ok-soft: #f0fdf4;
  --c-warn: #92400e;
  --c-warn-soft: #fffbeb;
  --c-warn-line: #fcd34d;
  --c-bar: #a1a1aa;
  --c-select: #eff6ff;
  color-scheme: light;
}

:root[data-theme='dark'] {
  --c-bg: #09090b;
  --c-panel: #18181b;
  --c-panel2: #111113;
  --c-line: #27272a;
  --c-line-strong: #3f3f46;
  --c-fg: #fafafa;
  --c-fg2: #d4d4d8;
  --c-muted: #a1a1aa;
  --c-faint: #71717a;
  --c-bad: #f87171;
  --c-bad-soft: #3f1212;
  --c-ok: #4ade80;
  --c-ok-soft: #0f2a1a;
  --c-warn: #fcd34d;
  --c-warn-soft: #2a1f08;
  --c-warn-line: #a16207;
  --c-bar: #52525b;
  --c-select: #172036;
  color-scheme: dark;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    --c-bg: #09090b;
    --c-panel: #18181b;
    --c-panel2: #111113;
    --c-line: #27272a;
    --c-line-strong: #3f3f46;
    --c-fg: #fafafa;
    --c-fg2: #d4d4d8;
    --c-muted: #a1a1aa;
    --c-faint: #71717a;
    --c-bad: #f87171;
    --c-bad-soft: #3f1212;
    --c-ok: #4ade80;
    --c-ok-soft: #0f2a1a;
    --c-warn: #fcd34d;
    --c-warn-soft: #2a1f08;
    --c-warn-line: #a16207;
    --c-bar: #52525b;
    --c-select: #172036;
    color-scheme: dark;
  }
}

@theme inline {
  --color-bg: var(--c-bg);
  --color-panel: var(--c-panel);
  --color-panel2: var(--c-panel2);
  --color-line: var(--c-line);
  --color-line-strong: var(--c-line-strong);
  --color-fg: var(--c-fg);
  --color-fg2: var(--c-fg2);
  --color-muted: var(--c-muted);
  --color-faint: var(--c-faint);
  --color-bad: var(--c-bad);
  --color-bad-soft: var(--c-bad-soft);
  --color-ok: var(--c-ok);
  --color-ok-soft: var(--c-ok-soft);
  --color-warn: var(--c-warn);
  --color-warn-soft: var(--c-warn-soft);
  --color-warn-line: var(--c-warn-line);
  --color-bar: var(--c-bar);
  --color-select: var(--c-select);
}

body {
  background: var(--c-bg);
  color: var(--c-fg);
  font-family:
    system-ui,
    -apple-system,
    'Apple SD Gothic Neo',
    'Segoe UI',
    Roboto,
    sans-serif;
  font-size: 13px;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.num {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-variant-numeric: tabular-nums;
}

::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-thumb {
  background: var(--c-line-strong);
  border-radius: 4px;
}
```

```ts
// src/modules/admin/data/themes.ts
import { type Theme } from '../types';

/** One theme whose classes resolve to CSS variables, so light and dark need no second copy. */
export const consoleTheme: Theme = {
  name: 'Console',
  colors: {
    bg: 'bg-bg',
    bgSecondary: 'bg-panel',
    bgTertiary: 'bg-panel2',
    bgCard: 'bg-panel',
    bgCardHover: 'hover:bg-panel2',
    bgInput: 'bg-panel',
    bgOverlay: 'bg-black/40',
    bgGlow: 'bg-transparent',
    border: 'border-line-strong',
    borderHover: 'hover:border-fg2',
    borderFocus: 'focus:border-fg',
    borderSubtle: 'border-line',
    textPrimary: 'text-fg',
    textSecondary: 'text-fg2',
    textTertiary: 'text-muted',
    textMuted: 'text-faint',
    textInverse: 'text-panel',
    accent: 'text-fg',
    accentBg: 'bg-fg',
    accentBgLight: 'bg-panel2',
    accentBorder: 'border-line-strong',
    success: 'text-ok',
    successBg: 'bg-ok-soft',
    successBorder: 'border-ok',
    warning: 'text-warn',
    warningBg: 'bg-warn-soft',
    warningBorder: 'border-warn-line',
    danger: 'text-bad',
    dangerBg: 'bg-bad-soft',
    dangerBorder: 'border-bad',
    info: 'text-fg2',
    infoBg: 'bg-panel2',
    infoBorder: 'border-line',
    shadow: 'shadow-xl',
    shadowCard: 'shadow-sm',
    shadowAccent: 'shadow-none',
    gradientPrimary: 'from-fg to-fg',
    gradientCard: 'from-panel to-panel',
    gradientGlow: 'from-panel2 to-panel2',
  },
};
```

```tsx
// src/modules/admin/contexts/ThemeContext.tsx
'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { consoleTheme } from '../data/themes';
import { type Theme } from '../types';

export type ColorMode = 'system' | 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  mode: ColorMode;
  setMode: (mode: ColorMode) => void;
}

const STORAGE_KEY = 'studio-color-mode';

const ThemeContext = createContext<ThemeContextValue | null>(null);

function storedMode(): ColorMode {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [mode, setModeState] = useState<ColorMode>('system');

  useEffect(() => {
    setModeState(storedMode());
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (mode === 'system') delete root.dataset.theme;
    else root.dataset.theme = mode;
  }, [mode]);

  const setMode = useCallback((next: ColorMode) => {
    setModeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage can be blocked, the choice then lasts for this page only.
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ theme: consoleTheme, mode, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextValue => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
```

`src/modules/admin/types/index.ts`에 `ThemeContextValue`가 있으면 지운다. `src/modules/admin/index.ts`는 아래로 바꾼다.

```ts
export * from './components';
export { type ColorMode, ThemeProvider, useTheme } from './contexts/ThemeContext';
export * from './data/themes';
export * from './types';
```

`src/modules/admin/components/index.ts`에서 `RuleCard`, `StatCard`, `ThemeSwitcher` 줄을 지우고 네 파일과 `AdminDashboard.tsx`를 삭제한다.

- [ ] **Step 3: 콘솔 공통**

```tsx
// src/modules/console/I18nProvider.tsx
'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { defaultLocale, type Locale, type MessageKey, translate } from '@/lib/i18n';

const COOKIE = 'studio_locale';

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

function cookieLocale(): Locale | null {
  const match = document.cookie.match(/(?:^|;\s*)studio_locale=(en|ko)/);
  return match ? (match[1] as Locale) : null;
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale());

  useEffect(() => {
    const saved = cookieLocale();
    if (saved) setLocaleState(saved);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    document.cookie = `${COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  }, []);

  const value = useMemo<I18nValue>(
    () => ({ locale, setLocale, t: (key, vars) => translate(locale, key, vars) }),
    [locale, setLocale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used within an I18nProvider');
  return context;
}
```

```tsx
// src/modules/console/MeProvider.tsx
'use client';

import React, { createContext, useContext, useEffect } from 'react';
import useSWR from 'swr';

import { ApiError, type ApiMe, fetchMe } from '@/lib/api';

interface MeValue {
  me?: ApiMe;
  isAdmin: boolean;
  loading: boolean;
}

const MeContext = createContext<MeValue>({ isAdmin: false, loading: true });

export function MeProvider({ children }: { children: React.ReactNode }) {
  const { data, error, isLoading } = useSWR('me', fetchMe, { revalidateOnFocus: false });

  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) {
      window.location.assign('/login');
    }
  }, [error]);

  return (
    <MeContext.Provider value={{ me: data, isAdmin: !!data?.canWrite, loading: isLoading }}>
      {children}
    </MeContext.Provider>
  );
}

export const useMe = () => useContext(MeContext);
```

```ts
// src/modules/console/useLive.ts
'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';

export const REFRESH_MS = 10_000;

export function useLive<T>(key: string | null, fetcher: () => Promise<T>) {
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const result = useSWR<T>(key, fetcher, {
    refreshInterval: REFRESH_MS,
    refreshWhenHidden: false,
    revalidateOnFocus: true,
    keepPreviousData: true,
    onSuccess: () => setUpdatedAt(Date.now()),
  });
  return { ...result, updatedAt };
}

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
```

```tsx
// src/modules/console/ui.tsx
'use client';

import React from 'react';

import { type MessageKey } from '@/lib/i18n';

import { useI18n } from './I18nProvider';
import { useNow } from './useLive';
import { formatAgo, formatClock } from '@/lib/format';

export const TH = 'border-b border-line px-2 py-1.5 text-left text-[11px] font-medium text-muted';
export const TD = 'border-b border-line/60 px-2 py-1.5 align-top';
export const BUTTON =
  'inline-flex items-center gap-1 rounded border border-line-strong bg-panel px-2 py-1 text-xs text-fg hover:bg-panel2 disabled:opacity-50';
export const BUTTON_PRIMARY =
  'inline-flex items-center gap-1 rounded bg-fg px-2.5 py-1 text-xs font-medium text-panel hover:opacity-90 disabled:opacity-50';
export const INPUT =
  'rounded border border-line-strong bg-panel px-2 py-1 text-xs text-fg placeholder:text-faint focus:border-fg focus:outline-none';

export function Panel({
  title,
  actions,
  className = '',
  children,
}: {
  title?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`rounded border border-line bg-panel ${className}`}>
      {title && (
        <header className="flex items-center justify-between border-b border-line px-3 py-1.5 text-[11px] font-medium text-muted">
          <span>{title}</span>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <h1 className="text-sm font-semibold">{title}</h1>
      <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'bad';
}) {
  return (
    <div className="rounded border border-line bg-panel px-3 py-2">
      <div className="text-[11px] text-muted">{label}</div>
      <div className={`num text-lg leading-7 ${tone === 'bad' ? 'text-bad' : 'text-fg'}`}>
        {value}
      </div>
    </div>
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
    <div className="inline-flex rounded border border-line-strong bg-panel p-0.5" role="group">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          aria-pressed={option === value}
          className={`rounded-sm px-2 py-0.5 text-xs ${option === value ? 'bg-fg text-panel' : 'text-fg2 hover:bg-panel2'}`}
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
import React from 'react';

import { type ApiBucket } from '@/lib/api';

export function StackedBars({
  buckets,
  height = 120,
  describe,
}: {
  buckets: ApiBucket[];
  height?: number;
  describe: (bucket: ApiBucket) => string;
}) {
  const max = Math.max(1, ...buckets.map((bucket) => bucket.allowed + bucket.rejected));
  return (
    <div className="flex items-end gap-px" style={{ height }}>
      {buckets.map((bucket) => {
        const total = bucket.allowed + bucket.rejected;
        return (
          <div
            key={bucket.start}
            title={describe(bucket)}
            className="relative flex-1 bg-bar/60 hover:bg-bar"
            style={{ height: `${(total / max) * 100}%`, minHeight: total > 0 ? 1 : 0 }}
          >
            <div
              className="absolute inset-x-0 bottom-0 bg-bad"
              style={{ height: total ? `${(bucket.rejected / total) * 100}%` : 0 }}
            />
          </div>
        );
      })}
    </div>
  );
}

export function Sparkline({ values, width = 72, height = 16 }: { values: number[]; width?: number; height?: number }) {
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const points = values
    .map((value, index) => `${(index * step).toFixed(1)},${(height - 1 - (value / max) * (height - 2)).toFixed(1)}`)
    .join(' ');
  const active = values.some((value) => value > 0);
  return (
    <svg width={width} height={height} aria-hidden className={active ? 'text-bad' : 'text-faint'}>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth={1.2} />
    </svg>
  );
}
```

```tsx
// src/modules/console/Shell.tsx
'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { Gauge, History, KeyRound, ListChecks, LogOut } from 'lucide-react';

import { AUDIT_FAILED_EVENT } from '@/lib/api';
import { type Locale, type MessageKey } from '@/lib/i18n';
import { type ColorMode, useTheme } from '@/modules/admin';

import { useI18n } from './I18nProvider';
import { useMe } from './MeProvider';
import { Notice } from './ui';

const NAV: { href: string; label: MessageKey; icon: typeof Gauge; adminOnly: boolean }[] = [
  { href: '/overview', label: 'nav.overview', icon: Gauge, adminOnly: false },
  { href: '/rules', label: 'nav.rules', icon: ListChecks, adminOnly: false },
  { href: '/keys', label: 'nav.keys', icon: KeyRound, adminOnly: true },
  { href: '/audit', label: 'nav.audit', icon: History, adminOnly: true },
];

const MODES: ColorMode[] = ['system', 'light', 'dark'];
const LOCALES: { value: Locale; label: string }[] = [
  { value: 'ko', label: '한국어' },
  { value: 'en', label: 'English' },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t, locale, setLocale } = useI18n();
  const { mode, setMode } = useTheme();
  const { me, isAdmin } = useMe();
  const [auditFailed, setAuditFailed] = useState(false);

  useEffect(() => {
    const onFailure = () => setAuditFailed(true);
    window.addEventListener(AUDIT_FAILED_EVENT, onFailure);
    return () => window.removeEventListener(AUDIT_FAILED_EVENT, onFailure);
  }, []);

  return (
    <div className="flex min-h-screen bg-bg text-fg">
      <aside className="sticky top-0 flex h-screen w-44 shrink-0 flex-col border-r border-line bg-panel2 px-2 py-3">
        <div className="flex items-center gap-2 px-2 pb-4 text-sm font-bold">
          <span className="inline-block h-3 w-3 rounded-sm bg-fg" />
          FluxGate
        </div>
        <nav className="flex flex-col gap-0.5">
          {NAV.filter((item) => !item.adminOnly || isAdmin).map((item) => {
            const active = pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 rounded px-2 py-1.5 text-xs ${active ? 'bg-line font-semibold text-fg' : 'text-fg2 hover:bg-line/60'}`}
              >
                <Icon size={14} />
                {t(item.label)}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto space-y-2 px-2 text-[11px] text-muted">
          <div>
            <div className="truncate text-fg2">{me ? me.name || me.username : '…'}</div>
            {me && <div>{t(me.canWrite ? 'role.admin' : 'role.viewer')}</div>}
          </div>
          <select
            aria-label="language"
            value={locale}
            onChange={(event) => setLocale(event.target.value as Locale)}
            className="w-full rounded border border-line-strong bg-panel px-1 py-0.5 text-[11px] text-fg"
          >
            {LOCALES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            aria-label="color mode"
            value={mode}
            onChange={(event) => setMode(event.target.value as ColorMode)}
            className="w-full rounded border border-line-strong bg-panel px-1 py-0.5 text-[11px] text-fg"
          >
            {MODES.map((option) => (
              <option key={option} value={option}>
                {t(`mode.${option}` as MessageKey)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="flex items-center gap-1 text-fg2 hover:text-fg"
          >
            <LogOut size={12} />
            {t('common.signOut')}
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4">
        {auditFailed && (
          <Notice tone="warn" onClose={() => setAuditFailed(false)}>
            {t('common.auditFailed')}
          </Notice>
        )}
        {children}
      </main>
    </div>
  );
}
```

```tsx
// src/app/(console)/layout.tsx
'use client';

import React from 'react';

import { ThemeProvider } from '@/modules/admin';
import { I18nProvider } from '@/modules/console/I18nProvider';
import { MeProvider } from '@/modules/console/MeProvider';
import { Shell } from '@/modules/console/Shell';

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <I18nProvider>
        <MeProvider>
          <Shell>{children}</Shell>
        </MeProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
```

```tsx
// src/app/(console)/overview/page.tsx
import { OverviewScreen } from '@/modules/console/screens/OverviewScreen';

export default function OverviewPage() {
  return <OverviewScreen />;
}
```

```tsx
// src/app/(console)/rules/page.tsx
import { RulesScreen } from '@/modules/console/screens/RulesScreen';

export default function RulesPage() {
  return <RulesScreen />;
}
```

```tsx
// src/app/(console)/keys/page.tsx
import { Suspense } from 'react';

import { KeysScreen } from '@/modules/console/screens/KeysScreen';

export default function KeysPage() {
  return (
    <Suspense>
      <KeysScreen />
    </Suspense>
  );
}
```

```tsx
// src/app/(console)/audit/page.tsx
import { AuditScreen } from '@/modules/console/screens/AuditScreen';

export default function AuditPage() {
  return <AuditScreen />;
}
```

```tsx
// src/app/page.tsx
import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/overview');
}
```

이 Task에서 네 화면 파일은 아래처럼 자리만 만든다(이름만 다르게 네 개).

```tsx
// src/modules/console/screens/OverviewScreen.tsx
'use client';

export function OverviewScreen() {
  return null;
}
```

`src/app/layout.tsx`의 `metadata.description`을 `'Rate limit monitoring and rule management'`로 바꾼다.

- [ ] **Step 4: 검증**

Run: `npm run lint && npm run typecheck && npm run test && npm run build`
Expected: 모두 통과. `/login` 화면이 새 테마 클래스로 그려지는지 `npm run dev` 후 확인한다.

- [ ] **Step 5: Commit**

```bash
git add fluxgate-studio-ui-nextjs
git commit -m "feat(ui): add the console shell, color tokens and routes"
```

---

### Task 10: 개요 화면

**Files:**
- Modify: `src/modules/console/screens/OverviewScreen.tsx`

**Interfaces:**
- Consumes: `fetchOverview`, `fetchTimeseries`, `fetchTopRejected`, `fetchDashboardStats`, `useLive`, `useNow`, `useMe`, ui와 charts

- [ ] **Step 1: 구현**

```tsx
// src/modules/console/screens/OverviewScreen.tsx
'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';

import {
  fetchDashboardStats,
  fetchOverview,
  fetchTimeseries,
  fetchTopRejected,
} from '@/lib/api';
import { formatAgo, formatClock, formatCount, formatPercent } from '@/lib/format';

import { Sparkline, StackedBars } from '../charts';
import { useI18n } from '../I18nProvider';
import { useMe } from '../MeProvider';
import { LiveStatus, Notice, PageHeader, Panel, StatTile, TD, TH, WindowPicker } from '../ui';
import { useLive, useNow } from '../useLive';

const WINDOWS = ['5m', '1h', '24h'] as const;
type Range = (typeof WINDOWS)[number];

export function OverviewScreen() {
  const { t, locale } = useI18n();
  const { isAdmin } = useMe();
  const now = useNow();
  const [range, setRange] = useState<Range>('1h');

  const overview = useLive(`overview:${range}`, () => fetchOverview(range));
  const series = useLive(`series:${range}`, () => fetchTimeseries(range));
  const top = useLive(`top:${range}`, () => fetchTopRejected(range, 10));
  const stats = useLive('stats', fetchDashboardStats);

  const data = overview.data;
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
            className="inline-flex items-center gap-1 text-xs text-fg2 underline"
          >
            {t('overview.external')}
            <ExternalLink size={12} />
          </a>
        )}
        <LiveStatus updatedAt={overview.updatedAt} error={overview.error} />
        <WindowPicker value={range} options={WINDOWS} onChange={setRange} />
      </PageHeader>

      {overview.error && !data && (
        <Notice tone="bad">{String((overview.error as Error).message)}</Notice>
      )}
      {data && data.total === 0 && data.ruleSets.every((set) => set.lastDecisionAt === null) && (
        <Notice>{t('overview.noEvents')}</Notice>
      )}

      <div className="mb-2 grid grid-cols-2 gap-2 md:grid-cols-5">
        <StatTile label={t('overview.decisions')} value={data ? formatCount(data.total) : '–'} />
        <StatTile
          label={t('overview.rejected')}
          value={data ? formatCount(data.rejected) : '–'}
          tone={data && data.rejected > 0 ? 'bad' : undefined}
        />
        <StatTile
          label={t('overview.rejectRate')}
          value={data ? formatPercent(data.rejectRate) : '–'}
        />
        <StatTile
          label={t('overview.activeRules')}
          value={stats.data ? `${stats.data.activeRules}/${stats.data.totalRules}` : '–'}
        />
        <StatTile
          label={t('overview.ruleSets')}
          value={stats.data ? String(stats.data.totalRuleSets) : '–'}
        />
      </div>

      <div className="mb-2 grid gap-2 lg:grid-cols-3">
        <Panel title={t('overview.trend')} className="lg:col-span-2">
          <div className="p-3">
            <StackedBars
              buckets={series.data?.buckets ?? []}
              height={150}
              describe={(bucket) =>
                `${formatClock(bucket.start)}  ${t('decision.allowed')} ${bucket.allowed} · ${t('decision.rejected')} ${bucket.rejected}`
              }
            />
          </div>
        </Panel>
        <Panel title={t('overview.topRejected')}>
          <table className="w-full">
            <thead>
              <tr>
                <th className={TH}>{t('col.key')}</th>
                <th className={TH}>{t('col.ruleSet')}</th>
                <th className={`${TH} text-right`}>{t('col.rejected')}</th>
                <th className={TH}>{t('col.lastRejected')}</th>
              </tr>
            </thead>
            <tbody>
              {(top.data ?? []).map((row) => (
                <tr key={`${row.ruleSetId}:${row.key}`}>
                  <td className={`${TD} num`}>
                    {isAdmin && !row.masked ? (
                      <Link
                        href={`/keys?value=${encodeURIComponent(row.key)}&transform=none`}
                        className="underline"
                      >
                        {row.key}
                      </Link>
                    ) : (
                      row.key
                    )}
                  </td>
                  <td className={`${TD} num text-fg2`}>{row.ruleSetId}</td>
                  <td className={`${TD} num text-right text-bad`}>{formatCount(row.rejected)}</td>
                  <td className={`${TD} text-muted`}>{ago(row.lastRejectedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      <Panel title={t('col.ruleSet')}>
        <table className="w-full">
          <thead>
            <tr>
              <th className={TH}>{t('col.ruleSet')}</th>
              <th className={TH}>{t('col.trend')}</th>
              <th className={`${TH} text-right`}>{t('col.decisions')}</th>
              <th className={`${TH} text-right`}>{t('col.rejected')}</th>
              <th className={`${TH} text-right`}>{t('col.rejectRate')}</th>
              <th className={TH}>{t('col.lastDecision')}</th>
            </tr>
          </thead>
          <tbody>
            {(data?.ruleSets ?? []).map((set) => (
              <tr key={set.ruleSetId}>
                <td className={`${TD} num`}>{set.ruleSetId}</td>
                <td className={TD}>
                  <Sparkline values={set.trend} />
                </td>
                <td className={`${TD} num text-right`}>{formatCount(set.total)}</td>
                <td className={`${TD} num text-right ${set.rejected > 0 ? 'text-bad' : ''}`}>
                  {formatCount(set.rejected)}
                </td>
                <td className={`${TD} num text-right`}>{formatPercent(set.rejectRate)}</td>
                <td className={`${TD} text-muted`}>{ago(set.lastDecisionAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
```

- [ ] **Step 2: 검증**

Run: `npm run lint && npm run typecheck && npm run build`
Expected: 통과

- [ ] **Step 3: Commit**

```bash
git add fluxgate-studio-ui-nextjs/src/modules/console/screens/OverviewScreen.tsx
git commit -m "feat(ui): add the monitoring overview"
```

---

### Task 11: 규칙 화면

**Files:**
- Create: `src/modules/console/ConfirmChangeDialog.tsx`
- Modify: `src/modules/console/screens/RulesScreen.tsx`
- Modify: `src/modules/admin/components/RuleFormPanel.tsx`

**Interfaces:**
- Consumes: 기존 `RuleFormPanel`, `SimulationPanel`, `mapApiRuleToRule`, `mapRuleToCreateRequest`, `mapRuleToUpdateRequest`, `ruleIdentity`, `createRule`, `updateRule`, `toggleRule`, `deleteRule`, `exportRules`, `importRules`, `assertSafeRuleNumbers`, `fetchRules`, `fetchOverview`, `diffRules`, `describeBand`, `formatLimit`
- Produces: `ConfirmChangeDialog({ title, changes, onCancel, onConfirm, busy })`

- [ ] **Step 1: RuleFormPanel을 오른쪽 패널로 바꾸고 의미 문장 추가**

바깥 래퍼 클래스:

```tsx
      className={`fixed inset-0 ${theme.colors.bgOverlay} z-50 flex justify-end`}
```

안쪽 카드 클래스:

```tsx
        className={`${theme.colors.bgSecondary} ${theme.colors.border} h-full w-full max-w-xl overflow-y-auto border-l ${theme.colors.shadow}`}
```

밴드 행에서 `<div className="grid flex-1 grid-cols-3 gap-2">`를 아래로 바꾼다.

```tsx
                    <div className="flex-1">
                    <div className="grid grid-cols-3 gap-2">
```

같은 행에서 `{formData.bands.length > 1 && (` 바로 앞, 그리드가 닫히는 `</div>` 다음에 아래를 넣는다.

```tsx
                    <p className="mt-1 text-[11px] text-muted">{describeBand(band, locale)}</p>
                    </div>
```

파일 위쪽에 `import { describeBand } from '@/lib/ruleMeaning';`와 `import { useI18n } from '@/modules/console/I18nProvider';`를 추가하고, 컴포넌트 첫 줄에 `const { locale } = useI18n();`를 넣는다. prettier가 들여쓰기를 맞춘다.

- [ ] **Step 2: 확인 창**

```tsx
// src/modules/console/ConfirmChangeDialog.tsx
'use client';

import React from 'react';

import { type FieldChange } from '@/lib/ruleDiff';

import { useI18n } from './I18nProvider';
import { BUTTON, BUTTON_PRIMARY, TD, TH } from './ui';

export function ConfirmChangeDialog({
  title,
  changes,
  busy,
  onCancel,
  onConfirm,
}: {
  title: string;
  changes: FieldChange[];
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div role="dialog" aria-modal className="w-full max-w-lg rounded border border-line bg-panel">
        <header className="border-b border-line px-4 py-2 text-sm font-semibold">
          {t('rules.confirmTitle')}
          <div className="num text-[11px] font-normal text-muted">{title}</div>
        </header>
        <table className="w-full">
          <thead>
            <tr>
              <th className={TH}>{t('col.change')}</th>
              <th className={TH} />
              <th className={TH} />
            </tr>
          </thead>
          <tbody>
            {changes.map((change) => (
              <tr key={change.field}>
                <td className={`${TD} num text-muted`}>{change.field}</td>
                <td className={`${TD} num`}>
                  <span className="bg-bad-soft text-bad">{change.before || '∅'}</span>
                </td>
                <td className={`${TD} num`}>
                  <span className="bg-ok-soft text-ok">{change.after || '∅'}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="m-3 rounded border border-warn-line bg-warn-soft px-3 py-2 text-xs text-warn">
          {t('rules.confirmWarning')}
        </p>
        <footer className="flex justify-end gap-2 border-t border-line px-4 py-2">
          <button type="button" className={BUTTON} onClick={onCancel} disabled={busy}>
            {t('common.cancel')}
          </button>
          <button type="button" className={BUTTON_PRIMARY} onClick={onConfirm} disabled={busy}>
            {t('rules.confirmSave')}
          </button>
        </footer>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 규칙 화면**

```tsx
// src/modules/console/screens/RulesScreen.tsx
'use client';

import React, { useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { Download, Play, Plus, Trash2, Upload } from 'lucide-react';

import {
  ApiError,
  assertSafeRuleNumbers,
  createRule,
  type CreateRuleRequest,
  deleteRule,
  exportRules,
  fetchOverview,
  fetchRules,
  importRules,
  toggleRule,
  updateRule,
} from '@/lib/api';
import { formatCount } from '@/lib/format';
import {
  mapApiRuleToRule,
  mapRuleToCreateRequest,
  mapRuleToUpdateRequest,
} from '@/lib/mappers';
import { diffRules, type FieldChange } from '@/lib/ruleDiff';
import { describeBand, formatLimit } from '@/lib/ruleMeaning';
import { RuleFormPanel, SimulationPanel } from '@/modules/admin';
import { type FieldErrors, type Rule, ruleIdentity } from '@/modules/admin/types';

import { ConfirmChangeDialog } from '../ConfirmChangeDialog';
import { useI18n } from '../I18nProvider';
import { useMe } from '../MeProvider';
import { BUTTON, BUTTON_PRIMARY, INPUT, Notice, PageHeader, Panel, TD, TH } from '../ui';
import { useLive } from '../useLive';

type Pending =
  | { kind: 'save'; rule: Rule | null; data: Partial<Rule> & { id: string }; changes: FieldChange[] }
  | { kind: 'toggle'; rule: Rule; changes: FieldChange[] };

function toFieldErrors(details: string[]): FieldErrors {
  const errors: FieldErrors = {};
  for (const detail of details) {
    const separator = detail.indexOf(':');
    if (separator > 0) errors[detail.slice(0, separator).trim()] = detail.slice(separator + 1).trim();
  }
  return errors;
}

export function RulesScreen() {
  const { t, locale } = useI18n();
  const { isAdmin } = useMe();
  const rules = useSWR('rules', async () => (await fetchRules()).map(mapApiRuleToRule));
  const daily = useLive('overview:24h', () => fetchOverview('24h'));

  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Rule | null | undefined>(undefined);
  const [simulating, setSimulating] = useState<Rule | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [formErrors, setFormErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const importInput = useRef<HTMLInputElement>(null);

  const rejectedBySet = useMemo(
    () => new Map((daily.data?.ruleSets ?? []).map((set) => [set.ruleSetId, set.rejected])),
    [daily.data]
  );

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = (rules.data ?? []).filter(
      (rule) =>
        !needle ||
        rule.id.toLowerCase().includes(needle) ||
        rule.name.toLowerCase().includes(needle) ||
        (rule.ruleSetId ?? '').toLowerCase().includes(needle) ||
        rule.tags.some((tag) => tag.toLowerCase().includes(needle))
    );
    const byGroup = new Map<string | null, Rule[]>();
    for (const rule of matches) {
      byGroup.set(rule.ruleSetId, [...(byGroup.get(rule.ruleSetId) ?? []), rule]);
    }
    return [...byGroup.entries()].sort(([a], [b]) =>
      a === null ? 1 : b === null ? -1 : a.localeCompare(b)
    );
  }, [rules.data, query]);

  const fail = (err: unknown) => {
    if (err instanceof ApiError && err.status === 409) setError(t('rules.conflict'));
    else setError(err instanceof Error ? err.message : String(err));
  };

  const confirmPending = async () => {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      if (pending.kind === 'toggle') {
        await toggleRule(pending.rule.id, pending.rule.ruleSetId);
      } else if (pending.rule) {
        assertSafeRuleNumbers(pending.rule);
        await updateRule(pending.data.id, mapRuleToUpdateRequest(pending.data), pending.rule.ruleSetId);
      } else {
        await createRule(mapRuleToCreateRequest(pending.data));
      }
      setPending(null);
      setEditing(undefined);
      setFormErrors({});
      await rules.mutate();
    } catch (err) {
      if (pending.kind === 'save' && err instanceof ApiError && err.details.length > 0) {
        setFormErrors(toFieldErrors(err.details));
      }
      setPending(null);
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const onSave = (data: Partial<Rule> & { id: string }) => {
    const before = editing ?? null;
    setPending({ kind: 'save', rule: before, data, changes: diffRules(before, data) });
  };

  const onToggle = (rule: Rule) =>
    setPending({ kind: 'toggle', rule, changes: diffRules(rule, { ...rule, enabled: !rule.enabled }) });

  const onDelete = async (rule: Rule) => {
    if (!window.confirm(t('rules.deleteConfirm', { id: rule.id }))) return;
    try {
      await deleteRule(rule.id, rule.ruleSetId);
      await rules.mutate();
    } catch (err) {
      fail(err);
    }
  };

  const onExport = async () => {
    try {
      const blob = new Blob([await exportRules()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `fluxgate-rules-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      fail(err);
    }
  };

  const onImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const payload: CreateRuleRequest[] = Array.isArray(parsed) ? parsed : parsed.rules;
      if (!Array.isArray(payload) || payload.length === 0) {
        setError(t('rules.importInvalid'));
        return;
      }
      payload.forEach(assertSafeRuleNumbers);
      if (!window.confirm(t('rules.importConfirm', { count: payload.length, file: file.name }))) return;
      const result = await importRules(payload);
      setNotice(t('rules.imported', { ...result }));
      await rules.mutate();
    } catch (err) {
      if (err instanceof SyntaxError) setError(t('rules.importNotJson'));
      else fail(err);
    }
  };

  return (
    <div>
      <PageHeader title={t('rules.title')}>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('rules.search')}
          className={`${INPUT} w-64`}
        />
        <button type="button" className={BUTTON} onClick={onExport}>
          <Download size={12} />
          {t('rules.export')}
        </button>
        {isAdmin ? (
          <>
            <button type="button" className={BUTTON} onClick={() => importInput.current?.click()}>
              <Upload size={12} />
              {t('rules.import')}
            </button>
            <input ref={importInput} type="file" accept="application/json" hidden onChange={onImport} />
            <button type="button" className={BUTTON_PRIMARY} onClick={() => setEditing(null)}>
              <Plus size={12} />
              {t('rules.new')}
            </button>
          </>
        ) : (
          <span className="text-[11px] text-muted">{t('rules.readOnly')}</span>
        )}
      </PageHeader>

      {error && (
        <Notice tone="bad" onClose={() => setError(null)}>
          {error}
        </Notice>
      )}
      {notice && <Notice onClose={() => setNotice(null)}>{notice}</Notice>}

      <Panel>
        <table className="w-full">
          <thead>
            <tr>
              <th className={TH}>{t('col.rule')}</th>
              <th className={TH}>{t('col.scope')}</th>
              <th className={TH}>{t('col.limit')}</th>
              <th className={TH}>{t('col.meaning')}</th>
              <th className={TH}>{t('col.enabled')}</th>
              <th className={TH} />
            </tr>
          </thead>
          <tbody>
            {groups.map(([ruleSetId, members]) => (
              <React.Fragment key={ruleSetId ?? '__none__'}>
                <tr>
                  <td colSpan={6} className="border-b border-line bg-panel2 px-2 py-1 text-xs font-semibold">
                    <span className="num">{ruleSetId ?? t('rules.unassigned')}</span>
                    {ruleSetId && (
                      <span className={`ml-3 font-normal ${rejectedBySet.get(ruleSetId) ? 'text-bad' : 'text-muted'}`}>
                        {t('rules.rejected24h', { count: formatCount(rejectedBySet.get(ruleSetId) ?? 0) })}
                      </span>
                    )}
                  </td>
                </tr>
                {members.map((rule) => (
                  <tr key={ruleIdentity(rule)} className={rule.enabled ? '' : 'opacity-60'}>
                    <td className={`${TD} num`}>
                      {rule.id}
                      <div className="font-sans text-[11px] text-muted">{rule.name}</div>
                    </td>
                    <td className={TD}>
                      <span className="rounded border border-line-strong px-1 text-[10px] text-fg2">{rule.scope}</span>
                    </td>
                    <td className={`${TD} num`}>{rule.bands.map(formatLimit).join(' / ')}</td>
                    <td className={`${TD} text-fg2`}>
                      {rule.bands.map((band) => (
                        <div key={band.windowSeconds}>{describeBand(band, locale)}</div>
                      ))}
                    </td>
                    <td className={TD}>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={rule.enabled}
                        disabled={!isAdmin}
                        onClick={() => onToggle(rule)}
                        className={`relative inline-block h-3.5 w-6 rounded-full ${rule.enabled ? 'bg-ok' : 'bg-line-strong'} disabled:cursor-default`}
                      >
                        <span className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-panel ${rule.enabled ? 'right-0.5' : 'left-0.5'}`} />
                      </button>
                    </td>
                    <td className={`${TD} whitespace-nowrap text-right`}>
                      <button type="button" className={BUTTON} onClick={() => setSimulating(rule)}>
                        <Play size={11} />
                        {t('rules.simulate')}
                      </button>
                      {isAdmin && (
                        <>
                          <button type="button" className={`${BUTTON} ml-1`} onClick={() => setEditing(rule)}>
                            {t('rules.edit')}
                          </button>
                          <button
                            type="button"
                            aria-label={t('rules.delete')}
                            className={`${BUTTON} ml-1 text-bad`}
                            onClick={() => onDelete(rule)}
                          >
                            <Trash2 size={11} />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
            {rules.data && groups.length === 0 && (
              <tr>
                <td colSpan={6} className={`${TD} text-center text-muted`}>
                  {t('rules.empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Panel>

      {editing !== undefined && (
        <RuleFormPanel
          rule={editing}
          serverErrors={formErrors}
          onClose={() => {
            setEditing(undefined);
            setFormErrors({});
          }}
          onSave={onSave}
        />
      )}
      {simulating && <SimulationPanel rule={simulating} onClose={() => setSimulating(null)} />}
      {pending && (
        <ConfirmChangeDialog
          title={
            pending.kind === 'save' && !pending.rule
              ? t('rules.confirmNew', { id: pending.data.id })
              : `${(pending.kind === 'toggle' ? pending.rule : pending.rule!).ruleSetId ?? ''} / ${pending.kind === 'toggle' ? pending.rule.id : pending.data.id}`
          }
          changes={pending.changes}
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={confirmPending}
        />
      )}
    </div>
  );
}
```

`setEditing(rule)`과 `setEditing(null)`의 구분: `undefined`는 닫힘, `null`은 새 규칙, `Rule`은 수정이다.

- [ ] **Step 4: 검증**

Run: `npm run format && npm run lint && npm run typecheck && npm run test && npm run build`
Expected: 통과

- [ ] **Step 5: Commit**

```bash
git add fluxgate-studio-ui-nextjs/src
git commit -m "feat(ui): rebuild the rules screen with plain language limits and change review"
```

---

### Task 12: 키 조회 화면과 변경 기록 화면

**Files:**
- Modify: `src/modules/console/screens/KeysScreen.tsx`, `src/modules/console/screens/AuditScreen.tsx`

**Interfaces:**
- Consumes: `fetchKeyTransforms`, `lookupKey`, `fetchAudit`, `fetchAuditEntry`, `useMe`, ui, charts, format

- [ ] **Step 1: 키 조회 화면**

```tsx
// src/modules/console/screens/KeysScreen.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';

import { type ApiKeyLookup, fetchKeyTransforms, lookupKey } from '@/lib/api';
import { formatClock, formatCount, formatDateTime } from '@/lib/format';
import { type MessageKey } from '@/lib/i18n';

import { StackedBars } from '../charts';
import { useI18n } from '../I18nProvider';
import { useMe } from '../MeProvider';
import { BUTTON_PRIMARY, Forbidden, INPUT, Notice, PageHeader, Panel, TD, TH, WindowPicker } from '../ui';

const WINDOWS = ['1h', '24h', '7d'] as const;
type Range = (typeof WINDOWS)[number];

const STATUS_STYLE = {
  BLOCKED: 'text-bad',
  RECOVERED: 'text-warn',
  ALLOWED: 'text-ok',
} as const;

export function KeysScreen() {
  const { t } = useI18n();
  const { isAdmin, loading } = useMe();
  const params = useSearchParams();
  const transforms = useSWR(isAdmin ? 'key-transforms' : null, fetchKeyTransforms);

  const [value, setValue] = useState(params.get('value') ?? '');
  const [transform, setTransform] = useState(params.get('transform') ?? 'none');
  const [range, setRange] = useState<Range>('24h');
  const [result, setResult] = useState<ApiKeyLookup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (nextRange: Range = range) => {
    if (!value.trim()) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await lookupKey({ value: value.trim(), transform, window: nextRange }));
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (isAdmin && params.get('value')) void run();
    // Runs once when an admin arrives with a key in the address.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  if (!loading && !isAdmin) return <Forbidden />;

  return (
    <div>
      <PageHeader title={t('keys.title')}>
        <span className="text-[11px] text-muted">{t('keys.audited')}</span>
      </PageHeader>

      <form
        className="mb-3 flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void run();
        }}
      >
        <select
          aria-label={t('keys.transform')}
          value={transform}
          onChange={(event) => setTransform(event.target.value)}
          className={INPUT}
        >
          {(transforms.data ?? ['none']).map((option) => (
            <option key={option} value={option}>
              {t(`keys.transform.${option}` as MessageKey)}
            </option>
          ))}
        </select>
        <input
          aria-label={t('keys.value')}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={t('keys.placeholder')}
          className={`${INPUT} num w-80`}
        />
        <WindowPicker
          value={range}
          options={WINDOWS}
          onChange={(next) => {
            setRange(next);
            if (result) void run(next);
          }}
        />
        <button type="submit" className={BUTTON_PRIMARY} disabled={busy || !value.trim()}>
          {t('keys.lookup')}
        </button>
      </form>

      {error && <Notice tone="bad">{error}</Notice>}

      {result && result.ruleSets.length === 0 && <Notice>{t('keys.noResult')}</Notice>}

      {result && result.ruleSets.length > 0 && (
        <>
          <div className="mb-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {result.ruleSets.map((status) => (
              <Panel key={status.ruleSetId ?? '-'} title={`${status.ruleSetId ?? '-'} · ${t('keys.basis')}`}>
                <div className="space-y-1 px-3 py-2">
                  <div className={`text-sm font-semibold ${STATUS_STYLE[status.status]}`}>
                    {t(`keys.status.${status.status}` as MessageKey)}
                  </div>
                  <div className="num text-xs text-fg2">
                    {formatDateTime(status.lastDecisionAt)}
                    {' · '}
                    {status.blockedUntil
                      ? t(status.status === 'BLOCKED' ? 'keys.blockedUntil' : 'keys.releasedAt', {
                          time: formatClock(status.blockedUntil),
                        })
                      : t('keys.remaining', { count: status.remainingTokens })}
                  </div>
                  <div className="text-[11px] text-muted">
                    {t('keys.counts', {
                      allowed: formatCount(status.allowed),
                      rejected: formatCount(status.rejected),
                    })}
                  </div>
                </div>
              </Panel>
            ))}
          </div>

          <Panel title={t('keys.timeline')} className="mb-2">
            <div className="p-3">
              <StackedBars
                buckets={result.buckets}
                height={60}
                describe={(bucket) =>
                  `${formatDateTime(bucket.start)}  ${t('decision.allowed')} ${bucket.allowed} · ${t('decision.rejected')} ${bucket.rejected}`
                }
              />
            </div>
          </Panel>

          <Panel title={t('keys.recent')}>
            <table className="w-full">
              <thead>
                <tr>
                  <th className={TH}>{t('col.time')}</th>
                  <th className={TH}>{t('col.rule')}</th>
                  <th className={TH}>{t('col.request')}</th>
                  <th className={TH}>{t('col.decision')}</th>
                  <th className={`${TH} text-right`}>{t('col.remaining')}</th>
                  <th className={`${TH} text-right`}>{t('col.retryAfter')}</th>
                </tr>
              </thead>
              <tbody>
                {result.recent.map((decision, index) => (
                  <tr key={`${decision.timestamp}-${index}`}>
                    <td className={`${TD} num`}>{formatDateTime(decision.timestamp)}:{String(new Date(decision.timestamp).getSeconds()).padStart(2, '0')}</td>
                    <td className={`${TD} num text-fg2`}>{decision.ruleId}</td>
                    <td className={`${TD} num text-fg2`}>
                      {decision.method} {decision.endpoint}
                    </td>
                    <td className={`${TD} ${decision.allowed ? 'text-ok' : 'text-bad'}`}>
                      {t(decision.allowed ? 'decision.allowed' : 'decision.rejected')}
                    </td>
                    <td className={`${TD} num text-right`}>{decision.remainingTokens}</td>
                    <td className={`${TD} num text-right`}>
                      {decision.allowed ? '–' : `${(decision.retryAfterMs / 1000).toFixed(1)}s`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 변경 기록 화면**

```tsx
// src/modules/console/screens/AuditScreen.tsx
'use client';

import React, { useState } from 'react';
import useSWR from 'swr';

import { type ApiAuditEntry, fetchAudit, fetchAuditEntry } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { type MessageKey } from '@/lib/i18n';

import { useI18n } from '../I18nProvider';
import { useMe } from '../MeProvider';
import { BUTTON, Forbidden, INPUT, Notice, PageHeader, Panel, TD, TH } from '../ui';

const ACTIONS = [
  'RULE_CREATE',
  'RULE_UPDATE',
  'RULE_TOGGLE',
  'RULE_DELETE',
  'RULES_DELETE_ALL',
  'RULES_IMPORT',
  'POLICY_PUBLISH',
  'POLICY_ROLLBACK',
  'KEY_LOOKUP',
] as const;
const PAGE_SIZE = 50;

function show(value: unknown): string {
  if (value === null || value === undefined) return '∅';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function Change({ entry }: { entry: ApiAuditEntry }) {
  const { t } = useI18n();
  if (entry.action === 'KEY_LOOKUP') {
    return <span>{t('audit.lookupOf', { value: show(entry.detail?.value) })}</span>;
  }
  const fields = Object.keys({ ...(entry.before ?? {}), ...(entry.after ?? {}) });
  if (fields.length === 0) return <span className="text-muted">{show(entry.detail)}</span>;
  return (
    <div className="space-y-0.5">
      {fields.map((field) => (
        <div key={field}>
          <span className="text-muted">{field} </span>
          <span className="bg-bad-soft text-bad">{show(entry.before?.[field])}</span>
          {' → '}
          <span className="bg-ok-soft text-ok">{show(entry.after?.[field])}</span>
        </div>
      ))}
    </div>
  );
}

export function AuditScreen() {
  const { t } = useI18n();
  const { isAdmin, loading } = useMe();
  const [action, setAction] = useState('');
  const [actor, setActor] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<ApiAuditEntry | null>(null);

  const search = { action, actor, q, page, size: PAGE_SIZE };
  const result = useSWR(isAdmin ? ['audit', search] : null, () => fetchAudit(search));

  if (!loading && !isAdmin) return <Forbidden />;

  const pages = Math.max(1, Math.ceil((result.data?.totalElements ?? 0) / PAGE_SIZE));
  const target = (entry: ApiAuditEntry) =>
    entry.target ? [entry.target.ruleSetId, entry.target.ruleId].filter(Boolean).join(' / ') : '–';

  return (
    <div>
      <PageHeader title={t('audit.title')}>
        <select
          value={action}
          onChange={(event) => {
            setAction(event.target.value);
            setPage(0);
          }}
          className={INPUT}
        >
          <option value="">{t('audit.allActions')}</option>
          {ACTIONS.map((option) => (
            <option key={option} value={option}>
              {t(`action.${option}` as MessageKey)}
            </option>
          ))}
        </select>
        <input
          value={actor}
          onChange={(event) => {
            setActor(event.target.value);
            setPage(0);
          }}
          placeholder={t('audit.actor')}
          className={INPUT}
        />
        <input
          value={q}
          onChange={(event) => {
            setQ(event.target.value);
            setPage(0);
          }}
          placeholder={t('audit.search')}
          className={`${INPUT} w-56`}
        />
      </PageHeader>

      {result.error && <Notice tone="bad">{String((result.error as Error).message)}</Notice>}

      <Panel>
        <table className="w-full">
          <thead>
            <tr>
              <th className={TH}>{t('col.time')}</th>
              <th className={TH}>{t('col.user')}</th>
              <th className={TH}>{t('col.action')}</th>
              <th className={TH}>{t('col.target')}</th>
              <th className={TH}>{t('col.change')}</th>
              <th className={TH} />
            </tr>
          </thead>
          <tbody>
            {(result.data?.content ?? []).map((entry) => (
              <tr key={entry.id}>
                <td className={`${TD} num whitespace-nowrap`}>{formatDateTime(Date.parse(entry.at))}</td>
                <td className={TD}>{entry.actor.name || entry.actor.username}</td>
                <td className={TD}>
                  <span className="rounded border border-line-strong px-1 text-[10px]">
                    {t(`action.${entry.action}` as MessageKey)}
                  </span>
                </td>
                <td className={`${TD} num text-fg2`}>{target(entry)}</td>
                <td className={`${TD} num`}>
                  <Change entry={entry} />
                </td>
                <td className={`${TD} text-right`}>
                  <button
                    type="button"
                    className={BUTTON}
                    onClick={async () => setDetail(await fetchAuditEntry(entry.id))}
                  >
                    {t('audit.detail')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <footer className="flex items-center justify-end gap-2 px-3 py-2 text-[11px] text-muted">
          <button type="button" className={BUTTON} disabled={page === 0} onClick={() => setPage(page - 1)}>
            {t('common.previous')}
          </button>
          {t('common.page', { page: page + 1, pages })}
          <button
            type="button"
            className={BUTTON}
            disabled={page + 1 >= pages}
            onClick={() => setPage(page + 1)}
          >
            {t('common.next')}
          </button>
        </footer>
      </Panel>

      {detail && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={() => setDetail(null)}>
          <div
            className="h-full w-full max-w-lg overflow-y-auto border-l border-line bg-panel p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">{t(`action.${detail.action}` as MessageKey)}</h2>
              <button type="button" className={BUTTON} onClick={() => setDetail(null)}>
                {t('common.close')}
              </button>
            </div>
            <pre className="num overflow-x-auto rounded bg-panel2 p-3 text-[11px]">
              {JSON.stringify(detail, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: 검증**

Run: `npm run format && npm run lint && npm run typecheck && npm run test && npm run build`
Expected: 통과

- [ ] **Step 4: Commit**

```bash
git add fluxgate-studio-ui-nextjs/src
git commit -m "feat(ui): add key lookup and audit log screens"
```

---

### Task 13: 로컬 실행, 데모 데이터, 문서

**Files:**
- Create: `docker/demo-events.js`
- Modify: `README.md`, `README.ko.md`, `fluxgate-studio-ui-nextjs/README.md`

**Interfaces:**
- Produces: `mongosh` 스크립트로 최근 2시간의 판정 이력을 넣는 데모 데이터

- [ ] **Step 1: 데모 데이터 스크립트**

```js
// docker/demo-events.js
// Fills rate_limit_events with two hours of sample decisions for the monitoring console.
// Usage: docker exec -i fluxgate-mongo mongosh -u fluxgate -p fluxgate123 --authenticationDatabase admin fluxgate < docker/demo-events.js
const now = Date.now();
const sets = [
  { ruleSetId: 'checkout-api', ruleId: 'checkout-api-per-user', perMinute: 40, rejectEvery: 9 },
  { ruleSetId: 'login-api', ruleId: 'login-api-per-ip', perMinute: 12, rejectEvery: 4 },
  { ruleSetId: 'search-api', ruleId: 'search-api-per-user', perMinute: 25, rejectEvery: 0 },
];
const users = ['100200300', '100200301', '100200302', '100200303', 'a3f9c1d2e4b5'];
const docs = [];
for (let minute = 120; minute >= 0; minute--) {
  for (const set of sets) {
    for (let i = 0; i < set.perMinute; i++) {
      const timestamp = now - minute * 60000 - Math.floor(Math.random() * 60000);
      const rejected = set.rejectEvery > 0 && i % set.rejectEvery === 0 && minute % 7 < 3;
      docs.push({
        timestamp: NumberLong(String(timestamp)),
        timestampIso: new Date(timestamp).toISOString(),
        createdAt: new Date(timestamp),
        allowed: !rejected,
        remainingTokens: NumberLong(rejected ? 0 : Math.floor(Math.random() * 10)),
        retryAfterMs: NumberLong(rejected ? 2000 + Math.floor(Math.random() * 8000) : 0),
        ruleSetId: set.ruleSetId,
        ruleId: set.ruleId,
        ruleName: set.ruleId,
        endpoint: '/api/' + set.ruleSetId.replace('-api', ''),
        method: 'POST',
        userId: users[(i + minute) % users.length],
      });
    }
  }
}
db.rate_limit_events.insertMany(docs);
print('inserted ' + docs.length + ' decisions');
```

주석 정책 때문에 스크립트 주석에서 콜론과 하이픈은 쓰지 않는다. 실제 파일에서는 `Usage` 줄을 README로 옮긴다.

- [ ] **Step 2: README 갱신**

`README.md`와 `README.ko.md`의 화면 소개 부분에 아래를 추가한다.

- 콘솔 화면 네 개(개요, 규칙, 키 조회, 변경 기록)와 역할별 차이
- `fluxgate.studio.monitoring.*`, `fluxgate.studio.audit.*` 설정과 환경변수
- 이벤트 컬렉션 인덱스 세 개와, 공용 DB에서 `FLUXGATE_EVENT_CREATE_INDEXES=false`로 끄는 방법
- 데모 데이터 넣는 명령
- UI 환경변수 `NEXT_PUBLIC_DEFAULT_LOCALE`, `NEXT_PUBLIC_EXTERNAL_DASHBOARD_URL`

- [ ] **Step 3: 로컬 실행 확인**

Keycloak, Mongo, Redis는 컨테이너로, admin-api와 UI는 호스트에서 띄운다. 이 방식은 hosts 파일 수정이 필요 없다.

```bash
docker run -d --name studio-dev-mongo -p 27017:27017 -e MONGO_INITDB_ROOT_USERNAME=fluxgate -e MONGO_INITDB_ROOT_PASSWORD=fluxgate123 mongo:7.0
docker run -d --name studio-dev-redis -p 6379:6379 redis:7-alpine
docker run -d --name studio-dev-keycloak -p 8080:8080 -e KC_BOOTSTRAP_ADMIN_USERNAME=admin -e KC_BOOTSTRAP_ADMIN_PASSWORD=admin \
  -v "$PWD/docker/fluxgate-realm.json:/opt/keycloak/data/import/fluxgate-realm.json:ro" \
  quay.io/keycloak/keycloak:26.0 start-dev --import-realm
docker exec -i studio-dev-mongo mongosh -u fluxgate -p fluxgate123 --authenticationDatabase admin fluxgate < docker/demo-events.js

cd fluxgate-studio-admin-api
SPRING_PROFILES_ACTIVE=dev SERVER_PORT=8091 \
KEYCLOAK_ISSUER_URI=http://localhost:8080/realms/fluxgate \
KEYCLOAK_JWK_SET_URI=http://localhost:8080/realms/fluxgate/protocol/openid-connect/certs \
FLUXGATE_MONGO_URI='mongodb://fluxgate:fluxgate123@localhost:27017/fluxgate?authSource=admin' \
FLUXGATE_REDIS_URI=redis://localhost:6379 \
./mvnw -B -ntp $M2 spring-boot:run

cd fluxgate-studio-ui-nextjs
ADMIN_API_URL=http://localhost:8091 NEXTAUTH_URL=http://localhost:3000 NEXTAUTH_SECRET=local-dev-secret \
KEYCLOAK_ISSUER=http://localhost:8080/realms/fluxgate KEYCLOAK_CLIENT_ID=fluxgate-studio \
KEYCLOAK_CLIENT_SECRET=fluxgate-studio-secret NEXT_PUBLIC_DEFAULT_LOCALE=ko npm run dev
```

확인 항목:

- `admin/admin`으로 로그인하면 네 메뉴가 보이고, 개요에 데모 데이터의 추이와 상위 차단 키가 나온다.
- 규칙을 하나 만들고 한도를 바꾸면 확인 창에 바뀐 값과 초기화 경고가 나오고, 변경 기록에 남는다.
- 상위 차단 키를 누르면 키 조회로 가서 상태 카드가 나오고, 변경 기록에 키 조회가 남는다.
- `user/user`로 로그인하면 키 조회, 변경 기록 메뉴가 없고, 상위 차단 키가 가려지고, 규칙이 읽기 전용이다.
- 다크 모드와 언어 전환이 동작한다.

- [ ] **Step 4: Commit**

```bash
git add docker/demo-events.js README.md README.ko.md fluxgate-studio-ui-nextjs/README.md
git commit -m "docs: describe the monitoring console and add demo decisions"
```

---

## 자체 점검

- 설계 5.2 API 목록: Task 3(overview, timeseries, top-rejected, me), Task 5(keys), Task 6(audit). 빠짐 없음.
- 설계 5.3 캐시와 `maxTimeMS`: Task 1 `TtlCache`, Task 2 `maxTime`.
- 설계 5.4 인덱스와 끄는 설정: Task 2 `ensureIndexes`, `monitoringIndexes`.
- 설계 5.5 키 조회 순서와 상태 3가지: Task 5 테스트 `recordsTheLookupBeforeReadingHistory`, `derivesTheStatusFromTheLastDecision`.
- 설계 5.6 감사 기록 동작 9가지와 실패 정책: Task 4.
- 설계 5.7 마스킹: Task 1.
- 설계 6.x 화면: Task 9에서 12.
- 설계 7 오류 처리: 503(Task 2, 5), 400(Task 1, 3, 6), 409 문구(Task 11), 감사 실패 배너(Task 8, 9), 401과 403(Task 9).
- 설계 8 테스트: 각 Task의 테스트.
- 설계 9의 구현 전 확인 두 가지는 코드 작업이 아니라 Task 13 실행 확인 때 같이 본다.
