import { NextResponse } from 'next/server';

import { readBranding } from '@/lib/adminApi';

/** Public branding for the sign in page and the console, read before anyone signs in. */
export async function GET() {
  return NextResponse.json(await readBranding(), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
