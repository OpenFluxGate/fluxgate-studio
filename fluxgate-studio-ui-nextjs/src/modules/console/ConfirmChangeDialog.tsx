'use client';

import React from 'react';

import { type FieldChange } from '@/lib/ruleDiff';

import { useI18n } from './I18nProvider';
import { BUTTON, BUTTON_PRIMARY, TD, TH } from './ui';

export function ConfirmChangeDialog({
  title,
  changes,
  busy,
  onCancel,
  onConfirm,
}: {
  title: string;
  changes: FieldChange[];
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div role="dialog" aria-modal className="border-line bg-panel w-full max-w-lg rounded border">
        <header className="border-line border-b px-4 py-2 text-sm font-semibold">
          {t('rules.confirmTitle')}
          <div className="num text-muted text-[11px] font-normal">{title}</div>
        </header>
        <table className="w-full">
          <thead>
            <tr>
              <th className={TH}>{t('col.change')}</th>
              <th className={TH} />
              <th className={TH} />
            </tr>
          </thead>
          <tbody>
            {changes.map((change) => (
              <tr key={change.field}>
                <td className={`${TD} num text-muted`}>{change.field}</td>
                <td className={`${TD} num`}>
                  <span className="bg-bad-soft text-bad">{change.before || '∅'}</span>
                </td>
                <td className={`${TD} num`}>
                  <span className="bg-ok-soft text-ok">{change.after || '∅'}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-warn-line bg-warn-soft text-warn m-3 rounded border px-3 py-2 text-xs">
          {t('rules.confirmWarning')}
        </p>
        <footer className="border-line flex justify-end gap-2 border-t px-4 py-2">
          <button type="button" className={BUTTON} onClick={onCancel} disabled={busy}>
            {t('common.cancel')}
          </button>
          <button type="button" className={BUTTON_PRIMARY} onClick={onConfirm} disabled={busy}>
            {t('rules.confirmSave')}
          </button>
        </footer>
      </div>
    </div>
  );
}
