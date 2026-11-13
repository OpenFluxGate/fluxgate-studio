import type { NextApiRequest, NextApiResponse } from 'next';
import type { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from './auth';

/** Resolve and refresh once, keeping credentials private and preserving NextAuth's cookie policy. */
export async function backendSession(request: NextRequest) {
  let accessToken: string | undefined;
  const responseHeaders = new Map<string, string | number | readonly string[]>();
  const req = {
    headers: Object.fromEntries(request.headers),
    cookies: Object.fromEntries(request.cookies.getAll().map(({ name, value }) => [name, value])),
  } as NextApiRequest;
  // The three-argument API runs the real auth callbacks and serializes/chunks refreshed cookies.
  // The one-argument RSC API has a dummy response and cannot persist them to this BFF response.
  const res = {
    getHeader: (name: string) => responseHeaders.get(name.toLowerCase()),
    setHeader: (name: string, value: string | number | readonly string[]) => {
      responseHeaders.set(name.toLowerCase(), value);
    },
  } as NextApiResponse;
  const session = await getServerSession(req, res, {
    ...authOptions,
    callbacks: {
      ...authOptions.callbacks,
      async session(params) {
        // This callback is private to this server-side invocation. The public session remains clean.
        if (!params.token.error && typeof params.token.accessToken === 'string') {
          accessToken = params.token.accessToken;
        }
        return authOptions.callbacks?.session
          ? authOptions.callbacks.session(params)
          : params.session;
      },
    },
  });
  const cookies = responseHeaders.get('set-cookie');
  return {
    accessToken: session ? accessToken : undefined,
    cookies: Array.isArray(cookies) ? cookies : typeof cookies === 'string' ? [cookies] : [],
  };
}
