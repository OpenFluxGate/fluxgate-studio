'use client';

import React, { useState } from 'react';

import { CheckCircle2, XOctagon } from 'lucide-react';

import { simulateRule } from '@/lib/api';
import { formatCount } from '@/lib/format';
import { formatLimit } from '@/lib/ruleMeaning';
import { Badge, BUTTON, BUTTON_PRIMARY, Field, INPUT } from '@/modules/console/controls';
import { useI18n } from '@/modules/console/I18nProvider';
import { Modal } from '@/modules/console/overlay';
import { Notice, TD, TH } from '@/modules/console/ui';

import { type Rule, type SimulationResult } from '../types';

interface SimulationPanelProps {
  rule: Rule;
  onClose: () => void;
}

/**
 * Tokens a band offers to a burst spread over the given seconds, starting from a full bucket.
 * Mirrors the server side computation and is only used when the simulate endpoint is unreachable.
 */
function availableTokens(capacity: number, windowSeconds: number, seconds: number): number {
  if (windowSeconds <= 0) {
    return capacity;
  }
  return capacity + Math.floor((capacity * seconds) / windowSeconds);
}

/** Client side fallback for the simulate endpoint. */
export function simulateLocally(rule: Rule, requests: number, seconds: number): SimulationResult {
  const bands = rule.bands.map((band) => {
    const available = availableTokens(band.capacity, band.windowSeconds, seconds);
    return {
      label: band.label || `${band.capacity}-per-${band.windowSeconds}s`,
      capacity: band.capacity,
      windowSeconds: band.windowSeconds,
      available,
      consumed: Math.min(requests, available),
      remaining: Math.max(0, available - requests),
      exceeded: requests > available,
    };
  });
  const mostRestrictive = bands.length ? Math.min(...bands.map((band) => band.available)) : 0;
  return {
    allowed: bands.every((band) => !band.exceeded),
    consumed: Math.min(requests, mostRestrictive),
    remaining: Math.max(0, mostRestrictive - requests),
    estimated: true,
    bands,
  };
}

export const SimulationPanel = ({ rule, onClose }: SimulationPanelProps) => {
  const { t, locale } = useI18n();
  const [requests, setRequests] = useState(
    rule.bands[0]?.capacity ? rule.bands[0].capacity + 5 : 20
  );
  const [seconds, setSeconds] = useState(1);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [lastRequests, setLastRequests] = useState(requests);

  const run = async (event: React.FormEvent) => {
    event.preventDefault();
    setRunning(true);
    setLastRequests(requests);
    try {
      const simulation = await simulateRule(rule.id, requests, seconds, rule.ruleSetId);
      setResult({
        allowed: simulation.allowed,
        consumed: simulation.consumed,
        remaining: simulation.remaining,
        bands: simulation.bands.map((band, index) => ({
          label: band.label || `${band.capacity}-per-${band.windowSeconds}s`,
          capacity: band.capacity,
          windowSeconds: band.windowSeconds ?? rule.bands[index]?.windowSeconds,
          available: band.available,
          consumed: band.consumed,
          remaining: band.remaining,
          exceeded: band.exceeded,
        })),
      });
    } catch {
      // The dry run is pure arithmetic, so a failed call degrades to the same local computation.
      setResult(simulateLocally(rule, requests, seconds));
    } finally {
      setRunning(false);
    }
  };

  const rejected = result ? Math.max(0, lastRequests - result.consumed) : 0;

  return (
    <Modal
      title={t('sim.title')}
      description={t('sim.subtitle', { id: rule.id })}
      onClose={onClose}
      size="md"
      footer={
        <>
          <button type="button" className={BUTTON} onClick={onClose}>
            {t('common.close')}
          </button>
          <button
            type="submit"
            form="simulation-form"
            className={BUTTON_PRIMARY}
            disabled={running}
          >
            {running ? t('sim.running') : t('sim.run')}
          </button>
        </>
      }
    >
      <form id="simulation-form" onSubmit={run} className="grid gap-3 sm:grid-cols-2">
        <Field id="simulation-requests" label={t('sim.requests')}>
          <input
            id="simulation-requests"
            name="requests"
            type="number"
            inputMode="numeric"
            min={1}
            max={100000}
            value={requests}
            onChange={(event) => setRequests(Math.max(1, Number(event.target.value)))}
            className={`${INPUT} num w-full`}
            data-autofocus
          />
        </Field>
        <Field id="simulation-seconds" label={t('sim.seconds')}>
          <input
            id="simulation-seconds"
            name="seconds"
            type="number"
            inputMode="numeric"
            min={0}
            max={86400}
            value={seconds}
            onChange={(event) => setSeconds(Math.max(0, Number(event.target.value)))}
            className={`${INPUT} num w-full`}
          />
        </Field>
        <p className="text-muted text-xs sm:col-span-2">{t('sim.note')}</p>
      </form>

      <div aria-live="polite" className="mt-3">
        {result && (
          <>
            <div
              className={`mb-3 flex items-center gap-2 rounded-md border px-3 py-2 text-[13px] font-medium ${result.allowed ? 'border-ok/40 bg-ok-soft text-ok' : 'border-bad/40 bg-bad-soft text-bad'}`}
            >
              {result.allowed ? (
                <CheckCircle2 size={16} aria-hidden />
              ) : (
                <XOctagon size={16} aria-hidden />
              )}
              {result.allowed
                ? t('sim.allowedAll', { count: formatCount(lastRequests) })
                : t('sim.rejectedSome', {
                    count: formatCount(lastRequests),
                    rejected: formatCount(rejected),
                  })}
            </div>
            {result.estimated && <Notice tone="warn">{t('sim.estimated')}</Notice>}
            <div role="region" aria-label={t('sim.title')} tabIndex={0} className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr>
                    <th scope="col" className={TH}>
                      {t('sim.band')}
                    </th>
                    <th scope="col" className={`${TH} text-right`}>
                      {t('sim.available')}
                    </th>
                    <th scope="col" className={`${TH} text-right`}>
                      {t('sim.consumed')}
                    </th>
                    <th scope="col" className={`${TH} text-right`}>
                      {t('sim.remainingCol')}
                    </th>
                    <th scope="col" className={TH}>
                      {t('sim.verdict')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.bands.map((band, index) => (
                    <tr key={`${band.label}-${index}`}>
                      <td className={TD}>
                        {band.windowSeconds
                          ? formatLimit(
                              { windowSeconds: band.windowSeconds, capacity: band.capacity },
                              locale
                            )
                          : band.label}
                      </td>
                      <td className={`${TD} num text-right`}>{formatCount(band.available)}</td>
                      <td className={`${TD} num text-right`}>{formatCount(band.consumed)}</td>
                      <td className={`${TD} num text-right`}>{formatCount(band.remaining)}</td>
                      <td className={TD}>
                        <Badge
                          tone={band.exceeded ? 'bad' : 'ok'}
                          icon={band.exceeded ? XOctagon : CheckCircle2}
                        >
                          {band.exceeded ? t('sim.exceeded') : t('sim.within')}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};
