'use client';

import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { Check, ChevronDown } from 'lucide-react';

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

export function Tooltip({ text, align = 'center' }: { text: string; align?: Align }) {
  const marker = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const anchor = marker.current?.parentElement;
    if (!anchor) return;
    let hovered = false;
    let focused = false;
    const enter = () => {
      hovered = true;
      setOpen(true);
    };
    const leave = () => {
      hovered = false;
      setOpen(focused);
    };
    const focus = () => {
      focused = true;
      setOpen(true);
    };
    const blur = () => {
      focused = false;
      setOpen(hovered);
    };
    anchor.addEventListener('mouseenter', enter);
    anchor.addEventListener('mouseleave', leave);
    anchor.addEventListener('focusin', focus);
    anchor.addEventListener('focusout', blur);
    return () => {
      anchor.removeEventListener('mouseenter', enter);
      anchor.removeEventListener('mouseleave', leave);
      anchor.removeEventListener('focusin', focus);
      anchor.removeEventListener('focusout', blur);
    };
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', escape);
    const place = () => {
      const anchor = marker.current?.parentElement;
      const tip = bubble.current;
      if (!anchor || !tip) return;
      const rect = anchor.getBoundingClientRect();
      const width = tip.offsetWidth;
      const height = tip.offsetHeight;
      const x =
        align === 'start'
          ? rect.left
          : align === 'end'
            ? rect.right - width
            : rect.left + (rect.width - width) / 2;
      tip.style.left = Math.max(8, Math.min(x, window.innerWidth - width - 8)) + 'px';
      tip.style.top =
        Math.max(
          8,
          rect.bottom + height + 6 <= window.innerHeight - 8
            ? rect.bottom + 6
            : rect.top - height - 6
        ) + 'px';
      tip.style.visibility = 'visible';
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('keydown', escape);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, align, text]);

  return (
    <>
      <span ref={marker} hidden />
      {open &&
        createPortal(
          <span
            ref={bubble}
            role="tooltip"
            className="border-line-strong bg-panel2 text-fg pointer-events-none fixed z-[100] w-max max-w-[min(20rem,calc(100vw-16px))] rounded border px-2 py-1 text-[11px] font-normal break-words whitespace-normal shadow-lg"
            style={{ visibility: 'hidden', left: 0, top: 0 }}
          >
            {text}
          </span>,
          document.body
        )}
    </>
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

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

/**
 * Next highlighted option for a key press in an open list, or null when the key does not move it.
 * Typing a letter jumps to the next option whose label starts with it.
 */
export function moveOption(labels: string[], current: number, key: string): number | null {
  const last = labels.length - 1;
  if (last < 0) return null;
  if (key === 'ArrowDown') return Math.min(last, current + 1);
  if (key === 'ArrowUp') return Math.max(0, current - 1);
  if (key === 'Home' || key === 'PageUp') return 0;
  if (key === 'End' || key === 'PageDown') return last;
  if (key.length === 1 && key.trim()) {
    const letter = key.toLowerCase();
    for (let step = 1; step <= labels.length; step++) {
      const index = (current + step) % labels.length;
      if (labels[index].toLowerCase().startsWith(letter)) return index;
    }
  }
  return null;
}

/**
 * Drop down that looks the same on every platform. Focus stays on the button and the highlighted
 * option is announced through aria-activedescendant, so it works inside dialogs that trap focus.
 */
export function Select<T extends string>({
  id,
  value,
  options,
  onChange,
  label,
  disabled = false,
  className = '',
  buttonClassName,
}: {
  id?: string;
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  /** Accessible name when no visible label points at the id. */
  label?: string;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
}) {
  const generated = useId();
  const listId = `${id ?? generated}-list`;
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [upward, setUpward] = useState(false);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value)
  );
  const selected = options[selectedIndex];

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active, listId]);

  const show = (button: HTMLElement) => {
    const room = window.innerHeight - button.getBoundingClientRect().bottom;
    setUpward(room < Math.min(options.length * 32 + 8, 264) + 8);
    setActive(selectedIndex);
    setOpen(true);
  };
  const choose = (index: number) => {
    setOpen(false);
    const option = options[index];
    if (option && option.value !== value) onChange(option.value);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault();
        show(event.currentTarget);
      }
      return;
    }
    if (event.key === 'Escape') {
      // Marked as handled, so a surrounding dialog stays open.
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(active);
      return;
    }
    if (event.key === 'Tab') {
      setOpen(false);
      return;
    }
    const next = moveOption(
      options.map((option) => option.label),
      active,
      event.key
    );
    if (next !== null) {
      event.preventDefault();
      setActive(next);
    }
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        aria-label={label}
        disabled={disabled}
        onClick={(event) => (open ? setOpen(false) : show(event.currentTarget))}
        onKeyDown={onKeyDown}
        className={
          buttonClassName ??
          `${INPUT} flex w-full items-center gap-2 text-left disabled:cursor-not-allowed disabled:opacity-50`
        }
      >
        <span className="min-w-0 flex-1 truncate">{selected?.label}</span>
        <ChevronDown size={14} aria-hidden className="text-muted shrink-0" />
      </button>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className={`border-line-strong bg-panel2 absolute z-50 max-h-64 w-max min-w-full overflow-auto rounded-md border py-1 shadow-xl ${upward ? 'bottom-full mb-1' : 'top-full mt-1'}`}
        >
          {options.map((option, index) => (
            <li
              key={option.value}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={option.value === value}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(index)}
              className={`flex h-8 cursor-pointer items-center gap-2 px-3 text-[13px] whitespace-nowrap ${index === active ? 'bg-line text-fg' : 'text-fg2'}`}
            >
              <span className="flex-1">{option.label}</span>
              {option.value === value && <Check size={14} aria-hidden className="text-s1-text" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
