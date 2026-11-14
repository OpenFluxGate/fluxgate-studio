import { readBranding } from '@/lib/adminApi';
import { parseDataUrl } from '@/lib/branding';

/** Serves the administrator chosen favicon, or sends the browser to the bundled one. */
export async function GET() {
  const branding = await readBranding();
  const image = branding.favicon ? parseDataUrl(branding.favicon) : null;
  if (!image) {
    return new Response(null, {
      status: 307,
      headers: { Location: '/favicon.ico', 'Cache-Control': 'no-cache' },
    });
  }
  return new Response(Buffer.from(image.base64, 'base64'), {
    headers: {
      'Content-Type': image.type,
      'Cache-Control': 'no-cache',
      // An SVG opened on its own must never run anything, whatever slipped past validation.
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
