# 판정 이벤트 조회 · 0.5.0 후보

[English](decision-event-explorer.md)

서비스의 `MongoRateLimitMetricsRecorder`가 작성한 이력을 ADMIN 전용
`GET /api/events`로 조회한다. 서비스의 `fluxgate.mongo.event-collection`과
Studio의 `fluxgate.studio.monitoring.event-collection`은 같은 컬렉션을
가리켜야 한다. Studio 기본값은 규칙 DB의 `rate_limit_events`이며
`fluxgate.studio.monitoring.event-database`로 DB를 지정할 수 있다.

- `from` 이상, `to` 미만의 epoch 밀리초를 전달한다. 기간은 최대 24시간,
  `limit`은 1~100, 선택 필터 `outcome`은 `ALLOW` 또는 `REJECT`다.
- 결과는 `timestamp`, ObjectId `_id` 내림차순이다. 다음 페이지에서는
  `nextCursor`와 같은 기간·결과 필터를 사용한다. 필터를 바꾸면 처음부터 조회한다.
  고정 종료 시각 안에서도 지연 적재, TTL 만료, 삭제에 따라 후속 페이지가 달라질 수 있다.
- 필수 타입은 정수 timestamp, 불리언 allowed, ObjectId다. 다른 타입의 행은
  제외한다. 토큰과 재시도 밀리초는 BSON int32·int64만 허용하고 다른 타입이나
  누락은 null로 반환한다. 규칙 ID는 최대 256 코드포인트다. IP, 사용자 ID,
  API 키, endpoint, 요청 헤더와 임의 속성은 응답에서 제외한다.
- API 서버가 ADMIN 권한을 검사한다. 페이지 크기보다 하나 더 조회해 후속 페이지를
  판단한다. Mongo가 검사하는 원본 행 수는 훨씬 많을 수 있다.
- MongoDB 드라이버는 서버 선택, 연결 풀 대기, 쿼리 실행, 커서 읽기에 최대 5초의
  조회 예산을 적용한다. 기존 드라이버 작업 제한이 더 짧으면 그 값을 유지한다.
  디스크 정렬을 금지하며 DB 장애 시 HTTP 503을 반환한다. HTTP 처리에는 별도 시간이 걸릴 수 있다.
  빈 페이지의 원인은 적재 비활성화, 샘플링, 지연, 드롭, 보관 기간 만료일 수 있다.

## 공용 DB의 조회 인덱스

DB 담당자는 서비스가 쓰는 DB와 컬렉션의 기존 인덱스를 확인하고 인덱스 구축의
저장 공간과 쓰기 비용을 검토한다. 기본 컬렉션이라면 해당 DB를 선택한 mongosh에서
아래 명령으로 확인·생성할 수 있다.

```javascript
const events = db.getCollection("rate_limit_events");
events.getIndexes();
events.createIndex({timestamp: -1, _id: -1});
events.createIndex({allowed: 1, timestamp: -1, _id: -1});
```

조회 API는 인덱스나 TTL을 수정하지 않는다. 기존 모니터링 시작 시 인덱스 생성을
끄려면 `FLUXGATE_EVENT_CREATE_INDEXES=false`를 지정한다. 두 조회용 인덱스는
담당자가 별도로 준비한다. 결과 필터 유무와 첫 페이지·후속 페이지별로
executionStats에서 선택 인덱스, blocking SORT, 반환 행 대비 검사 키·문서 수와
지연을 확인한다. timestamp 단독 인덱스에서는 구간 전체를 읽을 수 있다.
커서는 시각 상한을 인덱스 조건에 명시한다. 같은 밀리초에 집중된 데이터와
비정상 문서가 많으면 추가 검사량이 증가할 수 있다.

Studio UI와 API는 같은 계약을 지원하는 버전을 함께 배포한다.
