import { type Rule } from '@/modules/admin/types';

import { type Locale } from './i18n';
import { valueLabel } from './labels';

export interface FieldChange {
  field: string;
  before: string;
  after: string;
}

const FIELDS = [
  'name',
  'enabled',
  'scope',
  'keyStrategyId',
  'onLimitExceedPolicy',
  'bands',
  'ruleSetId',
  'tags',
] as const;

function show(field: (typeof FIELDS)[number], rule: Partial<Rule> | null, locale: Locale): string {
  const value = rule?.[field];
  if (value === undefined || value === null) return '';
  return valueLabel(field, value, locale);
}

export function diffRules(
  before: Rule | null,
  after: Partial<Rule>,
  locale: Locale = 'en'
): FieldChange[] {
  return FIELDS.map((field) => ({
    field,
    before: show(field, before, locale),
    after: show(field, after, locale),
  })).filter((change) => change.before !== change.after);
}
