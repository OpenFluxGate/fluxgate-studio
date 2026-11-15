'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';

import { Check } from 'lucide-react';

export const BUTTON =
  'inline-flex h-8 items-center justify-center gap-1.5 rounded border border-line-strong bg-panel2 px-3 text-[13px] text-fg transition-colors hover:border-fg2 hover:bg-line disabled:cursor-not-allowed disabled:opacity-50 shrink-0 whitespace-nowrap';
export const BUTTON_PRIMARY =
  'inline-flex h-8 items-center justify-center gap-1.5 rounded bg-primary px-3 text-[13px] font-medium text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50 shrink-0 whitespace-nowrap';
export const BUTTON_DANGER =
  'inline-flex h-8 items-center justify-center gap-1.5 rounded bg-s2 px-3 text-[13px] font-medium text-white transition-colors hover:bg-s2-strong disabled:cursor-not-allowed disabled:opacity-50 shrink-0 whitespace-nowrap';
export const BUTTON_QUIET =
  'inline-flex h-7 items-center gap-1 rounded px-2 text-xs text-fg2 transition-colors hover:bg-panel2 hover:text-fg';
export const INPUT =
  'h-8 rounded border border-line-strong bg-panel2 px-2.5 text-[13px] text-fg transition-colors placeholder:text-faint hover:border-fg2 focus-visible:border-s1';

type Align = 'center' | 'end' | 'start';

const TOOLTIP_ALIGN: Record<Align, string> = {
  center: 'left-1/2 -translate-x-1/2',
  end: 'right-0',
  start: 'left-0',
};

export function Tooltip({ text, align = 'center' }: { text: string; align?: Align }) {
  return (
    <span
      role="tooltip"
      className={`border-line-strong bg-panel2 text-fg pointer-events-none absolute top-full z-50 mt-1.5 rounded border px-2 py-1 text-[11px] font-normal whitespace-nowrap opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 ${TOOLTIP_ALIGN[align]}`}
    >
      {text}
    </span>
  );
}

export function IconButton({
  label,
  icon: Icon,
  onClick,
  align = 'center',
  quiet = false,
  className = '',
  ...rest
}: {
  label: string;
  icon: React.ComponentType<{ size?: number; 'aria-hidden'?: boolean }>;
  onClick?: () => void;
  align?: Align;
  quiet?: boolean;
  className?: string;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'className'>) {
  const look = quiet
    ? 'border-transparent bg-transparent text-muted hover:bg-panel2 hover:text-fg'
    : 'border-line-strong bg-panel2 text-fg2 hover:border-fg2 hover:text-fg';
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`group relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border transition-colors ${look} ${className}`}
      {...rest}
    >
      <Icon size={15} aria-hidden />
      <Tooltip text={label} align={align} />
    </button>
  );
}

export function Field({
  id,
  label,
  hint,
  error,
  className = '',
  children,
}: {
  id: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="text-fg2 mb-1 block text-xs font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-bad mt-1 text-xs">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-muted mt-1 text-xs">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Badge({
  tone = 'neutral',
  icon: Icon,
  children,
}: {
  tone?: 'neutral' | 'ok' | 'warn' | 'bad' | 'info';
  icon?: React.ComponentType<{ size?: number; 'aria-hidden'?: boolean }>;
  children: React.ReactNode;
}) {
  const style = {
    neutral: 'border-line-strong text-fg2',
    ok: 'border-ok/40 text-ok',
    warn: 'border-warn-line text-warn',
    bad: 'border-bad/40 text-bad',
    info: 'border-s1/40 text-s1-text',
  }[tone];
  return (
    <span
      className={`inline-flex h-5 items-center gap-1 rounded border px-1.5 text-xs font-medium whitespace-nowrap ${style}`}
    >
      {Icon && <Icon size={11} aria-hidden />}
      {children}
    </span>
  );
}

/** Keeps a popover open until the person clicks outside it or presses Escape. */
export function usePopover() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close(true);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  return { open, setOpen, close, rootRef, triggerRef };
}

/** Menu list with arrow key navigation. Focus moves to the first item when it opens. */
export function MenuList({
  label,
  align = 'end',
  width = 'w-48',
  children,
}: {
  label: string;
  align?: 'start' | 'end';
  width?: string;
  children: React.ReactNode;
}) {
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    list.current?.querySelector<HTMLElement>('[role^="menuitem"]')?.focus();
  }, []);

  const onKeyDown = (event: React.KeyboardEvent) => {
    const items = Array.from(
      list.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? []
    );
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      items[(index + 1) % items.length]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      items[(index - 1 + items.length) % items.length]?.focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      items[0]?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      items[items.length - 1]?.focus();
    }
  };

  return (
    <div
      ref={list}
      role="menu"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={`absolute top-full z-40 mt-1 ${width} border-line-strong bg-panel2 rounded-md border py-1 text-[13px] shadow-xl ${align === 'end' ? 'right-0' : 'left-0'}`}
    >
      {children}
    </div>
  );
}

export function MenuItem({
  icon: Icon,
  onSelect,
  checked,
  children,
}: {
  icon?: React.ComponentType<{ size?: number; 'aria-hidden'?: boolean }>;
  onSelect: () => void;
  checked?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role={checked === undefined ? 'menuitem' : 'menuitemradio'}
      aria-checked={checked}
      onClick={onSelect}
      className="text-fg hover:bg-line focus-visible:bg-line flex h-8 w-full items-center gap-2 px-3 text-left transition-colors"
    >
      {Icon ? <Icon size={14} aria-hidden /> : null}
      <span className="flex-1">{children}</span>
      {checked && <Check size={14} aria-hidden className="text-s1-text" />}
    </button>
  );
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-muted px-3 pt-2 pb-1 text-[11px] font-medium">{children}</div>;
}

export function MenuDivider() {
  return <div role="separator" className="border-line my-1 border-t" />;
}
