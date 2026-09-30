# FluxGate Studio UI

Next.js admin console for FluxGate rate limit rules. See the [repository README](../README.md) for
the full stack setup.

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign in through Keycloak with `admin/admin`
(full access) or `user/user` (read-only).

## How the API is called

All requests go through the Next.js route handler at `src/app/api/proxy/[...path]/route.ts`
(backend-for-frontend). The browser sends only its NextAuth session cookie; the route handler reads
the Keycloak access token server-side and adds the `Authorization` header. The token is deliberately
kept out of the session object so `/api/auth/session` cannot leak it to client-side JavaScript.

`src/lib/api.ts` therefore targets `/api/proxy/api/...` and never touches a token.

The route handler is also the only place that decides *which* Admin API paths the browser can reach:

- `ALLOWED_PREFIXES` is a prefix allow-list (`api/rules`, `api/dashboard`).
- Every path segment is validated before the path is joined. Next.js URL-decodes `[...path]`, so
  `%2e%2e` arrives as `..`; a segment that is empty, `.`, `..`, or contains `/` or `\` is answered
  with `404`. Without that, `fetch`'s own `..` normalisation would walk out of the allow-list.
- The assembled URL is checked again: its origin must be the Admin API origin and its path must still
  be allow-listed.
- Only `GET`, `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE` are relayed; anything else gets `405`.
- Request bodies are capped at 1 MB (`413`), checked against `content-length` and against the measured
  payload, because App Router route handlers have no implicit limit.
- The client's own `Authorization` and `Cookie` headers are never forwarded.

## Security headers

`next.config.ts` sets these on every response: `X-Frame-Options: DENY`,
`Content-Security-Policy: frame-ancestors 'none'`, `X-Content-Type-Options: nosniff` and
`Referrer-Policy: strict-origin-when-cross-origin`. The console performs destructive admin actions
with a session cookie, so framing is denied outright. Verify them with `curl -I` after a deployment - a
reverse proxy in front of the UI can strip or override response headers.

## Environment

```env
ADMIN_API_URL=http://localhost:8090
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key
KEYCLOAK_CLIENT_ID=fluxgate-studio
KEYCLOAK_CLIENT_SECRET=fluxgate-studio-secret
KEYCLOAK_ISSUER=http://localhost:18080/realms/fluxgate
```

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Development server |
| `npm run build` | Production build (`output: 'standalone'`, used by the Dockerfile) |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest - server-side units, today the BFF proxy route handler |
| `npm run format` / `format:check` | Prettier |

## Known gaps

- **Multi-environment (dev/stage/prod) switching is not supported.** The unused `EnvSwitcher`
  component was removed instead of being left as decorative UI. Reintroducing it needs a backend
  concept first: an `environment` field on the rule DTOs plus per-environment MongoDB collections or
  namespaces.
- **No i18n.** All copy is hardcoded English; `next-intl` would be the natural addition.
- `middleware.ts` still uses the file convention that Next 16.3 deprecates in favour of `proxy.ts`.
  It is kept because `next-auth` v4's `withAuth` targets `middleware.ts`; migrate together with the
  NextAuth upgrade.
