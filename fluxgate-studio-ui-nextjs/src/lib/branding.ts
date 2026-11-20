/** Console logo and favicon chosen by an administrator. Images are base64 data URLs. */
export interface Branding {
  logo: string | null;
  favicon: string | null;
  version: number | null;
  updatedBy: string | null;
}

export type BrandingImage = 'logo' | 'favicon';

export const DEFAULT_BRANDING: Branding = {
  logo: null,
  favicon: null,
  version: null,
  updatedBy: null,
};

/** Largest accepted decoded size. The Admin API enforces the same limits. */
export const BRANDING_LIMITS: Record<BrandingImage, number> = {
  logo: 128 * 1024,
  favicon: 64 * 1024,
};

export const BRANDING_TYPES = [
  'image/png',
  'image/svg+xml',
  'image/x-icon',
  'image/vnd.microsoft.icon',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const;

export const BRANDING_ACCEPT = `${BRANDING_TYPES.join(',')},.ico,.svg`;

const DATA_URL = /^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/]+={0,2})$/;

/** Splits a data URL into its media type and base64 payload, or null when it is not one. */
export function parseDataUrl(value: string): { type: string; base64: string } | null {
  const match = DATA_URL.exec(value);
  return match ? { type: match[1], base64: match[2] } : null;
}

/** Media type of a picked file. Some browsers leave ICO files without a type. */
export function imageType(file: { type: string; name: string }): string {
  if (file.type) return file.type;
  const name = file.name.toLowerCase();
  if (name.endsWith('.ico')) return 'image/x-icon';
  if (name.endsWith('.svg')) return 'image/svg+xml';
  return '';
}

/** Why a picked file cannot be used, or null when it can. */
export function imageProblem(
  file: { type: string; name: string; size: number },
  kind: BrandingImage
): 'type' | 'size' | null {
  if (!(BRANDING_TYPES as readonly string[]).includes(imageType(file))) return 'type';
  if (file.size === 0 || file.size > BRANDING_LIMITS[kind]) return 'size';
  return null;
}

/** Address of the favicon. The version busts the browser cache after a change. */
export function faviconHref(version: number | null): string {
  return version ? `/brand/favicon?v=${version}` : '/brand/favicon';
}

/** Encodes bytes as a data URL without hitting the argument limit of String.fromCharCode. */
export function toDataUrl(type: string, bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return `data:${type};base64,${btoa(binary)}`;
}
