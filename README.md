# FluxGate Studio

**FluxGate Studio** is a web-based administration platform for managing rate limit rules in [FluxGate](https://github.com/openfluxgate/fluxgate) distributed rate limiting system.

[한국어](README.ko.md)

This repository owns `fluxgate-studio-admin-api` and `fluxgate-studio-ui-nextjs`. It uses the engine and MongoDB repository supplied by the separate FluxGate core repository. The Envoy authorization service belongs to the core repository. Draft rule editing and immutable-policy publication are separate operations; see [deploy/README.md](deploy/README.md) for the paired LTS / Envoy build contract and publication API. Local Git worktree names are development checkout names, not product components.

> **🚀 Live Demo** - Try FluxGate without installation:
>
> | Demo | Description | Link |
> |------|-------------|------|
> | **FluxGate Studio** | Admin UI for rate limit rule management | [Open Demo](https://port-next-fluxgate-studio-demo-mjdyw2g80a39ae78.sel3.cloudtype.app/) |
> | **FluxGate API** | Rate limiting API with Swagger UI | [Open Swagger](https://port-0-fluxgate-demo-mjdyw2g80a39ae78.sel3.cloudtype.app/swagger-ui/index.html) |


## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────┐
│  FluxGate       │     │  FluxGate Studio │     │  Keycloak   │
│  Studio UI      │────▶│  Admin API       │────▶│  (Auth)     │
│  (Next.js)      │     │  (Spring Boot)   │     │             │
└─────────────────┘     └──────────────────┘     └─────────────┘
                               │
                               ▼
                        ┌─────────────┐
                        │  MongoDB    │
                        │  (Rules)    │
                        └─────────────┘
```

## Features

- **Rule Management**: Create, update, delete, and toggle rate limit rules
- **Dashboard**: Real-time statistics and overview of all rules
- **Authentication**: OAuth2/OIDC integration with Keycloak
- **Dark/Light Theme**: Customizable UI theme
- **Rule Simulation**: Test rate limit rules before deployment

## Tech Stack

### Frontend (fluxgate-studio-ui-nextjs)
- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- NextAuth.js (Keycloak OAuth2)

### Backend (fluxgate-studio-admin-api)
- Spring Boot 3.3
- Spring Security OAuth2 Resource Server
- FluxGate Core Library
- MongoDB

### Infrastructure
- Keycloak (Identity Provider)
- MongoDB (Rule Storage)
- Docker Compose

## Quick Start

### Prerequisites

- Node.js 18+
- Java 21+
- Docker & Docker Compose
- Maven

### Option A - the whole stack with Docker Compose

```bash
# Keycloak + MongoDB + Redis + Admin API + UI
docker compose up --build
```

Before the first run, add this line to your hosts file so the browser and the containers agree on
the Keycloak URL (the access token `iss` claim has to match what the Admin API validates):

```
127.0.0.1 keycloak
```

Then open `http://localhost:3000` and sign in with `admin/admin` (full access) or `user/user`
(read-only). See the comments at the top of `docker-compose.yml` for details.

The Admin API container runs with `SPRING_PROFILES_ACTIVE=dev`. That profile exists only so the
shipped defaults can be the safe ones: the bundled dev realm has no audience protocol mapper for this
API, and Swagger UI has to read `/api-docs` without a token. It relaxes exactly those two settings and
logs a `WARN` for each at startup. Never activate it in a deployment - see
[Production checklist](#production-checklist).

### Option B - run the services yourself

#### 1. Start Infrastructure

```bash
cd docker

# Start Keycloak only
docker compose -f key-cloak.yml up -d
```

MongoDB and Redis come from the root `docker-compose.yml`:

```bash
docker compose up -d mongo redis
```

#### 2. Start Admin API

```bash
cd fluxgate-studio-admin-api

# Build
./mvnw clean package -DskipTests

# Run against the local Keycloak dev realm
./mvnw spring-boot:run -Dspring-boot.run.profiles=dev
```

The API will be available at `http://localhost:8090`. Without `-Dspring-boot.run.profiles=dev` the
safe defaults apply, and the dev realm's tokens are rejected with `401` because they carry no
`fluxgate-studio-admin-api` audience.

#### 3. Start UI

```bash
cd fluxgate-studio-ui-nextjs

# Install dependencies
npm install

# Development mode
npm run dev

# Or production build
npm run build
npm run start
```

The UI will be available at `http://localhost:3000`

## Configuration

### Environment Variables

#### UI (.env.local)

```env
# Admin API base URL. Server-side only: the browser talks to the Next.js route handler at
# /api/proxy/**, which attaches the Keycloak access token (BFF pattern), so the token never
# reaches client-side JavaScript.
ADMIN_API_URL=http://localhost:8090

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

### Keycloak Setup

The included `docker/fluxgate-realm.json` creates:

- **Realm**: `fluxgate`
- **Client**: `fluxgate-studio` (confidential)
- **Users**:

  | Username | Password | Roles |
  |----------|----------|-------|
  | admin | admin | admin, user |
  | user | user | user |

Access Keycloak Admin Console at `http://localhost:18080/admin` (admin/admin)

## API Endpoints

Reads require `ROLE_USER` or `ROLE_ADMIN`; every mutating endpoint requires `ROLE_ADMIN`.

| Verb | Path | Role | Purpose |
|------|------|------|---------|
| GET | `/api/dashboard/stats` | user, admin | Rule counters (computed with MongoDB `countDocuments`) |
| GET | `/api/rules` | user, admin | List rules; optional `ruleSetId` filter |
| GET | `/api/rules?page=&size=` | user, admin | Same, as a page envelope `{content, page, size, totalElements}` |
| GET | `/api/rules/{id}` | user, admin | Read a single rule |
| GET | `/api/rules/export` | user, admin | Download every rule as a JSON array |
| POST | `/api/rules/{id}/simulate` | user, admin | Read-only dry-run over the rule bands |
| POST | `/api/rules` | admin | Create a rule |
| POST | `/api/rules/import` | admin | Upsert a batch of rules (at most 500 per request) |
| PUT | `/api/rules/{id}` | admin | Replace a rule (requires `version` or `If-Match`) |
| PATCH | `/api/rules/{id}/toggle` | admin | Toggle enabled/disabled (compare-and-set, `409` on a concurrent edit) |
| DELETE | `/api/rules/{id}` | admin | Delete a rule |
| DELETE | `/api/rules?ruleSetId=` | admin | Delete every rule of a rule set |

### Pagination

`GET /api/rules` returns a plain JSON array when neither `page` nor `size` is supplied, which keeps
existing clients working. As soon as one of them is present the response becomes the page envelope
`{content, page, size, totalElements}`. `size` defaults to 50 and is capped at 200.

### Optimistic locking

Every rule carries a `version`. `PUT /api/rules/{id}` requires the version that was read before
editing, either as the `version` body field or as an `If-Match` header (the bare number or the
quoted ETag that the API returns). A stale version is answered with `409 Conflict` and an error body
listing `expectedVersion` and `actualVersion`, so concurrent edits are rejected rather than silently
overwritten.

`PATCH /api/rules/{id}/toggle` takes no version from the client - it reads the rule and writes it back
through the same compare-and-set - but it fails the same way with `409 Conflict` when another writer
changed the rule in between, instead of losing that change.

### API Documentation
- Swagger UI: `http://localhost:8090/swagger-ui.html` (disabled in the `prod` profile)
- OpenAPI JSON: `http://localhost:8090/api-docs`

The OpenAPI document describes the whole admin surface, so `/api-docs/**` requires `ROLE_USER` or
`ROLE_ADMIN`. `fluxgate.studio.security.public-api-docs` opens it up for anonymous readers; it
defaults to `false` and is only set to `true` by the `dev` profile, so that Swagger UI works locally.

## Production checklist

Everything the shipped defaults cannot decide for you. Walk this list before exposing the Studio
outside a laptop.

| # | Check | Where |
|---|-------|-------|
| 1 | `SPRING_PROFILES_ACTIVE=prod` - or at the very least **not** `dev`. The `dev` profile disables audience validation and opens `/api-docs`, and says so with a `WARN` at startup. | Admin API environment |
| 2 | JWT audience validation on (`fluxgate.studio.security.validate-audience=true`, the default) **and** an `audience` protocol mapper on the Keycloak client that puts `fluxgate-studio-admin-api` into the token's `aud` claim. Without the mapper every request is a `401`; without validation a token minted for any other client of the same realm is accepted. | `application-prod.yml`, Keycloak client |
| 3 | Swagger UI off (`springdoc.swagger-ui.enabled=false`, set by the `prod` profile). | `application-prod.yml` |
| 4 | OpenAPI document behind authentication (`fluxgate.studio.security.public-api-docs=false`, the default): `/api-docs/**` then requires `ROLE_USER` or `ROLE_ADMIN`. | `application-prod.yml` |
| 5 | CORS: `CORS_ALLOWED_ORIGINS` lists the real UI origins, never `*`. The application fails to start on `*` together with `allow-credentials=true`. | Admin API environment |
| 6 | `fluxgate.mongo.ddl-auto=validate` so the application never creates collections or indexes implicitly. | `application-prod.yml` |
| 7 | Every secret injected from the environment: `FLUXGATE_MONGO_URI`, `FLUXGATE_REDIS_URI`, `NEXTAUTH_SECRET`, `KEYCLOAK_CLIENT_SECRET`. No defaults from the dev realm survive into a deployment. | both services |
| 8 | Actuator: only `health,info,metrics` exposed and `management.endpoint.health.show-details=when_authorized` (health details name the internal Redis/Mongo hosts). | `application-prod.yml` |
| 9 | UI security headers served on every response: `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`. Check them with `curl -I` against the deployed UI, because a reverse proxy can strip or override them. | `fluxgate-studio-ui-nextjs/next.config.ts` |
| 10 | BFF proxy allow-list unchanged, or extended by the rules below. | `fluxgate-studio-ui-nextjs/src/app/api/proxy/[...path]/route.ts` |

### Extending the BFF proxy allow-list

`ALLOWED_PREFIXES` in the proxy route is the only control that limits which part of the Admin API the
browser can reach, so it has to stay a prefix allow-list over validated segments:

- Add **prefixes**, never a catch-all. `api/rules` and `api/dashboard` match themselves and anything
  below them; an empty prefix would match everything.
- Keep the per segment validation. Next.js URL-decodes `[...path]` before the handler sees it, so
  `%2e%2e` arrives as `..` and `%2f` as `/`; a joined-string check alone is defeated by the `..`
  normalisation that `fetch` performs (`api/rules/%2e%2e/%2e%2e/actuator/metrics` would resolve to
  `/actuator/metrics`). Every segment that is empty, `.`, `..`, or contains `/` or `\` is rejected
  with a `404`.
- Keep the second check on the assembled URL: its `origin` must equal the Admin API origin and its
  path must still be inside the allow-list after normalisation.
- Never widen the forwarded request headers to include `authorization` or `cookie`. The only
  credential the Admin API may see is the access token the route handler reads server-side.
- The body cap (1 MB, `413` on both `content-length` and the measured payload) applies to every
  method with a body. Raise it deliberately, not by accident.
- `src/app/api/proxy/[...path]/route.test.ts` covers traversal, backslashes, the body cap and the
  happy path. Extend it together with the allow-list (`npm test`).

## Development

### UI Development

```bash
cd fluxgate-studio-ui-nextjs

# Type check
npm run typecheck

# Lint
npm run lint

# Format
npm run format

# Unit tests (BFF proxy route handler)
npm test
```

#### Multi-environment support

> **TODO:** there is no environment (dev/stage/prod) concept in FluxGate Studio. The unused
> `EnvSwitcher` component was removed rather than left as decorative UI; reintroducing it requires a
> backend concept first (an `environment` field on the rule DTOs plus per-environment MongoDB
> collections or namespaces).

### API Development

```bash
cd fluxgate-studio-admin-api

# Compile
./mvnw compile

# Test
./mvnw test

# Format code
./mvnw spotless:apply
```

## Project Structure

```
fluxgate-studio/
├── fluxgate-studio-ui-nextjs/     # Next.js Frontend
│   ├── src/
│   │   ├── app/                   # App Router pages
│   │   ├── components/            # Shared components
│   │   ├── lib/                   # API client, auth config
│   │   └── modules/admin/         # Admin dashboard module
│   └── package.json
│
├── fluxgate-studio-admin-api/     # Spring Boot Backend
│   ├── src/main/java/
│   │   └── org/fluxgate/studio/admin/
│   │       ├── config/            # Security, OpenAPI config
│   │       ├── controller/        # REST controllers
│   │       ├── service/           # Business logic
│   │       ├── dto/               # Request/Response DTOs
│   │       └── exception/         # Custom exceptions
│   └── pom.xml
│
├── docker/
│   ├── key-cloak.yml              # Keycloak-only Docker Compose (development template)
│   └── fluxgate-realm.json        # Keycloak realm config (development template)
│
└── docker-compose.yml             # Full stack: Keycloak + MongoDB + Redis + Admin API + UI
```

## License

MIT License - see [LICENSE](LICENSE) for details.

## Related Projects

- [FluxGate](https://github.com/openfluxgate/fluxgate) - Distributed Rate Limiting Engine
