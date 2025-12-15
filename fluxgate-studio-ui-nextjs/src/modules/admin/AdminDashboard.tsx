'use client';

import React, { useCallback, useEffect, useState } from 'react';
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
  createRule as apiCreateRule,
  deleteRule as apiDeleteRule,
  fetchDashboardStats,
  fetchRules,
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
import { type Rule, type Stats } from './types';

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

  const handleToggle = async (id: string) => {
    try {
      const updatedRule = await apiToggleRule(id);
      setRules(rules.map((r) => (r.id === id ? mapApiRuleToRule(updatedRule) : r)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle rule');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiDeleteRule(id);
      setRules(rules.filter((r) => r.id !== id));
      // Refresh stats
      const statsData = await fetchDashboardStats();
      setStats(mapApiStatsToStats(statsData));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete rule');
    }
  };

  const handleSave = async (data: Partial<Rule> & { id: string }) => {
    try {
      if (selectedRule) {
        // Update existing rule
        const updatedRule = await apiUpdateRule(data.id, mapRuleToUpdateRequest(data));
        setRules(rules.map((r) => (r.id === data.id ? mapApiRuleToRule(updatedRule) : r)));
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
      setError(err instanceof Error ? err.message : 'Failed to save rule');
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
                      className={`flex items-center gap-1.5 px-3 py-2 text-sm ${theme.colors.textTertiary} ${theme.colors.bgCardHover} rounded-lg transition-colors`}
                    >
                      <Download size={14} />
                      Export
                    </button>
                    <button
                      className={`flex items-center gap-1.5 px-3 py-2 text-sm ${theme.colors.textTertiary} ${theme.colors.bgCardHover} rounded-lg transition-colors`}
                    >
                      <Upload size={14} />
                      Import
                    </button>
                    <button
                      onClick={() => {
                        setSelectedRule(null);
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
                    key={rule.id}
                    rule={rule}
                    onEdit={(r) => {
                      setSelectedRule(r);
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
                    onClick={() => {
                      setSelectedRule(null);
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
            onClose={() => {
              setShowForm(false);
              setSelectedRule(null);
            }}
            onSave={handleSave}
          />
        )}
      </div>
    </div>
  );
};
