'use client';

import React, { useState } from 'react';

import { AlertTriangle, CheckCircle, Play, XCircle } from 'lucide-react';

import { useTheme } from '../contexts/ThemeContext';
import { type Rule, type SimulationResult } from '../types';

interface SimulationPanelProps {
  rule: Rule;
  onClose: () => void;
}

export const SimulationPanel = ({ rule, onClose }: SimulationPanelProps) => {
  const { theme } = useTheme();
  const [key, setKey] = useState('192.168.1.100');
  const [path, setPath] = useState('/api/orders');
  const [burst, setBurst] = useState(15);
  const [result, setResult] = useState<SimulationResult | null>(null);

  const runSimulation = () => {
    setResult({
      allowed: burst <= 10,
      consumed: Math.min(burst, 10),
      remaining: Math.max(0, 10 - burst),
      bands: rule.bands.map((band) => ({
        label: band.label,
        capacity: band.capacity,
        consumed: Math.min(burst, band.capacity),
        remaining: Math.max(0, band.capacity - burst),
        exceeded: burst > band.capacity,
      })),
    });
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
              onClick={onClose}
              className={`${theme.colors.textMuted} transition-colors hover:opacity-80`}
            >
              <XCircle size={20} />
            </button>
          </div>
          <p className={`text-xs ${theme.colors.textTertiary} mt-1`}>Testing: {rule.name}</p>
        </div>

        <div className="space-y-4 p-4">
          <div>
            <label className={`block text-xs ${theme.colors.textTertiary} mb-1.5`}>
              Key (IP / User ID / API Key)
            </label>
            <input
              type="text"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className={`w-full px-3 py-2 ${theme.colors.bgInput} ${theme.colors.border} rounded-lg border text-sm ${theme.colors.textPrimary} placeholder-slate-500 focus:outline-none ${theme.colors.borderFocus} focus:ring-1 focus:ring-cyan-500/50`}
              placeholder="e.g., 192.168.1.100"
            />
          </div>

          <div>
            <label className={`block text-xs ${theme.colors.textTertiary} mb-1.5`}>Path</label>
            <input
              type="text"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              className={`w-full px-3 py-2 ${theme.colors.bgInput} ${theme.colors.border} rounded-lg border text-sm ${theme.colors.textPrimary} placeholder-slate-500 focus:outline-none ${theme.colors.borderFocus}`}
              placeholder="e.g., /api/orders"
            />
          </div>

          <div>
            <label className={`block text-xs ${theme.colors.textTertiary} mb-1.5`}>
              Burst Count
            </label>
            <input
              type="number"
              value={burst}
              onChange={(e) => setBurst(parseInt(e.target.value) || 0)}
              className={`w-full px-3 py-2 ${theme.colors.bgInput} ${theme.colors.border} rounded-lg border text-sm ${theme.colors.textPrimary} placeholder-slate-500 focus:outline-none ${theme.colors.borderFocus}`}
              min="1"
              max="1000"
            />
          </div>

          <button
            onClick={runSimulation}
            className={`w-full bg-gradient-to-r py-2.5 ${theme.colors.gradientPrimary} rounded-lg font-medium text-white transition-all duration-200 hover:opacity-90 ${theme.colors.shadowAccent}`}
          >
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
                            width: `${Math.min(100, (band.consumed / band.capacity) * 100)}%`,
                          }}
                        />
                      </div>
                      <span
                        className={`font-mono text-xs ${band.exceeded ? theme.colors.danger : theme.colors.textSecondary}`}
                      >
                        {band.consumed}/{band.capacity}
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
