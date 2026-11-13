# FluxGate Studio

**FluxGate Studio**는 [FluxGate](https://github.com/OpenFluxGate/openfluxgate-core) 분산 Rate Limiting 시스템의 규칙을 관리하기 위한 웹 기반 관리 플랫폼입니다.

[English](README.md)

이 저장소는 `fluxgate-studio-admin-api`와 `fluxgate-studio-ui-nextjs`를 담당합니다. 별도 FluxGate core 저장소가 제공하는 엔진·MongoDB repository를 사용하며 Envoy 판정 서비스는 core 저장소에 있습니다. draft 규칙 편집과 immutable policy의 게시는 별도 작업입니다. LTS / Envoy와 함께 사용하는 빌드 계약 및 게시 API는 [deploy/README.md](deploy/README.md)를 참고하세요. 로컬 Git worktree 이름은 개발용 checkout 이름이며 제품 구성요소가 아닙니다.

> **🚀 라이브 데모** - 설치 없이 바로 체험:
>
> | 데모 | 설명 | 링크 |
> |------|------|------|
> | **FluxGate Studio** | Rate Limit 규칙 관리를 위한 어드민 UI | [데모 열기](http://13.124.192.116:3000/) |
> | **FluxGate API** | Swagger UI가 포함된 Rate Limiting API | [Swagger 열기](http://13.124.192.116:8080/swagger-ui/index.html) |


## 아키텍처

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────┐
│  FluxGate       │     │  FluxGate Studio │     │  Keycloak   │
│  Studio UI      │────▶│  Admin API       │────▶│  (인증)      │
│  (Next.js)      │     │  (Spring Boot)   │     │             │
└─────────────────┘     └──────────────────┘     └─────────────┘
                               │
                               ▼
                        ┌─────────────┐
                        │  MongoDB    │
                        │  (규칙 저장) │
                        └─────────────┘
```

## 주요 기능

- **모니터링 콘솔**: 서비스가 남긴 판정 이력(`rate_limit_events`)으로 허용·차단 추이, 많이 차단된 키, 규칙 묶음별 마지막 판정을 보여 줍니다. Redis는 읽지 않습니다.
- **규칙 관리**: 규칙 묶음별 표, 한도의 실제 의미 문장(`60s·30`은 "처음 30회 연속, 이후 2초마다 1회"), 저장 전 바뀐 값 확인
- **키 조회**(admin): 특정 키가 지금 막혀 있는지, 언제 풀리는지, 최근 판정. 조회는 변경 기록에 먼저 남깁니다.
- **변경 기록**(admin): 누가 무엇을 만들고, 바꾸고, 지우고, 가져오고, 게시했는지와 누가 어떤 키를 조회했는지
- **인증**: Keycloak OAuth2/OIDC. `ROLE_USER`는 읽기(키는 마스킹), `ROLE_ADMIN`은 쓰기
- **라이트·다크**, 한국어·영어
- **규칙 시뮬레이션**: 규칙 구간에 몰아치는 요청을 미리 계산

## 기술 스택

### 프론트엔드 (fluxgate-studio-ui-nextjs)
- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- NextAuth.js (Keycloak OAuth2)

### 백엔드 (fluxgate-studio-admin-api)
- Spring Boot 3.5.16
- Spring Security OAuth2 Resource Server
- FluxGate Core 라이브러리
- MongoDB

### 인프라
- Keycloak (인증 서버)
- MongoDB (규칙 저장소)
- Docker Compose

## 빠른 시작

### 사전 요구사항

컨테이너 실행에는 BuildKit을 지원하는 Docker와 Docker Compose 2.17 이상이 필요합니다
([named build context](https://docs.docker.com/reference/compose-file/build/#additional_contexts)).
네이티브 개발에는 Java 21과 Node.js 22 LTS도 사용합니다. Maven은 `./mvnw`로 실행합니다.
별도 표시가 없는 명령은 **Studio 저장소 루트**에서 실행하세요.

### 옵션 A — Docker Compose

Admin API 이미지는 고정된 Git revision에서 짝이 맞는 core `0.5.0` 의존성을 빌드합니다.
호스트의 Maven 캐시나 사전에 설치한 core JAR은 필요하지 않습니다.
현재는 소스 준비 단계이며 LTS 서버·보안 지원 범위는 아직 확정하지 않았습니다.
배포 전에 [짝이 맞는 빌드와 보안 범위](deploy/README.md#paired-core-artifacts)를 확인하세요.

1. hosts 파일에 `127.0.0.1 keycloak`을 추가합니다. 토큰 검증을 위해 브라우저와 컨테이너의
   Keycloak issuer URL은 포트까지 같아야 합니다.
2. 전체 스택을 시작합니다.

```bash
docker compose up --build
```

`http://localhost:3000`에서 `admin/admin`(관리자) 또는 `user/user`(읽기 전용)로 로그인합니다.
Swagger는 `http://localhost:8090/swagger-ui.html`, Keycloak 관리는 `http://keycloak:8080/admin`입니다.
3000·8080·8090·18080·27017·6379 포트가 비어 있어야 합니다.

고정된 Git 소스 대신 짝이 맞는 로컬 core checkout을 사용하려면:

```bash
FLUXGATE_CORE_SOURCE=/absolute/path/to/core docker compose build admin-api
```

이 스택은 `dev` API 프로필, 공개된 로컬 예제 자격증명과 개발용 알림 서명 키를 사용합니다.
리로드 알림을 받는 Java SDK 서비스에는 같은 `FLUXGATE_CONTROL_SECRET` 값을 공급해야 합니다.
Envoy 게시 정책의 적용은 Mongo 활성 정책을 읽으므로 이 알림에 의존하지 않습니다.
배포 전에 개발 기본값을 교체하고 [운영 체크리스트](README.md#production-checklist)를 확인하세요.
`docker compose down`으로 중단하면 named volume의 데이터는 유지됩니다.

### 옵션 B — API·UI 네이티브 실행

먼저 [Paired core artifacts](deploy/README.md#paired-core-artifacts)의 안내대로 짝이 맞는 core를
별도 Maven 저장소에 빌드합니다. API 터미널에서 `FLUXGATE_M2_DIR`를 유지하세요.
공개된 0.3.7 artifact로 대신할 수 없습니다.

Studio 저장소 루트에서 시작합니다. hosts 설정은 옵션 A와 같습니다.

```bash
docker compose up -d keycloak mongo redis
cd fluxgate-studio-admin-api
export KEYCLOAK_ISSUER_URI=http://keycloak:8080/realms/fluxgate
export KEYCLOAK_JWK_SET_URI=http://keycloak:8080/realms/fluxgate/protocol/openid-connect/certs
export FLUXGATE_REDIS_URI=redis://localhost:6379
export FLUXGATE_CONTROL_SECRET=local-dev-notifier-secret-change-me
./mvnw -B -Dmaven.repo.local="$FLUXGATE_M2_DIR" clean verify spotless:check
./mvnw -Dmaven.repo.local="$FLUXGATE_M2_DIR" spring-boot:run -Dspring-boot.run.profiles=dev
```

다른 터미널의 Studio 저장소 루트에서 [UI 환경변수 예시](#ui-envlocal)를 참고하여
`fluxgate-studio-ui-nextjs/.env.local`을 만든 뒤 실행합니다.

```bash
cd fluxgate-studio-ui-nextjs
npm ci
npm run dev
```

API는 `http://localhost:8090`, UI는 `http://localhost:3000`입니다. 번들된 dev realm에는 API용 audience
mapper가 없어 로컬에서는 `dev` 프로필을 사용합니다. 운영 프로필은 audience 검증을 유지합니다.

## 설정

### 환경 변수

#### UI (.env.local)

```env
# 서버 전용. 브라우저는 /api/proxy/**를 호출하며 BFF가 토큰을 첨부합니다.
ADMIN_API_URL=http://localhost:8090

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key

# Keycloak
KEYCLOAK_CLIENT_ID=fluxgate-studio
KEYCLOAK_CLIENT_SECRET=fluxgate-studio-secret
KEYCLOAK_ISSUER=http://keycloak:8080/realms/fluxgate
```

#### Admin API (application.yml)

```yaml
spring:
  security:
    oauth2:
      resourceserver:
        jwt:
          issuer-uri: http://keycloak:8080/realms/fluxgate

fluxgate:
  mongo:
    enabled: true
    uri: mongodb://fluxgate:fluxgate123@localhost:27017/fluxgate?authSource=admin
    database: fluxgate
    rule-collection: rate_limit_rules
```

### Keycloak 설정

`docker/fluxgate-realm.json`에 포함된 설정:

- **Realm**: `fluxgate`
- **Client**: `fluxgate-studio` (confidential)
- **사용자**:
  | 사용자명 | 비밀번호 | 역할 |
  |----------|----------|-------|
  | admin | admin | admin, user |
  | user | user | user |

Keycloak 관리 콘솔: `http://keycloak:8080/admin` (admin/admin)

## API 엔드포인트

### 대시보드
- `GET /api/dashboard/stats` - 대시보드 통계 조회

### 규칙
- `GET /api/rules` - 전체 규칙 목록 조회
- `GET /api/rules/{id}` - ID로 규칙 조회
- `POST /api/rules` - 새 규칙 생성
- `PUT /api/rules/{id}` - 규칙 수정
- `DELETE /api/rules/{id}` - 규칙 삭제
- `PATCH /api/rules/{id}/toggle` - 규칙 활성화/비활성화 토글

### 모니터링, 키 조회, 변경 기록
- `GET /api/me` - 현재 사용자와 역할
- `GET /api/monitoring/overview?window=5m|1h|24h` - 전체와 규칙 묶음별 판정
- `GET /api/monitoring/timeseries?window=&ruleSetId=` - 구간별 허용·차단 건수
- `GET /api/monitoring/top-rejected?window=&ruleSetId=&limit=` - 많이 차단된 키, `ROLE_USER`에게는 마스킹
- `GET /api/keys/transforms` (admin) - 키 변환 목록
- `POST /api/keys/decisions` (admin) - 키 조회. 변경 기록에 먼저 남기고, 남기지 못하면 503
- `GET /api/audit` (admin) - 변경 기록 검색. 조회 입력값은 마스킹
- `GET /api/audit/{id}` (admin) - 변경 기록 한 건, 원문

규칙과 정책 변경은 성공한 뒤 변경 기록에 남깁니다. 기록에 실패하면 변경은 유지하고 응답에 `X-Studio-Audit: failed`를 붙이며, 콘솔이 경고를 띄웁니다.

설정은 `fluxgate.studio.monitoring.*`(이벤트 DB와 컬렉션, 인덱스 자동 생성, 캐시 10초, 쿼리 제한 5초, 키 변환)과 `fluxgate.studio.audit.*`(컬렉션, 보관 기간 기본 730일)입니다. 기동할 때 이벤트 컬렉션에 인덱스 세 개(`{timestamp: 1}`, `{ruleSetId: 1, timestamp: 1}`, `{userId: 1, timestamp: -1}`)를 만들고, 공용 DB에서는 `FLUXGATE_EVENT_CREATE_INDEXES=false`로 끄고 DBA에 요청합니다. UI 환경변수는 `NEXT_PUBLIC_DEFAULT_LOCALE`(기본 `en`)과 `NEXT_PUBLIC_EXTERNAL_DASHBOARD_URL`입니다.

로컬에서 데모 데이터(최근 2시간 판정)를 넣으려면:

```bash
docker cp docker/demo-events.js fluxgate-mongo:/tmp/demo-events.js
docker exec fluxgate-mongo mongosh --quiet -u fluxgate -p fluxgate123 --authenticationDatabase admin fluxgate --file /tmp/demo-events.js
```

### API 문서
- Swagger UI: `http://localhost:8090/swagger-ui.html` (`prod` 프로필에서는 비활성화)
- OpenAPI JSON: `http://localhost:8090/api-docs`

OpenAPI 문서는 관리 API 전체 스키마이므로 `/api-docs/**` 는 `ROLE_USER` 또는 `ROLE_ADMIN` 을
요구합니다. `fluxgate.studio.security.public-api-docs` 를 켜면 익명 접근이 허용되며, 기본값은
`false` 이고 `dev` 프로필만 `true` 로 설정합니다.

## 개발

아래 API 명령에는 빠른 시작에서 준비한 별도 저장소를 사용하도록 각 `./mvnw` 명령에
`-Dmaven.repo.local="$FLUXGATE_M2_DIR"`를 추가합니다.


### UI 개발

```bash
cd fluxgate-studio-ui-nextjs

# 타입 체크
npm run typecheck

# 린트
npm run lint

# 포맷
npm run format
```

### API 개발

```bash
cd fluxgate-studio-admin-api

# 컴파일
./mvnw compile

# 테스트
./mvnw test

# 코드 포맷
./mvnw spotless:apply
```

## 프로젝트 구조

```
fluxgate-studio/
├── fluxgate-studio-ui-nextjs/     # Next.js 프론트엔드
│   ├── src/
│   │   ├── app/                   # App Router 페이지
│   │   ├── components/            # 공통 컴포넌트
│   │   ├── lib/                   # API 클라이언트, 인증 설정
│   │   └── modules/admin/         # 관리자 대시보드 모듈
│   └── package.json
│
├── fluxgate-studio-admin-api/     # Spring Boot 백엔드
│   ├── src/main/java/
│   │   └── org/fluxgate/studio/admin/
│   │       ├── config/            # Security, OpenAPI 설정
│   │       ├── controller/        # REST 컨트롤러
│   │       ├── service/           # 비즈니스 로직
│   │       ├── dto/               # 요청/응답 DTO
│   │       └── exception/         # 커스텀 예외
│   └── pom.xml
│
└── docker/
    ├── key-cloak.yml              # Keycloak Docker Compose
    └── fluxgate-realm.json        # Keycloak realm 설정
```

## 라이선스

MIT License - 자세한 내용은 [LICENSE](LICENSE)를 참조하세요.

## 관련 프로젝트

- [FluxGate](https://github.com/OpenFluxGate/openfluxgate-core) - 분산 Rate Limiting 엔진
