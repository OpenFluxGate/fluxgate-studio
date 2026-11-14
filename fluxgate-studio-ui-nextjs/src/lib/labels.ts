import { type Locale, type MessageKey, translate } from './i18n';
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
  if (typeof value === 'boolean') return translate(locale, value ? 'value.true' : 'value.false');
  if (Array.isArray(value)) {
    return value.length ? value.join(', ') : translate(locale, 'value.empty');
  }
  if (typeof value === 'object') {
    return Object.keys(value).length ? JSON.stringify(value) : translate(locale, 'value.empty');
  }
  return String(value);
}
