import type { NextConfig } from 'next';

/**
 * Security response headers applied to every route.
 *
 * The console performs destructive admin actions with a session cookie, so framing has to be denied
 * outright: `X-Frame-Options` for legacy browsers and `frame-ancestors` for everything current.
 */
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
];

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle so the Docker image only needs a Node runtime.
  output: 'standalone',

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
