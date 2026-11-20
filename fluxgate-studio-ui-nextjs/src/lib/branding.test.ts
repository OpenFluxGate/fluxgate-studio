import { describe, expect, it } from 'vitest';

import { faviconHref, imageProblem, imageType, parseDataUrl, toDataUrl } from './branding';

describe('branding images', () => {
  it('round trips bytes through a data URL', () => {
    const url = toDataUrl('image/png', new Uint8Array([137, 80, 78, 71]));

    expect(url).toBe('data:image/png;base64,iVBORw==');
    expect(parseDataUrl(url)).toEqual({ type: 'image/png', base64: 'iVBORw==' });
  });

  it('rejects values that are not data URLs', () => {
    expect(parseDataUrl('https://example.com/logo.png')).toBeNull();
    expect(parseDataUrl('data:image/png,raw')).toBeNull();
  });

  it('infers the type of ICO and SVG files without one', () => {
    expect(imageType({ type: '', name: 'Favicon.ICO' })).toBe('image/x-icon');
    expect(imageType({ type: '', name: 'logo.svg' })).toBe('image/svg+xml');
    expect(imageType({ type: '', name: 'logo.bmp' })).toBe('');
  });

  it('explains why a file cannot be used', () => {
    expect(imageProblem({ type: 'image/png', name: 'a.png', size: 1000 }, 'favicon')).toBeNull();
    expect(imageProblem({ type: 'image/bmp', name: 'a.bmp', size: 1000 }, 'logo')).toBe('type');
    expect(imageProblem({ type: 'image/png', name: 'a.png', size: 70_000 }, 'favicon')).toBe(
      'size'
    );
    expect(imageProblem({ type: 'image/png', name: 'a.png', size: 70_000 }, 'logo')).toBeNull();
    expect(imageProblem({ type: 'image/png', name: 'a.png', size: 0 }, 'logo')).toBe('size');
  });

  it('versions the favicon address', () => {
    expect(faviconHref(null)).toBe('/brand/favicon');
    expect(faviconHref(42)).toBe('/brand/favicon?v=42');
  });

  it('encodes large files in chunks', () => {
    const bytes = new Uint8Array(100_000).fill(65);
    expect(toDataUrl('image/png', bytes).length).toBeGreaterThan(133_000);
  });
});
