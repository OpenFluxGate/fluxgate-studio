import { NextRequest } from 'next/server';
import { decode, encode } from 'next-auth/jwt';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { GET, DELETE } = await import('./route');
const { authOptions } = await import('@/lib/auth');
const secret = 'isolated-auth-test-secret';
const fetchMock = vi.fn();
const refreshed = () =>
  Response.json({ access_token: 'fresh-access', refresh_token: 'fresh-refresh', expires_in: 300 });
const isRefresh = (url: URL | string) => String(url).includes('/protocol/openid-connect/token');
beforeEach(() => {
  vi.stubEnv('NEXTAUTH_SECRET', secret);
  vi.stubEnv('NEXTAUTH_URL', 'http://studio.test');
  vi.stubEnv('KEYCLOAK_ISSUER', 'https://identity.test/realms/studio');
  vi.stubEnv('KEYCLOAK_CLIENT_ID', 'fixture-client');
  vi.stubEnv('KEYCLOAK_CLIENT_SECRET', 'fixture-secret');
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: URL | string) =>
    isRefresh(url) ? refreshed() : Response.json([])
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function expiredRequest(method = 'GET') {
  const value = await encode({
    secret,
    token: {
      sub: 'fixture-user',
      accessToken: 'expired-access',
      refreshToken: 'old-refresh',
      expiresAt: Math.floor(Date.now() / 1000) - 60,
    },
  });
  const request = new NextRequest('http://studio.test/api/proxy/api/rules', {
    method,
    headers: { cookie: `next-auth.session-token=${value}` },
  });
  return request;
}
const context = () => ({ params: Promise.resolve({ path: ['api', 'rules'] }) });
const sessionCookies = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .filter((cookie) => /^(?:__Secure-)?next-auth\.session-token(?:\.\d+)?=/.test(cookie));
describe('BFF refresh with real NextAuth callbacks', () => {
  it('uses the new token now, returns an encrypted HttpOnly cookie and does not refresh again on the next request', async () => {
    const response = await GET(await expiredRequest(), context());
    const upstream = fetchMock.mock.calls.filter(([url]) => !isRefresh(url));
    expect(new Headers(upstream[0][1].headers).get('authorization')).toBe('Bearer fresh-access');
    const cookies = sessionCookies(response);
    expect(cookies.length).toBeGreaterThan(0);
    const token = await decode({
      secret,
      token: cookies.map((cookie) => cookie.slice(cookie.indexOf('=') + 1)).join(''),
    });
    expect(token?.accessToken).toBe('fresh-access');
    expect(token?.refreshToken).toBe('fresh-refresh');
    expect(response.headers.get('set-cookie')).toMatch(/HttpOnly/);
    expect(response.headers.get('set-cookie')).toMatch(/SameSite=Lax/);
    expect(await response.text()).not.toContain('fresh-access');
    const sanitized = await authOptions.callbacks!.session!({
      session: { expires: 'test' },
      token: token!,
      user: {} as never,
      newSession: undefined,
      trigger: 'update',
    });
    expect(sanitized).not.toHaveProperty('accessToken');
    expect(sanitized).not.toHaveProperty('refreshToken');
    const second = new NextRequest('http://studio.test/api/proxy/api/rules', {
      headers: { cookie: cookies.join('; ') },
    });
    await GET(second, context());
    expect(fetchMock.mock.calls.filter(([url]) => isRefresh(url))).toHaveLength(1);
  });
  it('preserves secure chunked session cookies for large refreshed tokens', async () => {
    vi.stubEnv('NEXTAUTH_URL', 'https://studio.test');
    const largeToken = 'fresh-access-'.repeat(900);
    fetchMock.mockImplementation(async (url: URL | string) =>
      isRefresh(url)
        ? Response.json({
            access_token: largeToken,
            refresh_token: 'fresh-refresh',
            expires_in: 300,
          })
        : Response.json([])
    );
    const expired = await encode({
      secret,
      token: {
        sub: 'fixture-user',
        accessToken: 'expired-access',
        refreshToken: 'old-refresh',
        expiresAt: 1,
      },
    });
    const request = new NextRequest('https://studio.test/api/proxy/api/rules', {
      headers: { cookie: `__Secure-next-auth.session-token=${expired}` },
    });
    const response = await GET(request, context());
    const cookies = sessionCookies(response).filter((cookie) => !cookie.endsWith('='));
    expect(cookies.length).toBeGreaterThan(1);
    for (const cookie of response.headers
      .getSetCookie()
      .filter((cookie) => cookie.startsWith('__Secure-next-auth.session-token'))) {
      expect(cookie).toMatch(/; Secure/);
      expect(cookie).toMatch(/; HttpOnly/);
      expect(cookie).toMatch(/; Path=\//);
      expect(cookie).toMatch(/; SameSite=Lax/);
    }
    const second = new NextRequest('https://studio.test/api/proxy/api/rules', {
      headers: { cookie: cookies.join('; ') },
    });
    expect((await GET(second, context())).status).toBe(200);
    const upstream = fetchMock.mock.calls.filter(([url]) => !isRefresh(url));
    expect(new Headers(upstream[1][1].headers).get('authorization')).toBe(`Bearer ${largeToken}`);
    expect(fetchMock.mock.calls.filter(([url]) => isRefresh(url))).toHaveLength(1);
  });
  it('returns the refreshed cookie on 204 and upstream connection failures', async () => {
    fetchMock.mockImplementation(async (url: URL | string) =>
      isRefresh(url) ? refreshed() : new Response(null, { status: 204 })
    );
    const response = await DELETE(await expiredRequest('DELETE'), context());
    expect(response.status).toBe(204);
    expect(sessionCookies(response).length).toBeGreaterThan(0);
    fetchMock.mockImplementation(async (url: URL | string) => {
      if (isRefresh(url)) return refreshed();
      throw new Error('fixture unavailable');
    });
    const failure = await GET(await expiredRequest(), context());
    expect(failure.status).toBe(502);
    expect(sessionCookies(failure).length).toBeGreaterThan(0);
  });
  it('recovers from a persisted refresh failure and reuses the recovered cookie', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ error: 'temporarily_unavailable' }, { status: 503 })
    );
    const failed = await GET(await expiredRequest(), context());
    expect(failed.status).toBe(401);
    const failedCookies = sessionCookies(failed);
    expect(failedCookies.length).toBeGreaterThan(0);
    const failedToken = await decode({
      secret,
      token: failedCookies.map((cookie) => cookie.slice(cookie.indexOf('=') + 1)).join(''),
    });
    expect(failedToken?.error).toBe('RefreshAccessTokenError');
    const retry = new NextRequest('http://studio.test/api/proxy/api/rules', {
      headers: { cookie: failedCookies.join('; ') },
    });
    const recovered = await GET(retry, context());
    expect(recovered.status).toBe(200);
    const upstream = fetchMock.mock.calls.filter(([url]) => !isRefresh(url));
    expect(new Headers(upstream[0][1].headers).get('authorization')).toBe('Bearer fresh-access');
    const recoveredCookies = sessionCookies(recovered);
    const recoveredToken = await decode({
      secret,
      token: recoveredCookies.map((cookie) => cookie.slice(cookie.indexOf('=') + 1)).join(''),
    });
    expect(recoveredToken?.error).toBeUndefined();
    expect(recoveredToken?.accessToken).toBe('fresh-access');
    expect(await recovered.text()).not.toContain('fresh-access');
    const third = new NextRequest('http://studio.test/api/proxy/api/rules', {
      headers: { cookie: recoveredCookies.join('; ') },
    });
    expect((await GET(third, context())).status).toBe(200);
    expect(fetchMock.mock.calls.filter(([url]) => isRefresh(url))).toHaveLength(2);
  });
  it('clears an inherited refresh error after a new provider sign-in', async () => {
    const token = await authOptions.callbacks!.jwt!({
      token: { sub: 'fixture-user', error: 'RefreshAccessTokenError' },
      user: {} as never,
      account: {
        provider: 'keycloak',
        type: 'oauth',
        providerAccountId: 'fixture-user',
        access_token: 'signed-in-access',
        refresh_token: 'signed-in-refresh',
        expires_at: Math.floor(Date.now() / 1000) + 300,
      },
      trigger: 'signIn',
    });
    expect(token.error).toBeUndefined();
    expect(token.accessToken).toBe('signed-in-access');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('keeps provider failure payloads out of the response and logs', async () => {
    const logged = vi.spyOn(console, 'error');
    fetchMock.mockResolvedValue(
      Response.json(
        { error: 'invalid_grant', access_token: 'provider-private-token' },
        { status: 400 }
      )
    );
    const response = await GET(await expiredRequest(), context());
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain('provider-private-token');
    expect(logged).toHaveBeenCalled();
    expect(JSON.stringify(logged.mock.calls)).not.toContain('provider-private-token');
  });
  it('rejects refresh failure and Authorization-only callers', async () => {
    fetchMock.mockResolvedValue(Response.json({ error: 'invalid_grant' }, { status: 400 }));
    expect((await GET(await expiredRequest(), context())).status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockClear();
    const forged = new NextRequest('http://studio.test/api/proxy/api/rules', {
      headers: { authorization: 'Bearer caller-forged' },
    });
    expect((await GET(forged, context())).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
