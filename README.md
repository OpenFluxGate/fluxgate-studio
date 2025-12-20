# FluxGate Studio

**FluxGate Studio** is a web-based administration platform for managing rate limit rules in [FluxGate](https://github.com/openfluxgate/fluxgate) distributed rate limiting system.

[한국어](README.ko.md)

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

### 1. Start Infrastructure

```bash
cd docker

# Start Keycloak
docker compose -f key-cloak.yml up -d

# Start MongoDB (if not using existing)
docker compose -f mongodb.yml up -d
```

### 2. Start Admin API

```bash
cd fluxgate-studio-admin-api

# Build
./mvnw clean package -DskipTests

# Run
./mvnw spring-boot:run
```

The API will be available at `http://localhost:8090`

### 3. Start UI

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

### Dashboard
- `GET /api/dashboard/stats` - Get dashboard statistics

### Rules
- `GET /api/rules` - List all rules
- `GET /api/rules/{id}` - Get rule by ID
- `POST /api/rules` - Create new rule
- `PUT /api/rules/{id}` - Update rule
- `DELETE /api/rules/{id}` - Delete rule
- `PATCH /api/rules/{id}/toggle` - Toggle rule enabled/disabled

### API Documentation
- Swagger UI: `http://localhost:8090/swagger-ui.html`
- OpenAPI JSON: `http://localhost:8090/api-docs`

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
```

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
└── docker/
    ├── key-cloak.yml              # Keycloak Docker Compose
    └── fluxgate-realm.json        # Keycloak realm config
```

## License

MIT License - see [LICENSE](LICENSE) for details.

## Related Projects

- [FluxGate](https://github.com/openfluxgate/fluxgate) - Distributed Rate Limiting Engine
