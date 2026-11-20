import { type Branding, DEFAULT_BRANDING } from './branding';

const API_BASE_URL =
  process.env.ADMIN_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8090';

/** Absolute Admin API address for a path, keeping any base path of the configured URL. */
export function adminApiUrl(path: string): string {
  const base = API_BASE_URL.endsWith('/') ? API_BASE_URL : `${API_BASE_URL}/`;
  return new URL(path.replace(/^\/+/, ''), base).toString();
}

/** Public branding. Falls back to the defaults so a slow or absent API never breaks a page. */
export async function readBranding(): Promise<Branding> {
  try {
    const response = await fetch(adminApiUrl('api/branding'), {
      cache: 'no-store',
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) return DEFAULT_BRANDING;
    const body = (await response.json()) as Partial<Branding>;
    return { ...DEFAULT_BRANDING, ...body };
  } catch {
    return DEFAULT_BRANDING;
  }
}
