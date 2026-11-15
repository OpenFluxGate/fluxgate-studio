'use client';

import React from 'react';

import { AlertTriangle, ArrowRight } from 'lucide-react';

import { fieldLabel } from '@/lib/labels';
import { type FieldChange } from '@/lib/ruleDiff';

import { BUTTON, BUTTON_DANGER } from './controls';
import { useI18n } from './I18nProvider';
import { Modal } from './overlay';
import { TD, TH } from './ui';

export function ConfirmChangeDialog({
  title,
  changes,
  busy,
  confirmLabel,
  warning,
  onCancel,
  onConfirm,
}: {
  title: string;
  changes: FieldChange[];
  busy: boolean;
  confirmLabel?: string;
  warning?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t, locale } = useI18n();
  return (
    <Modal
      title={t('rules.confirmTitle')}
      description={<span className="mono">{title}</span>}
      onClose={onCancel}
      size="md"
      footer={
        <>
          <button
            type="button"
            className={BUTTON}
            onClick={onCancel}
            disabled={busy}
            data-autofocus
          >
            {t('common.cancel')}
          </button>
          <button type="button" className={BUTTON_DANGER} onClick={onConfirm} disabled={busy}>
            {confirmLabel ?? t('rules.confirmSave')}
          </button>
        </>
      }
    >
      {changes.length > 0 && (
        <table className="mb-3 w-full text-[13px]">
          <thead>
            <tr>
              <th scope="col" className={TH}>
                {t('confirm.field')}
              </th>
              <th scope="col" className={TH}>
                {t('confirm.before')}
              </th>
              <th scope="col" className={`${TH} w-6`}>
                <span className="sr-only">→</span>
              </th>
              <th scope="col" className={TH}>
                {t('confirm.after')}
              </th>
            </tr>
          </thead>
          <tbody>
            {changes.map((change) => (
              <tr key={change.field}>
                <td className={`${TD} text-fg2`}>{fieldLabel(change.field, locale)}</td>
                <td
                  className={`${TD} text-muted ${change.before ? 'decoration-bad/60 line-through' : ''}`}
                >
                  {change.before || t('value.empty')}
                </td>
                <td className={TD}>
                  <ArrowRight size={14} aria-hidden className="text-muted" />
                </td>
                <td className={`${TD} text-fg font-medium`}>{change.after || t('value.empty')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div
        role="note"
        className="border-warn-line bg-warn-soft text-warn flex items-start gap-2 rounded-md border px-3 py-2 text-[13px]"
      >
        <AlertTriangle size={15} aria-hidden className="mt-0.5 shrink-0" />
        {warning ?? t('rules.confirmWarning')}
      </div>
    </Modal>
  );
}
