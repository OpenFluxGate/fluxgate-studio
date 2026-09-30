'use client';

import React, { useState } from 'react';

import { AlertTriangle, CheckCircle, Loader2, Play, XCircle } from 'lucide-react';

import { simulateRule } from '@/lib/api';

import { useTheme } from '../contexts/ThemeContext';
import { type Rule, type SimulationResult } from '../types';

interface SimulationPanelProps {
  rule: Rule;
  onClose: () => void;
}

/**
 * Tokens a band offers to a burst spread over `seconds`, starting from a full bucket.
 *
 * Mirrors the server side computation in `RuleService.availableTokens` and is only used as a
 * fallback when the simulate endpoint cannot be reached.
 */
function availableTokens(capacity: number, windowSeconds: number, seconds: number): number {
  if (windowSeconds <= 0) {
    return capacity;
  }
  return capacity + Math.floor((capacity * seconds) / windowSeconds);
}

/** Client-side fallback mirroring `POST /api/rules/{id}/simulate`. */
export function simulateLocally(rule: Rule, requests: number, seconds: number): SimulationResult {
  const bands = rule.bands.map((band) => {
    const available = availableTokens(band.capacity, band.windowSeconds, seconds);
    return {
      label: band.label || `${band.capacity}-per-${band.windowSeconds}s`,
      capacity: band.capacity,
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
  const { theme } = useTheme();
  const [key, setKey] = useState('192.168.1.100');
  const [path, setPath] = useState('/api/orders');
  const [burst, setBurst] = useState(15);
  const [seconds, setSeconds] = useState(1);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);

  const runSimulation = async () => {
    setRunning(true);
    try {
      const simulation = await simulateRule(rule.id, burst, seconds);
      setResult({
        allowed: simulation.allowed,
        consumed: simulation.consumed,
        remaining: simulation.remaining,
        bands: simulation.bands.map((band) => ({
          label: band.label || `${band.capacity}-per-${band.windowSeconds}s`,
          capacity: band.capacity,
          available: band.available,
          consumed: band.consumed,
          remaining: band.remaining,
          exceeded: band.exceeded,
        })),
      });
    } catch (error) {
      // The dry-run is pure arithmetic, so a failed call degrades to the same computation locally.
      console.warn('Simulate endpoint unavailable, computing locally instead', error);
      setResult(simulateLocally(rule, burst, seconds));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div
      className={`fixed inset-0 ${theme.colors.bgOverlay} z-50 flex items-center justify-center p-4 backdrop-blur-sm`}
    >
      <div
        className={`${theme.colors.bgSecondary} ${theme.colors.border} w-full max-w-lg overflow-hidden rounded-2xl border ${theme.colors.shadow}`}
      >
        <div
          className={`p-4 ${theme.colors.borderSubtle} border-b bg-gradient-to-r ${theme.colors.gradientGlow}`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`p-1.5 ${theme.colors.accentBgLight} rounded-lg`}>
                <Play size={16} className={theme.colors.accent} />
              </div>
              <h2 className={`font-semibold ${theme.colors.textPrimary}`}>Simulation</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className={`${theme.colors.textMuted} transition-colors hover:opacity-80`}
            >
              <XCircle size={20} />
            </button>
          </div>
          <p className={`text-xs ${theme.colors.textTertiary} mt-1`}>Testing: {rule.name}</p>
        </div>

        <div className="space-y-4 p-4">
          <div>
            <label
              htmlFor="simulation-key"
              className={`block text-xs ${theme.colors.textTertiary} mb-1.5`}
            >
              Key (IP / User ID / API Key)
            </label>
            <input
              id="simulation-key"
              type="text"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className={`w-full px-3 py-2 ${theme.colors.bgInput} ${theme.colors.border} rounded-lg border text-sm ${theme.colors.textPrimary} placeholder-slate-500 focus:outline-none ${theme.colors.borderFocus} focus:ring-1 focus:ring-cyan-500/50`}
              placeholder="e.g., 192.168.1.100"
            />
          </div>

          <div>
            <label
              htmlFor="simulation-path"
              className={`block text-xs ${theme.colors.textTertiary} mb-1.5`}
            >
              Path
            </label>
            <input
              id="simulation-path"
              type="text"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              className={`w-full px-3 py-2 ${theme.colors.bgInput} ${theme.colors.border} rounded-lg border text-sm ${theme.colors.textPrimary} placeholder-slate-500 focus:outline-none ${theme.colors.borderFocus}`}
              placeholder="e.g., /api/orders"
            />
            <p className={`mt-1 text-[10px] ${theme.colors.textMuted}`}>
              The dry-run is computed from the rule&apos;s bands and does not read live bucket
              state, so key and path are context for you rather than inputs to the calculation.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="simulation-burst"
                className={`block text-xs ${theme.colors.textTertiary} mb-1.5`}
              >
                Burst Count
              </label>
              <input
                id="simulation-burst"
                type="number"
                value={burst}
                onChange={(e) => setBurst(parseInt(e.target.value, 10) || 0)}
                className={`w-full px-3 py-2 ${theme.colors.bgInput} ${theme.colors.border} rounded-lg border text-sm ${theme.colors.textPrimary} placeholder-slate-500 focus:outline-none ${theme.colors.borderFocus}`}
                min="1"
                max="1000"
              />
            </div>
            <div>
              <label
                htmlFor="simulation-seconds"
                className={`block text-xs ${theme.colors.textTertiary} mb-1.5`}
              >
                Over (sec)
              </label>
              <input
                id="simulation-seconds"
                type="number"
                value={seconds}
                onChange={(e) => setSeconds(parseInt(e.target.value, 10) || 1)}
                className={`w-full px-3 py-2 ${theme.colors.bgInput} ${theme.colors.border} rounded-lg border text-sm ${theme.colors.textPrimary} placeholder-slate-500 focus:outline-none ${theme.colors.borderFocus}`}
                min="1"
                max="86400"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={runSimulation}
            disabled={running}
            className={`flex w-full items-center justify-center gap-2 bg-gradient-to-r py-2.5 ${theme.colors.gradientPrimary} rounded-lg font-medium text-white transition-all duration-200 hover:opacity-90 disabled:opacity-60 ${theme.colors.shadowAccent}`}
          >
            {running && <Loader2 size={16} className="animate-spin" />}
            Run Simulation
          </button>

          {result && (
            <div
              className={`mt-4 p-4 ${theme.colors.bgTertiary} rounded-xl ${theme.colors.borderSubtle} border`}
            >
              <div className="mb-3 flex items-center gap-2">
                {result.allowed ? (
                  <CheckCircle size={18} className={theme.colors.success} />
                ) : (
                  <AlertTriangle size={18} className={theme.colors.danger} />
                )}
                <span
                  className={`font-medium ${result.allowed ? theme.colors.success : theme.colors.danger}`}
                >
                  {result.allowed ? 'Request Allowed' : 'Rate Limit Exceeded'}
                </span>
                {result.estimated && (
                  <span className={`text-[10px] ${theme.colors.textMuted} uppercase`}>
                    estimated locally
                  </span>
                )}
              </div>

              <div className="space-y-2">
                {result.bands.map((band, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm">
                    <span className={theme.colors.textTertiary}>{band.label}</span>
                    <div className="flex items-center gap-2">
                      <div
                        className={`h-1.5 w-24 ${theme.colors.bgInput} overflow-hidden rounded-full`}
                      >
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            band.exceeded ? 'bg-red-500' : 'bg-cyan-500'
                          }`}
                          style={{
                            width: `${Math.min(100, (band.consumed / Math.max(1, band.available)) * 100)}%`,
                          }}
                        />
                      </div>
                      <span
                        className={`font-mono text-xs ${band.exceeded ? theme.colors.danger : theme.colors.textSecondary}`}
                      >
                        {band.consumed}/{band.available}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
