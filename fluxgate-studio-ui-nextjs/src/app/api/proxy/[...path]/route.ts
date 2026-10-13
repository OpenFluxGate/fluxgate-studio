import { type NextRequest, NextResponse } from 'next/server';

import { backendSession } from '@/lib/backend-session';

/**
 * Backend-for-frontend proxy.
 *
 * The Keycloak access token never leaves the server: the browser calls `/api/proxy/...` with its
 * NextAuth session cookie, this handler refreshes it once through the real NextAuth callbacks,
 * persists the encrypted cookie, then forwards the request to the Admin API with an
 * `Authorization` header. The token is deliberately absent from the session object so that
 * `/api/auth/session` cannot leak it to client-side JavaScript.
 */
const API_BASE_URL =
  process.env.ADMIN_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8090';

/**
 * Parsed form of {@link API_BASE_URL}. A malformed value fails loudly when the module is loaded
 * rather than silently turning every proxied request into a 502.
 */
const API_BASE = new URL(API_BASE_URL);

/** Base path of the Admin API, always with a trailing slash so it can be used as a URL base. */
const API_BASE_PATH = API_BASE.pathname.endsWith('/') ? API_BASE.pathname : `${API_BASE.pathname}/`;

/** Only the Admin API surface the console needs is reachable through the proxy. */
const ALLOWED_PREFIXES = ['api/rules', 'api/dashboard'];

/**
 * Request headers that are forwarded upstream (everything else is dropped).
 *
 * `authorization` and `cookie` must never appear here: the only credential the Admin API may see is
 * the server-side access token resolved below. {@link BLOCKED_REQUEST_HEADERS} enforces that even if
 * this list is extended carelessly later.
 */
const FORWARDED_REQUEST_HEADERS = ['content-type', 'if-match', 'accept'];

/** Client supplied credentials that are never forwarded, whatever the allow-list says. */
const BLOCKED_REQUEST_HEADERS = ['authorization', 'cookie'];

/** Response headers that are handed back to the browser. */
const FORWARDED_RESPONSE_HEADERS = ['content-type', 'etag', 'content-disposition'];

/**
 * Methods the proxy accepts. `HEAD` is included because the App Router answers `HEAD` with the `GET`
 * handler; everything else is rejected with 405 instead of being relayed.
 */
const ALLOWED_METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'];

const METHODS_WITH_BODY = ['POST', 'PUT', 'PATCH'];

/** Hard cap on a proxied request body. App Router route handlers have no implicit limit. */
const MAX_BODY_BYTES = 1_000_000;

function isAllowed(path: string): boolean {
  return ALLOWED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/**
 * Rejects every segment that could escape the allow-list once the path is joined.
 *
 * Next.js URL-decodes `[...path]` before handing it over, so `%2e%2e` arrives as `..` and `%2f` as
 * `/`. Checking only the joined string would leave the normalisation that `fetch` performs on `..`
 * free to walk out of the allow-listed prefixes (`api/rules/../../actuator/metrics` resolves to
 * `/actuator/metrics`), so the segments are validated individually.
 */
function hasInvalidSegment(segments: string[]): boolean {
  return segments.some(
    (segment) =>
      segment === '' ||
      segment === '.' ||
      segment === '..' ||
      segment.includes('/') ||
      segment.includes('\\')
  );
}

/**
 * Returns the assembled path relative to the Admin API base, or `null` when the assembled URL left
 * the backend origin or the base path. Second line of defence behind {@link hasInvalidSegment}.
 */
function resolveTargetPath(target: URL): string | null {
  if (target.origin !== API_BASE.origin || !target.pathname.startsWith(API_BASE_PATH)) {
    return null;
  }
  return target.pathname.slice(API_BASE_PATH.length);
}

function errorResponse(status: number, message: string): NextResponse {
  return NextResponse.json({ status, message }, { status });
}

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  if (!ALLOWED_METHODS.includes(request.method)) {
    return errorResponse(405, `Method ${request.method} is not supported.`);
  }

  const { accessToken, cookies } = await backendSession(request);
  const withCookies = (response: NextResponse) => {
    for (const cookie of cookies) response.headers.append('Set-Cookie', cookie);
    return response;
  };
  if (!accessToken) {
    return withCookies(errorResponse(401, 'Session expired. Please sign in again.'));
  }

  const { path } = await context.params;
  const segments = path ?? [];
  if (hasInvalidSegment(segments)) {
    return withCookies(errorResponse(404, 'Unknown API path'));
  }

  const targetPath = segments.join('/');
  if (!isAllowed(targetPath)) {
    return withCookies(errorResponse(404, `Unknown API path: /${targetPath}`));
  }

  const target = new URL(
    `${targetPath}${request.nextUrl.search}`,
    `${API_BASE.origin}${API_BASE_PATH}`
  );
  const resolvedPath = resolveTargetPath(target);
  if (resolvedPath === null || !isAllowed(resolvedPath)) {
    return withCookies(errorResponse(404, 'Unknown API path'));
  }

  let body: string | undefined;
  if (METHODS_WITH_BODY.includes(request.method)) {
    const declared = Number(request.headers.get('content-length') ?? '0');
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      return withCookies(errorResponse(413, 'Request body too large.'));
    }
    body = await request.text();
    // content-length is client supplied, so the actual payload is measured as well.
    if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
      return withCookies(errorResponse(413, 'Request body too large.'));
    }
  }

  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    if (BLOCKED_REQUEST_HEADERS.includes(name)) {
      continue;
    }
    const value = request.headers.get(name);
    if (value) {
      headers.set(name, value);
    }
  }
  // Set last: the only credential the Admin API sees is the server-side access token.
  headers.set('Authorization', `Bearer ${accessToken}`);

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body,
      cache: 'no-store',
    });
  } catch (error) {
    console.error('Admin API is unreachable', error);
    return withCookies(errorResponse(502, 'The Admin API is unreachable.'));
  }

  const responseHeaders = new Headers();
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) {
      responseHeaders.set(name, value);
    }
  }

  if (upstream.status === 204) {
    return withCookies(new NextResponse(null, { status: 204, headers: responseHeaders }));
  }

  return withCookies(
    new NextResponse(await upstream.text(), {
      status: upstream.status,
      headers: responseHeaders,
    })
  );
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
