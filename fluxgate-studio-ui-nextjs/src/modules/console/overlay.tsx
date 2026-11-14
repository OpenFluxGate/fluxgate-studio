'use client';

import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

import { X } from 'lucide-react';

import { IconButton } from './controls';
import { useI18n } from './I18nProvider';

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

const stack: symbol[] = [];

/** Moves focus into an open dialog, keeps it there, closes on Escape and restores focus. */
function useDialog(container: React.RefObject<HTMLDivElement | null>, onClose: () => void) {
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const me = Symbol('dialog');
    stack.push(me);
    const previous = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(container.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    const initial =
      container.current?.querySelector<HTMLElement>('[data-autofocus]') ?? focusables()[0];
    initial?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (stack[stack.length - 1] !== me) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      stack.splice(stack.indexOf(me), 1);
      previous?.focus();
    };
  }, [container]);
}

const MODAL_SIZE = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', full: 'max-w-none h-full' };

export function Modal({
  title,
  description,
  onClose,
  footer,
  size = 'md',
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
  size?: keyof typeof MODAL_SIZE;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useDialog(ref, onClose);

  return createPortal(
    <div
      className={`fixed inset-0 z-[60] flex items-center justify-center overscroll-contain bg-black/60 ${size === 'full' ? 'p-6' : 'p-4'}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        className={`border-line-strong bg-panel flex max-h-full w-full flex-col rounded-md border shadow-2xl ${MODAL_SIZE[size]}`}
      >
        <header className="border-line flex items-start gap-3 border-b px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 id={`${id}-title`} className="text-fg text-[15px] font-semibold text-balance">
              {title}
            </h2>
            {description && <p className="text-muted mt-0.5 text-xs">{description}</p>}
          </div>
          <IconButton label={t('common.close')} icon={X} onClick={onClose} quiet align="end" />
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
          {children}
        </div>
        {footer && (
          <footer className="border-line flex items-center justify-end gap-2 border-t px-4 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body
  );
}

export function Drawer({
  title,
  description,
  onClose,
  footer,
  width = 'max-w-3xl',
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
  width?: string;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useDialog(ref, onClose);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex justify-end overscroll-contain bg-black/50"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        className={`border-line-strong bg-panel flex h-full w-full flex-col border-l shadow-2xl ${width}`}
      >
        <header className="border-line flex h-12 shrink-0 items-center gap-3 border-b px-4">
          <div className="min-w-0 flex-1">
            <h2 id={`${id}-title`} className="text-fg truncate text-[15px] font-semibold">
              {title}
            </h2>
            {description && <p className="text-muted truncate text-xs">{description}</p>}
          </div>
          <IconButton label={t('common.close')} icon={X} onClick={onClose} quiet align="end" />
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
        {footer && (
          <footer className="border-line bg-panel flex shrink-0 items-center justify-end gap-2 border-t px-4 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body
  );
}
