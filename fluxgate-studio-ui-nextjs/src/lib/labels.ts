import { type Locale, type MessageKey, translate } from './i18n';
import { MENU_IDS, type MenuId } from './menuPolicy';
import { formatLimit } from './ruleMeaning';

function lookup(locale: Locale, prefix: string, value: string): string {
  const key = `${prefix}.${value}` as MessageKey;
  const text = translate(locale, key);
  return text === key ? value : text;
}

export const scopeLabel = (value: string, locale: Locale) => lookup(locale, 'scope', value);
export const policyLabel = (value: string, locale: Locale) => lookup(locale, 'policy', value);
export const keyStrategyLabel = (value: string, locale: Locale) =>
  lookup(locale, 'keyStrategy', value);
export const fieldLabel = (value: string, locale: Locale) => lookup(locale, 'field', value);

export function valueLabel(field: string, value: unknown, locale: Locale): string {
  if (value === null || value === undefined || value === '') {
    return translate(locale, 'value.empty');
  }
  if (field === 'bands' && Array.isArray(value)) {
    return value
      .map((band) => formatLimit(band as { windowSeconds: number; capacity: number }, locale))
      .join(' / ');
  }
  if (field === 'scope') return scopeLabel(String(value), locale);
  if (field === 'onLimitExceedPolicy') return policyLabel(String(value), locale);
  if (field === 'keyStrategyId') return keyStrategyLabel(String(value), locale);
  if ((field === 'logo' || field === 'favicon') && typeof value === 'string') {
    return imageLabel(value, locale);
  }
  if (typeof value === 'boolean') return translate(locale, value ? 'value.true' : 'value.false');
  if ((field === 'admin' || field === 'user') && Array.isArray(value) && value.length) {
    return value
      .map((menu) =>
        MENU_IDS.includes(menu) ? translate(locale, `nav.${menu as MenuId}`) : String(menu)
      )
      .join(', ');
  }
  if (Array.isArray(value)) {
    return value.length ? value.join(', ') : translate(locale, 'value.empty');
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, item]) => !(Array.isArray(item) && item.length === 0) && item !== null && item !== ''
    );
    return entries.length
      ? entries.map(([key, item]) => `${key}: ${valueLabel(key, item, locale)}`).join(', ')
      : translate(locale, 'value.empty');
  }
  return String(value);
}

/** Turns an audit description such as "image/svg+xml, 0.2 KB, 19df83b0" into "SVG image, 0.2 KB". */
function imageLabel(description: string, locale: Locale): string {
  const [mediaType, size] = description.split(', ');
  if (!mediaType?.startsWith('image/') || !size) return description;
  const type = mediaType
    .slice('image/'.length)
    .replace('svg+xml', 'svg')
    .replace(/^(x-icon|vnd\.microsoft\.icon)$/, 'ico')
    .toUpperCase();
  return translate(locale, 'value.customImage', { type, size });
}
