'use client';

import React, { useId, useState } from 'react';

import { Lock } from 'lucide-react';
import useSWR from 'swr';

import { ApiError, fetchMenuPolicy, saveMenuPolicy } from '@/lib/api';
import {
  applyMenuEdits,
  changedMenus,
  MENU_IDS,
  type MenuId,
  type MenuPolicy,
  type MenuRole,
  ROLE_MENUS,
} from '@/lib/menuPolicy';

import { Badge, BUTTON, BUTTON_PRIMARY, INPUT } from '../controls';
import { useI18n } from '../I18nProvider';
import { notifyMenuPolicySaved, useMe } from '../MeProvider';
import { errorText, Notice, Panel } from '../ui';

const ROLES = ['admin', 'user'] as const;
const ROLE_LABEL = { admin: 'role.admin', user: 'role.viewer' } as const;

interface Draft {
  base: MenuPolicy;
  policy: MenuPolicy;
}

interface Conflict {
  latest?: MenuPolicy;
  error?: string;
}

export function RoleMenusPanel() {
  const { t } = useI18n();
  const { me, retry } = useMe();
  const unavailable = Boolean(me?.menuPolicyUnavailable);
  const roleId = useId();
  const listId = useId();
  const { data, error, mutate } = useSWR(unavailable ? null : 'menu-policy', fetchMenuPolicy, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
  const [role, setRole] = useState<MenuRole>('user');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);

  const policy = draft?.policy ?? data;
  const dirty =
    draft !== null && ROLES.some((key) => changedMenus(draft.base, draft.policy, key).length > 0);
  const retryPolicy = () => {
    retry();
    void mutate();
  };

  const menuLabels = (menus: readonly MenuId[]) =>
    menus.map((menu) => t(`nav.${menu}`)).join(' · ');

  const toggle = (menu: MenuId, checked: boolean) => {
    if (!data || !policy) return;
    setNotice(null);
    const selected = new Set(policy[role]);
    if (checked) selected.add(menu);
    else selected.delete(menu);
    setDraft({
      base: draft?.base ?? data,
      policy: { ...policy, [role]: ROLE_MENUS[role].filter((id) => selected.has(id)) },
    });
  };

  const loadConflict = async () => {
    try {
      const latest = await fetchMenuPolicy();
      await mutate(latest, { revalidate: false });
      setConflict({ latest });
    } catch (failure) {
      setConflict({ error: errorText(failure, t) });
    }
  };

  const resolve = (keepChanges: boolean) => {
    if (!conflict?.latest || !draft) return;
    setDraft(
      keepChanges
        ? {
            base: conflict.latest,
            policy: applyMenuEdits(draft.base, draft.policy, conflict.latest),
          }
        : null
    );
    setConflict(null);
  };

  const save = async () => {
    if (!draft || !dirty || draft.policy.user.length === 0 || saving || conflict || unavailable)
      return;
    setSaving(true);
    setNotice(null);
    try {
      const result = await saveMenuPolicy(draft.policy);
      await mutate(result, { revalidate: false });
      setDraft(null);
      setNotice({
        tone: 'ok',
        text: t('menus.saved', {
          changes: ROLES.flatMap((key) => {
            const changed = changedMenus(draft.base, result, key);
            return changed.length
              ? [t('menus.changed', { role: t(ROLE_LABEL[key]), menus: menuLabels(changed) })]
              : [];
          }).join(' / '),
        }),
      });
      retry();
      notifyMenuPolicySaved();
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 409) {
        await loadConflict();
      } else {
        setNotice({ tone: 'bad', text: t('menus.saveFailed', { message: errorText(failure, t) }) });
        if (failure instanceof ApiError && (failure.status === 403 || failure.status >= 500))
          retry();
      }
    } finally {
      setSaving(false);
    }
  };

  const selected = policy?.[role] ?? [];
  const first = selected[0];
  const noUserMenus = policy?.user.length === 0;

  return (
    <Panel
      title={t('menus.title')}
      menu={false}
      className="mb-4"
      actions={dirty && <Badge tone="warn">{t('settings.unsaved')}</Badge>}
      state={{
        loading: !unavailable && !data && !error,
        error: unavailable ? new ApiError(503, t('menus.unavailable')) : error,
        onRetry: retryPolicy,
      }}
    >
      {policy && (
        <div className="space-y-3 px-4 pb-4">
          <p className="text-muted text-[13px]">{t('menus.intro')}</p>
          {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
          {conflict && (
            <Notice tone="warn">
              {t('menus.conflict')}
              {conflict.latest ? (
                <>
                  <dl className="my-2 space-y-1">
                    {ROLES.map((key) => (
                      <div key={key} className="flex flex-wrap gap-x-2">
                        <dt className="font-semibold">{t(ROLE_LABEL[key])}</dt>
                        <dd>{menuLabels(conflict.latest![key])}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="flex flex-wrap gap-2">
                    <button className={BUTTON} type="button" onClick={() => resolve(true)}>
                      {t('menus.keepChanges')}
                    </button>
                    <button className={BUTTON} type="button" onClick={() => resolve(false)}>
                      {t('menus.useSaved')}
                    </button>
                  </div>
                </>
              ) : (
                <div className="mt-2">
                  {conflict.error}{' '}
                  <button
                    className={BUTTON}
                    type="button"
                    disabled={saving}
                    onClick={async () => {
                      setSaving(true);
                      await loadConflict();
                      setSaving(false);
                    }}
                  >
                    {t('menus.reload')}
                  </button>
                </div>
              )}
            </Notice>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={roleId} className="text-fg text-[13px] font-medium">
              {t('menus.role')}
            </label>
            <select
              id={roleId}
              className={`${INPUT} min-h-9`}
              value={role}
              onChange={(event) => setRole(event.target.value === 'admin' ? 'admin' : 'user')}
            >
              {ROLES.map((key) => (
                <option key={key} value={key}>
                  {t(ROLE_LABEL[key])}
                </option>
              ))}
            </select>
          </div>
          <fieldset disabled={saving || conflict !== null}>
            <legend className="sr-only">{t('menus.title')}</legend>
            <div className="border-line divide-line divide-y rounded-md border">
              {MENU_IDS.map((menu) => {
                const locked =
                  role === 'admin' ? menu === 'settings' : !ROLE_MENUS.user.includes(menu);
                const reasonId = `${listId}-${menu}`;
                return (
                  <div key={menu} className="flex min-h-12 items-center gap-2 px-3">
                    <label className="flex min-h-12 flex-1 items-center gap-3 text-[13px]">
                      <input
                        className="accent-primary size-4 shrink-0"
                        type="checkbox"
                        checked={selected.includes(menu)}
                        disabled={locked}
                        aria-describedby={locked ? reasonId : undefined}
                        onChange={(event) => toggle(menu, event.target.checked)}
                      />
                      {t(`nav.${menu}`)}
                    </label>
                    {locked && (
                      <span
                        id={reasonId}
                        className="text-muted flex max-w-[60%] items-center gap-1 text-xs"
                      >
                        <Lock size={12} aria-hidden className="shrink-0" />
                        {t(role === 'admin' ? 'menus.lockedSettings' : 'menus.lockedViewer')}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </fieldset>
          <div className="bg-panel2 space-y-1 rounded-md p-3 text-[13px]" aria-live="polite">
            <h3 className="text-fg font-medium">
              {t('menus.preview', { role: t(ROLE_LABEL[role]) })}
            </h3>
            {first && (
              <>
                <p className="text-fg2">{menuLabels(selected)}</p>
                <p className="text-fg2">
                  <strong className="text-fg font-medium">{t('menus.firstPage')}</strong>{' '}
                  {t(`nav.${first}`)}
                </p>
              </>
            )}
            {noUserMenus && <p className="text-bad">{t('menus.minimum')}</p>}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className={BUTTON}
              disabled={!dirty || saving || conflict !== null}
              onClick={() => {
                setDraft(null);
                setNotice(null);
              }}
            >
              {t('settings.revert')}
            </button>
            <button
              type="button"
              className={BUTTON_PRIMARY}
              disabled={!dirty || noUserMenus || saving || conflict !== null}
              aria-busy={saving}
              onClick={() => void save()}
            >
              {saving ? t('settings.saving') : t('menus.save')}
            </button>
          </div>
        </div>
      )}
    </Panel>
  );
}
