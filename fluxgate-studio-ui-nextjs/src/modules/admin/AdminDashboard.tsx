'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { signOut, useSession } from 'next-auth/react';

import {
  AlertCircle,
  Download,
  Layers,
  Loader2,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Upload,
  User,
} from 'lucide-react';

import {
  ApiError,
  assertSafeRuleNumbers,
  createRule as apiCreateRule,
  type CreateRuleRequest,
  deleteRule as apiDeleteRule,
  exportRules as apiExportRules,
  fetchDashboardStats,
  fetchRules,
  importRules as apiImportRules,
  toggleRule as apiToggleRule,
  updateRule as apiUpdateRule,
} from '@/lib/api';
import {
  mapApiRuleToRule,
  mapApiStatsToStats,
  mapRuleToCreateRequest,
  mapRuleToUpdateRequest,
} from '@/lib/mappers';

import {
  Badge,
  RuleCard,
  RuleFormPanel,
  SimulationPanel,
  StatCard,
  ThemeSwitcher,
} from './components';
import { useTheme } from './contexts/ThemeContext';
import { ruleIdentity } from './types';
import { type FieldErrors, type Rule, type Stats } from './types';

/**
 * Turns the server's `ErrorResponse.details` entries (`"name: name is required"`) into the
 * per-field map the rule form renders inline.
 */
function toFieldErrors(details: string[]): FieldErrors {
  const errors: FieldErrors = {};
  for (const detail of details) {
    const separator = detail.indexOf(':');
    if (separator > 0) {
      errors[detail.slice(0, separator).trim()] = detail.slice(separator + 1).trim();
    }
  }
  return errors;
}

export const AdminDashboard = () => {
  const { theme } = useTheme();
  const { data: session } = useSession();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRule, setSelectedRule] = useState<Rule | null>(null);
  const [showSimulation, setShowSimulation] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [rules, setRules] = useState<Rule[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<FieldErrors>({});
  const importInputRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [rulesData, statsData] = await Promise.all([fetchRules(), fetchDashboardStats()]);
      setRules(rulesData.map(mapApiRuleToRule));
      setStats(mapApiStatsToStats(statsData));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredRules = rules.filter(
    (rule) =>
      rule.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rule.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleToggle = async (rule: Rule) => {
    try {
      const updatedRule = await apiToggleRule(rule.id, rule.ruleSetId);
      setRules(
        rules.map((r) =>
          ruleIdentity(r) === ruleIdentity(rule) ? mapApiRuleToRule(updatedRule) : r
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle rule');
    }
  };

  const handleDelete = async (rule: Rule) => {
    try {
      await apiDeleteRule(rule.id, rule.ruleSetId);
      setRules(rules.filter((r) => ruleIdentity(r) !== ruleIdentity(rule)));
      // Refresh stats
      const statsData = await fetchDashboardStats();
      setStats(mapApiStatsToStats(statsData));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete rule');
    }
  };

  const handleSave = async (data: Partial<Rule> & { id: string }) => {
    try {
      setFormErrors({});
      if (selectedRule) {
        // Read values may have been rounded for display; never write back an unsafe snapshot.
        assertSafeRuleNumbers(selectedRule);
        // Update existing rule
        const updatedRule = await apiUpdateRule(
          data.id,
          mapRuleToUpdateRequest(data),
          selectedRule.ruleSetId
        );
        setRules(
          rules.map((r) =>
            ruleIdentity(r) === ruleIdentity(selectedRule) ? mapApiRuleToRule(updatedRule) : r
          )
        );
      } else {
        // Create new rule
        const newRule = await apiCreateRule(mapRuleToCreateRequest(data));
        setRules([...rules, mapApiRuleToRule(newRule)]);
      }
      // Refresh stats
      const statsData = await fetchDashboardStats();
      setStats(mapApiStatsToStats(statsData));
      setShowForm(false);
      setSelectedRule(null);
    } catch (err) {
      if (err instanceof ApiError && err.details.length > 0) {
        setFormErrors(toFieldErrors(err.details));
      }
      setError(err instanceof Error ? err.message : 'Failed to save rule');
    }
  };

  const handleExport = async () => {
    try {
      const exported = await apiExportRules();
      const blob = new Blob([exported], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `fluxgate-rules-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setNotice('Exported rules without changing the original JSON.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export rules');
    }
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset the input so selecting the same file again re-triggers the change event.
    event.target.value = '';
    if (!file) {
      return;
    }

    try {
      const parsed = JSON.parse(await file.text());
      const payload: CreateRuleRequest[] = Array.isArray(parsed) ? parsed : parsed.rules;
      if (!Array.isArray(payload) || payload.length === 0) {
        setError('The selected file does not contain a rule array.');
        return;
      }
      payload.forEach(assertSafeRuleNumbers);
      const confirmed = window.confirm(
        `Import ${payload.length} rule(s) from "${file.name}"? Rules with an existing id will be` +
          ' overwritten.'
      );
      if (!confirmed) {
        return;
      }

      const result = await apiImportRules(payload);
      setNotice(
        `Imported ${result.total} rule(s): ${result.created} created, ${result.updated} updated.`
      );
      await loadData();
    } catch (err) {
      if (err instanceof SyntaxError) {
        setError('The selected file is not valid JSON.');
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to import rules');
    }
  };

  return (
    <div className={`min-h-screen ${theme.colors.bg} transition-colors duration-300`}>
      {/* Background effects */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div
          className={`absolute top-0 left-1/4 h-96 w-96 ${theme.colors.bgGlow} rounded-full opacity-50 blur-3xl`}
        />
        <div
          className={`absolute right-1/4 bottom-0 h-96 w-96 ${theme.colors.bgGlow} rounded-full opacity-50 blur-3xl`}
        />
      </div>

      <div className="relative">
        {/* Header */}
        <header
          className={`${theme.colors.borderSubtle} border-b backdrop-blur-xl ${theme.colors.bg}/80 sticky top-0 z-40`}
        >
          <div className="mx-auto max-w-7xl px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className={`absolute inset-0 ${theme.colors.bgGlow} rounded-lg blur-lg`} />
                  <Image
                    src="/logo.svg"
                    alt="FluxGate"
                    width={40}
                    height={40}
                    className="relative rounded-lg"
                  />
                </div>
                <div>
                  <h1 className="text-lg font-bold tracking-tight">
                    <span
                      className={`bg-gradient-to-r bg-clip-text text-transparent ${theme.colors.gradientPrimary}`}
                    >
                      FluxGate
                    </span>
                    <span className={`${theme.colors.textTertiary} ml-2 font-normal`}>Admin</span>
                  </h1>
                  <p className={`text-[10px] ${theme.colors.textMuted} tracking-wider uppercase`}>
                    Rate Limit Management
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <button
                  onClick={loadData}
                  disabled={loading}
                  className={`p-2 ${theme.colors.textTertiary} ${theme.colors.bgCardHover} rounded-lg transition-colors disabled:opacity-50`}
                  title="Refresh data"
                >
                  <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                </button>
                <div className={`h-6 w-px ${theme.colors.border}`} />
                <ThemeSwitcher />
                <div className={`h-6 w-px ${theme.colors.border}`} />
                {/* User Menu */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full ${theme.colors.bgTertiary}`}
                    >
                      <User size={16} className={theme.colors.textTertiary} />
                    </div>
                    <span className={`text-sm ${theme.colors.textSecondary}`}>
                      {session?.user?.name || session?.user?.email || 'User'}
                    </span>
                  </div>
                  <button
                    onClick={() => signOut({ callbackUrl: '/login' })}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm ${theme.colors.textTertiary} ${theme.colors.bgCardHover} transition-colors hover:text-red-400`}
                    title="Sign out"
                  >
                    <LogOut size={16} />
                    <span className="hidden sm:inline">Sign out</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="mx-auto max-w-7xl px-6 py-8">
          {/* Error Banner */}
          {error && (
            <div
              className={`mb-6 p-4 ${theme.colors.dangerBg} ${theme.colors.dangerBorder} flex items-center gap-3 rounded-lg border`}
            >
              <AlertCircle size={20} className={theme.colors.danger} />
              <span className={theme.colors.danger}>{error}</span>
              <button
                onClick={() => setError(null)}
                className={`ml-auto ${theme.colors.danger} hover:opacity-70`}
              >
                ×
              </button>
            </div>
          )}

          {/* Notice Banner */}
          {notice && (
            <div
              className={`mb-6 p-4 ${theme.colors.successBg} ${theme.colors.successBorder} flex items-center gap-3 rounded-lg border`}
            >
              <span className={theme.colors.success}>{notice}</span>
              <button
                type="button"
                onClick={() => setNotice(null)}
                aria-label="Dismiss"
                className={`ml-auto ${theme.colors.success} hover:opacity-70`}
              >
                ×
              </button>
            </div>
          )}

          {/* Loading State */}
          {loading && !stats && (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={32} className={`${theme.colors.accent} animate-spin`} />
            </div>
          )}

          {/* Stats */}
          {stats && (
            <div className="mb-8 grid grid-cols-4 gap-4">
              <StatCard icon={Layers} label="Total Rules" value={stats.totalRules} />
              <StatCard
                icon={Shield}
                label="Active Rules"
                value={stats.activeRules}
                subValue={`${stats.disabledRules} disabled`}
              />
              <StatCard icon={Layers} label="Rule Sets" value={stats.totalRuleSets} />
              <StatCard
                icon={RefreshCw}
                label="Last Updated"
                value={new Date(stats.lastUpdated).toLocaleTimeString()}
                subValue={new Date(stats.lastUpdated).toLocaleDateString()}
              />
            </div>
          )}

          {/* Rules Section */}
          <div
            className={`${theme.colors.bgCard} backdrop-blur ${theme.colors.border} overflow-hidden rounded-2xl border`}
          >
            <div
              className={`p-4 ${theme.colors.borderSubtle} border-b ${theme.colors.bgSecondary}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className={`font-semibold ${theme.colors.textPrimary}`}>Rate Limit Rules</h2>
                  <Badge variant="info">{filteredRules.length} rules</Badge>
                </div>

                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Search
                      size={14}
                      className={`absolute top-1/2 left-3 -translate-y-1/2 ${theme.colors.textMuted}`}
                    />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search rules..."
                      className={`py-2 pr-4 pl-9 ${theme.colors.bgInput} ${theme.colors.borderSubtle} rounded-lg border text-sm ${theme.colors.textPrimary} placeholder-slate-500 focus:outline-none ${theme.colors.borderFocus} w-64`}
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleExport}
                      className={`flex items-center gap-1.5 px-3 py-2 text-sm ${theme.colors.textTertiary} ${theme.colors.bgCardHover} rounded-lg transition-colors`}
                    >
                      <Download size={14} />
                      Export
                    </button>
                    <input
                      ref={importInputRef}
                      type="file"
                      accept="application/json,.json"
                      onChange={handleImportFile}
                      className="hidden"
                      aria-hidden="true"
                      tabIndex={-1}
                    />
                    <button
                      type="button"
                      onClick={() => importInputRef.current?.click()}
                      className={`flex items-center gap-1.5 px-3 py-2 text-sm ${theme.colors.textTertiary} ${theme.colors.bgCardHover} rounded-lg transition-colors`}
                    >
                      <Upload size={14} />
                      Import
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedRule(null);
                        setFormErrors({});
                        setShowForm(true);
                      }}
                      className={`flex items-center gap-1.5 bg-gradient-to-r px-4 py-2 ${theme.colors.gradientPrimary} rounded-lg text-sm font-medium text-white transition-all hover:opacity-90 ${theme.colors.shadowAccent}`}
                    >
                      <Plus size={14} />
                      New Rule
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4">
              <div className="grid grid-cols-2 gap-4">
                {filteredRules.map((rule) => (
                  <RuleCard
                    key={ruleIdentity(rule)}
                    rule={rule}
                    onEdit={(r) => {
                      setSelectedRule(r);
                      setFormErrors({});
                      setShowForm(true);
                    }}
                    onSimulate={(r) => {
                      setSelectedRule(r);
                      setShowSimulation(true);
                    }}
                    onToggle={handleToggle}
                    onDelete={handleDelete}
                  />
                ))}
              </div>

              {filteredRules.length === 0 && !loading && (
                <div className="py-12 text-center">
                  <div className={`inline-flex p-4 ${theme.colors.bgTertiary} mb-4 rounded-full`}>
                    <Shield size={24} className={theme.colors.textMuted} />
                  </div>
                  <p className={theme.colors.textTertiary}>
                    {searchQuery ? 'No rules match your search' : 'No rules found'}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRule(null);
                      setFormErrors({});
                      setShowForm(true);
                    }}
                    className={`mt-4 text-sm ${theme.colors.accent}`}
                  >
                    Create your first rule →
                  </button>
                </div>
              )}
            </div>
          </div>
        </main>

        {showSimulation && selectedRule && (
          <SimulationPanel
            rule={selectedRule}
            onClose={() => {
              setShowSimulation(false);
              setSelectedRule(null);
            }}
          />
        )}

        {showForm && (
          <RuleFormPanel
            rule={selectedRule}
            serverErrors={formErrors}
            onClose={() => {
              setShowForm(false);
              setSelectedRule(null);
              setFormErrors({});
            }}
            onSave={handleSave}
          />
        )}
      </div>
    </div>
  );
};
