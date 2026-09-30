import { type NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { getToken } from 'next-auth/jwt';

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }));
vi.mock('next-auth/jwt', () => ({ getToken: vi.fn() }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));

const API_BASE = 'http://admin-api.test:8090';

process.env.ADMIN_API_URL = API_BASE;
process.env.NEXTAUTH_SECRET = 'test-secret';

const { DELETE, GET, POST } = await import('./route');

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
  vi.mocked(getServerSession).mockResolvedValue({ expires: 'never' });
  vi.mocked(getToken).mockResolvedValue({ accessToken: 'server-side-token' });
});

describe('BFF proxy route', () => {
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
    vi.mocked(getServerSession).mockResolvedValue(null);

    const response = await DELETE(requestFor('DELETE'), contextFor(['api', 'rules', 'rule-1']));

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a session without an access token', async () => {
    vi.mocked(getToken).mockResolvedValue(null);

    const response = await GET(requestFor('GET'), contextFor(['api', 'rules']));

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
