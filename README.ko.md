# FluxGate Studio

**FluxGate Studio**는 [FluxGate](https://github.com/openfluxgate/fluxgate) 분산 Rate Limiting 시스템의 규칙을 관리하기 위한 웹 기반 관리 플랫폼입니다.

[English](README.md)

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

- **규칙 관리**: Rate Limit 규칙 생성, 수정, 삭제, 활성화/비활성화
- **대시보드**: 실시간 통계 및 전체 규칙 현황
- **인증**: Keycloak OAuth2/OIDC 연동
- **다크/라이트 테마**: 사용자 맞춤 UI 테마
- **규칙 시뮬레이션**: 배포 전 Rate Limit 규칙 테스트

## 기술 스택

### 프론트엔드 (fluxgate-studio-ui-nextjs)
- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- NextAuth.js (Keycloak OAuth2)

### 백엔드 (fluxgate-studio-admin-api)
- Spring Boot 3.3
- Spring Security OAuth2 Resource Server
- FluxGate Core 라이브러리
- MongoDB

### 인프라
- Keycloak (인증 서버)
- MongoDB (규칙 저장소)
- Docker Compose

## 빠른 시작

### 사전 요구사항

- Node.js 18+
- Java 21+
- Docker & Docker Compose
- Maven

### 1. 인프라 시작

```bash
cd docker

# Keycloak 시작
docker compose -f key-cloak.yml up -d

# MongoDB 시작 (기존 것이 없는 경우)
docker compose -f mongodb.yml up -d
```

### 2. Admin API 시작

```bash
cd fluxgate-studio-admin-api

# 빌드
./mvnw clean package -DskipTests

# 실행
./mvnw spring-boot:run
```

API는 `http://localhost:8090`에서 접근 가능합니다.

### 3. UI 시작

```bash
cd fluxgate-studio-ui-nextjs

# 의존성 설치
npm install

# 개발 모드
npm run dev

# 또는 프로덕션 빌드
npm run build
npm run start
```

UI는 `http://localhost:3000`에서 접근 가능합니다.

## 설정

### 환경 변수

#### UI (.env.local)

```env
NEXT_PUBLIC_API_URL=http://localhost:8090

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key

# Keycloak
KEYCLOAK_CLIENT_ID=fluxgate-studio
KEYCLOAK_CLIENT_SECRET=fluxgate-studio-secret
KEYCLOAK_ISSUER=http://localhost:18080/realms/fluxgate
```

#### Admin API (application.yml)

```yaml
spring:
  security:
    oauth2:
      resourceserver:
        jwt:
          issuer-uri: http://localhost:18080/realms/fluxgate

fluxgate:
  mongo:
    enabled: true
    uri: mongodb://localhost:27017/fluxgate
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

Keycloak 관리 콘솔: `http://localhost:18080/admin` (admin/admin)

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

### API 문서
- Swagger UI: `http://localhost:8090/swagger-ui.html`
- OpenAPI JSON: `http://localhost:8090/api-docs`

## 개발

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

- [FluxGate](https://github.com/openfluxgate/fluxgate) - 분산 Rate Limiting 엔진
