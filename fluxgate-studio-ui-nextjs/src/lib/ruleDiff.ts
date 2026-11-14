import { type Rule } from '@/modules/admin/types';

import { formatLimit } from './ruleMeaning';

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

function show(field: (typeof FIELDS)[number], rule: Partial<Rule> | null): string {
  const value = rule?.[field];
  if (value === undefined || value === null) return '';
  if (field === 'bands') return (value as Rule['bands']).map(formatLimit).join(' / ');
  if (field === 'tags') return (value as string[]).join(', ');
  return String(value);
}

export function diffRules(before: Rule | null, after: Partial<Rule>): FieldChange[] {
  return FIELDS.map((field) => ({
    field,
    before: show(field, before),
    after: show(field, after),
  })).filter((change) => change.before !== change.after);
}
