'use client';

import React, { useEffect, useRef, useState } from 'react';

import { ImageUp, Lock, RotateCcw, X } from 'lucide-react';
import { useSWRConfig } from 'swr';

import { saveBranding } from '@/lib/api';
import {
  BRANDING_ACCEPT,
  BRANDING_LIMITS,
  type BrandingImage,
  imageProblem,
  imageType,
  toDataUrl,
} from '@/lib/branding';
import { formatTimestamp } from '@/lib/format';
import { type Locale, type MessageKey } from '@/lib/i18n';
import { type ColorMode, useTheme } from '@/modules/admin';

import { BRANDING_KEY, BrandMark, useBranding } from '../branding';
import { Badge, BUTTON, BUTTON_PRIMARY } from '../controls';
import { useI18n } from '../I18nProvider';
import { useMe } from '../MeProvider';
import { Notice, PageHeader, PageIntro, Panel } from '../ui';

interface Option<T extends string> {
  value: T;
  label: string;
  lang?: string;
}

const LOCALES: Option<Locale>[] = [
  { value: 'ko', label: '한국어', lang: 'ko' },
  { value: 'en', label: 'English', lang: 'en' },
];
const MODES: ColorMode[] = ['dark', 'light', 'system'];

type Images = Record<BrandingImage, string | null>;

/** Radio group drawn as a segmented control, with arrow key movement between options. */
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
}) {
  const move = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const next = (index + step + options.length) % options.length;
    onChange(options[next].value);
    const buttons = event.currentTarget.parentElement?.querySelectorAll('button');
    buttons?.[next]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="border-line-strong bg-panel2 inline-flex h-9 items-center rounded-md border p-0.5"
    >
      {options.map((option, index) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            lang={option.lang}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => move(event, index)}
            className={`h-full min-w-20 rounded px-3 text-[13px] transition-colors ${checked ? 'bg-primary font-medium text-white' : 'text-fg2 hover:bg-line hover:text-fg'}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function SettingRow({
  title,
  help,
  children,
}: {
  title: React.ReactNode;
  help?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="border-line grid gap-3 border-t px-4 py-4 first:border-t-0 md:grid-cols-[minmax(0,260px)_1fr]">
      <div>
        <div className="text-fg text-[13px] font-medium">{title}</div>
        {help && <p className="text-muted mt-1 text-xs leading-relaxed">{help}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Preview({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <figure className="flex flex-col gap-1.5">
      <div className="border-line bg-bg flex h-16 items-center justify-center rounded-md border px-3">
        {children}
      </div>
      <figcaption className="text-muted text-center text-[11px]">{label}</figcaption>
    </figure>
  );
}

function LogoPreviews({ logo }: { logo: string | null }) {
  const { t } = useI18n();
  return (
    <>
      <Preview label={t('settings.previewMenu')}>
        <span className="bg-panel flex items-center gap-2 rounded px-2 py-1.5">
          <BrandMark size={20} logo={logo} />
          <span className="text-fg text-[13px] font-semibold tracking-tight">FluxGate Studio</span>
        </span>
      </Preview>
      <Preview label={t('settings.previewLogin')}>
        <BrandMark size={32} logo={logo} />
      </Preview>
    </>
  );
}

function FaviconPreview({ favicon }: { favicon: string | null }) {
  const { t } = useI18n();
  return (
    <Preview label={t('settings.previewTab')}>
      <span className="border-line-strong bg-panel flex h-8 w-52 items-center gap-2 rounded-t-md border border-b-0 px-3">
        {/* A data URL or the bundled icon, which next/image cannot optimise. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={favicon ?? '/favicon.ico'} alt="" width={16} height={16} className="h-4 w-4" />
        <span className="text-fg flex-1 truncate text-xs">FluxGate Studio</span>
        <X size={12} aria-hidden className="text-muted" />
      </span>
    </Preview>
  );
}

function ImageSetting({
  kind,
  value,
  editable,
  error,
  onPick,
  onReset,
}: {
  kind: BrandingImage;
  value: string | null;
  editable: boolean;
  error: string | null;
  onPick: (file: File) => void;
  onReset: () => void;
}) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const id = `branding-${kind}`;
  return (
    <SettingRow
      title={
        <span className="flex items-center gap-2">
          {t(kind === 'logo' ? 'settings.logo' : 'settings.favicon')}
          <Badge>{t(value ? 'settings.custom' : 'settings.default')}</Badge>
        </span>
      }
      help={t(kind === 'logo' ? 'settings.logoHint' : 'settings.faviconHint')}
    >
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex w-[15.5rem] gap-4">
          {kind === 'logo' ? <LogoPreviews logo={value} /> : <FaviconPreview favicon={value} />}
        </div>
        {editable && (
          <div className="flex flex-col gap-2 self-center">
            <input
              ref={input}
              id={id}
              type="file"
              accept={BRANDING_ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-describedby={error ? `${id}-error` : undefined}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) onPick(file);
              }}
            />
            <button type="button" className={BUTTON} onClick={() => input.current?.click()}>
              <ImageUp size={14} aria-hidden />
              {t('settings.choose')}
            </button>
            <button type="button" className={BUTTON} onClick={onReset} disabled={!value}>
              <RotateCcw size={14} aria-hidden />
              {t('settings.useDefault')}
            </button>
          </div>
        )}
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-bad mt-2 text-xs">
          {error}
        </p>
      )}
    </SettingRow>
  );
}

export function SettingsScreen() {
  const { t, locale, setLocale } = useI18n();
  const { mode, setMode } = useTheme();
  const { isAdmin } = useMe();
  const branding = useBranding();
  const { mutate } = useSWRConfig();

  const [draft, setDraft] = useState<Images | null>(null);
  const [errors, setErrors] = useState<Record<BrandingImage, string | null>>({
    logo: null,
    favicon: null,
  });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  const saved: Images = {
    logo: branding.data?.logo ?? null,
    favicon: branding.data?.favicon ?? null,
  };
  const current = draft ?? saved;
  const dirty = draft !== null && (draft.logo !== saved.logo || draft.favicon !== saved.favicon);

  useEffect(() => {
    if (notice?.tone !== 'ok') return;
    const timer = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const update = (kind: BrandingImage, value: string | null) => {
    setDraft({ ...current, [kind]: value });
    setErrors((previous) => ({ ...previous, [kind]: null }));
    setNotice(null);
  };

  const pick = async (kind: BrandingImage, file: File) => {
    const problem = imageProblem(file, kind);
    if (problem) {
      setErrors((previous) => ({
        ...previous,
        [kind]:
          problem === 'type'
            ? t('settings.error.type')
            : t('settings.error.size', { limit: `${BRANDING_LIMITS[kind] / 1024} KB` }),
      }));
      return;
    }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      update(kind, toDataUrl(imageType(file), bytes));
    } catch {
      setErrors((previous) => ({ ...previous, [kind]: t('settings.error.read') }));
    }
  };

  const save = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const result = await saveBranding(current);
      await mutate(BRANDING_KEY, result, { revalidate: false });
      setDraft(null);
      setNotice({ tone: 'ok', text: t('settings.saved') });
    } catch (error) {
      setNotice({
        tone: 'bad',
        text: t('settings.saveFailed', {
          message: error instanceof Error ? error.message : String(error),
        }),
      });
    } finally {
      setSaving(false);
    }
  };

  const updatedAt = branding.data?.version;
  const updatedBy = branding.data?.updatedBy;

  return (
    <div>
      <PageHeader heading={false} title={t('settings.title')} />
      <PageIntro title={t('settings.title')}>{t('settings.intro')}</PageIntro>
      <div className="max-w-5xl">
        <Panel
          title={t('settings.preferences')}
          menu={false}
          description={t('settings.preferencesHelp')}
          className="mb-4"
        >
          <SettingRow title={t('settings.language')} help={t('settings.languageHelp')}>
            <Segmented
              label={t('settings.language')}
              value={locale}
              options={LOCALES}
              onChange={setLocale}
            />
          </SettingRow>
          <SettingRow title={t('settings.theme')} help={t('settings.themeHelp')}>
            <Segmented
              label={t('settings.theme')}
              value={mode}
              options={MODES.map((option) => ({
                value: option,
                label: t(`mode.${option}` as MessageKey),
              }))}
              onChange={setMode}
            />
          </SettingRow>
        </Panel>

        <Panel
          title={t('settings.branding')}
          menu={false}
          description={t('settings.brandingHelp')}
          actions={
            isAdmin ? (
              dirty && <Badge tone="warn">{t('settings.unsaved')}</Badge>
            ) : (
              <Badge icon={Lock}>{t('settings.adminOnly')}</Badge>
            )
          }
          state={{
            loading: !branding.data && !branding.error,
            error: branding.data ? undefined : branding.error,
            onRetry: () => void branding.mutate(),
          }}
        >
          {notice?.tone === 'bad' && (
            <div className="px-4 pt-1">
              <Notice tone="bad" onClose={() => setNotice(null)}>
                {notice.text}
              </Notice>
            </div>
          )}
          <ImageSetting
            kind="logo"
            value={current.logo}
            editable={isAdmin}
            error={errors.logo}
            onPick={(file) => void pick('logo', file)}
            onReset={() => update('logo', null)}
          />
          <ImageSetting
            kind="favicon"
            value={current.favicon}
            editable={isAdmin}
            error={errors.favicon}
            onPick={(file) => void pick('favicon', file)}
            onReset={() => update('favicon', null)}
          />
          <footer className="border-line flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
            <span className="num text-muted text-xs">
              {updatedAt && updatedBy
                ? t('settings.lastChanged', { user: updatedBy, time: formatTimestamp(updatedAt) })
                : null}
            </span>
            {isAdmin && (
              <span className="flex items-center gap-2">
                <button
                  type="button"
                  className={BUTTON}
                  disabled={!dirty || saving}
                  onClick={() => {
                    setDraft(null);
                    setErrors({ logo: null, favicon: null });
                  }}
                >
                  {t('settings.revert')}
                </button>
                <button
                  type="button"
                  className={BUTTON_PRIMARY}
                  disabled={!dirty || saving}
                  aria-busy={saving}
                  onClick={() => void save()}
                >
                  {saving ? t('settings.saving') : t('settings.save')}
                </button>
              </span>
            )}
          </footer>
        </Panel>
      </div>
      {notice?.tone === 'ok' && (
        <div className="fixed right-4 bottom-4 z-50 w-80">
          <Notice tone="ok" onClose={() => setNotice(null)}>
            {notice.text}
          </Notice>
        </div>
      )}
    </div>
  );
}
