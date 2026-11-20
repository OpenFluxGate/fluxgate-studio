import { type NextRequest } from 'next/server';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { backendSession } from '@/lib/backend-session';

vi.mock('@/lib/backend-session', () => ({ backendSession: vi.fn() }));

const API_BASE = 'http://admin-api.test:8090';

process.env.ADMIN_API_URL = API_BASE;
process.env.NEXTAUTH_SECRET = 'test-secret';

const { DELETE, GET, POST, PUT } = await import('./route');

const fetchMock = vi.fn();

/**
 * Minimal stand-in for the parts of `NextRequest` the handler touches. Building a real one would
 * pull the whole Next server runtime into a unit test without testing anything more.
 */
function requestFor(
  method: string,
  search = '',
  headers: Record<string, string> = {},
  body = ''
): NextRequest {
  return {
    method,
    headers: new Headers(headers),
    nextUrl: { search },
    text: async () => body,
  } as unknown as NextRequest;
}

function contextFor(path: string[]) {
  return { params: Promise.resolve({ path }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(
    new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })
  );
  vi.mocked(backendSession).mockResolvedValue({ accessToken: 'server-side-token', cookies: [] });
});

describe('BFF proxy route', () => {
  it.each([
    [['api', 'monitoring', 'overview'], '/api/monitoring/overview'],
    [['api', 'keys', 'decisions'], '/api/keys/decisions'],
    [['api', 'audit'], '/api/audit'],
    [['api', 'me'], '/api/me'],
    [['api', 'settings', 'menus'], '/api/settings/menus'],
  ])('forwards the console path %j', async (segments, expected) => {
    const response = await GET(requestFor('GET'), contextFor(segments));

    expect(response.status).toBe(200);
    const [target] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(target.pathname).toBe(expected);
  });

  it('forwards the versioned menu policy update and preserves conflicts', async () => {
    const path = ['api', 'settings', 'menus'];
    const body = '{"version":1,"admin":["settings"],"user":["rules"]}';
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 409 }));

    const response = await PUT(
      requestFor('PUT', '', { 'content-type': 'application/json' }, body),
      contextFor(path)
    );

    expect(response.status).toBe(409);
    expect(fetchMock).toHaveBeenCalledWith(
      new URL(`${API_BASE}/api/settings/menus`),
      expect.objectContaining({ method: 'PUT', body, cache: 'no-store' })
    );
  });

  it('restricts menu policy forwarding to its exact path and methods', async () => {
    const segments = ['api', 'settings', 'menus'];
    expect((await GET(requestFor('GET'), contextFor([...segments, 'details']))).status).toBe(404);
    expect((await POST(requestFor('POST'), contextFor(segments))).status).toBe(405);
    expect(fetchMock).not.toHaveBeenCalled();
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

  it('forwards an allow-listed path to the Admin API with the server-side token', async () => {
    const response = await GET(
      requestFor('GET', '?page=0', { authorization: 'Bearer client-forged', cookie: 'a=b' }),
      contextFor(['api', 'rules'])
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [target, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(target.toString()).toBe(`${API_BASE}/api/rules?page=0`);

    const headers = new Headers(init.headers);
    // Only the server-side token is forwarded; the client's own credentials are dropped.
    expect(headers.get('authorization')).toBe('Bearer server-side-token');
    expect(headers.get('cookie')).toBeNull();
  });

  it('rejects %2e%2e path traversal, which Next.js decodes into ".." segments', async () => {
    const response = await GET(
      requestFor('GET'),
      // /api/proxy/api/rules/%2e%2e/%2e%2e/actuator/metrics
      contextFor(['api', 'rules', '..', '..', 'actuator', 'metrics'])
    );

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a segment containing a backslash', async () => {
    const response = await GET(
      requestFor('GET'),
      contextFor(['api', 'rules', '..\\..\\actuator', 'metrics'])
    );

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an encoded slash inside a segment', async () => {
    const response = await GET(requestFor('GET'), contextFor(['api', 'rules/../../actuator']));

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a path outside the allow-list', async () => {
    const response = await GET(requestFor('GET'), contextFor(['actuator', 'metrics']));

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a body larger than the cap declared by content-length', async () => {
    const response = await POST(
      requestFor('POST', '', { 'content-length': '2000000' }),
      contextFor(['api', 'rules'])
    );

    expect(response.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a body larger than the cap when content-length understates it', async () => {
    const response = await POST(
      requestFor('POST', '', { 'content-length': '10' }, 'x'.repeat(1_000_001)),
      contextFor(['api', 'rules'])
    );

    expect(response.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a method that is not on the allow-list', async () => {
    const response = await GET(requestFor('TRACE'), contextFor(['api', 'rules']));

    expect(response.status).toBe(405);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a request without a session', async () => {
    vi.mocked(backendSession).mockResolvedValue({ accessToken: undefined, cookies: [] });

    const response = await DELETE(requestFor('DELETE'), contextFor(['api', 'rules', 'rule-1']));

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a session without an access token', async () => {
    vi.mocked(backendSession).mockResolvedValue({ accessToken: undefined, cookies: [] });

    const response = await GET(requestFor('GET'), contextFor(['api', 'rules']));

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('read-only decision event surface', () => {
  it('allows the exact events GET and forwards the bounded filter string', async () => {
    const response = await GET(
      requestFor('GET', '?from=1&to=1000&limit=50'),
      contextFor(['api', 'events'])
    );
    expect(response.status).toBe(200);
    expect(fetchMock.mock.calls[0][0].search).toBe('?from=1&to=1000&limit=50');
  });
  it('denies event mutation before forwarding', async () => {
    expect((await POST(requestFor('POST'), contextFor(['api', 'events']))).status).toBe(405);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('does not open an arbitrary event subpath', async () => {
    expect((await GET(requestFor('GET'), contextFor(['api', 'events', 'raw']))).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
