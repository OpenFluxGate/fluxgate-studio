// ============================================
// Types
// ============================================

export interface RateBand {
  windowSeconds: number;
  capacity: number;
  label: string;
}

export type RuleScope = 'PER_IP' | 'PER_USER' | 'PER_API_KEY' | 'GLOBAL' | 'CUSTOM';
export type LimitExceedPolicy = 'REJECT_REQUEST' | 'WAIT_FOR_REFILL';

export interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  scope: RuleScope;
  keyStrategyId: string;
  onLimitExceedPolicy: LimitExceedPolicy;
  bands: RateBand[];
  ruleSetId: string | null;
  tags: string[];
  attributes: Record<string, unknown>;
}

export interface Stats {
  totalRules: number;
  activeRules: number;
  disabledRules: number;
  totalRuleSets: number;
  lastUpdated: string;
}

export interface ThemeColors {
  // Backgrounds
  bg: string;
  bgSecondary: string;
  bgTertiary: string;
  bgCard: string;
  bgCardHover: string;
  bgInput: string;
  bgOverlay: string;
  bgGlow: string;

  // Borders
  border: string;
  borderHover: string;
  borderFocus: string;
  borderSubtle: string;

  // Text
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textMuted: string;
  textInverse: string;

  // Accents
  accent: string;
  accentBg: string;
  accentBgLight: string;
  accentBorder: string;

  // Status
  success: string;
  successBg: string;
  successBorder: string;
  warning: string;
  warningBg: string;
  warningBorder: string;
  danger: string;
  dangerBg: string;
  dangerBorder: string;
  info: string;
  infoBg: string;
  infoBorder: string;

  // Shadows
  shadow: string;
  shadowCard: string;
  shadowAccent: string;

  // Gradients
  gradientPrimary: string;
  gradientCard: string;
  gradientGlow: string;
}

export interface Theme {
  name: string;
  colors: ThemeColors;
}

export interface SimulationResult {
  allowed: boolean;
  consumed: number;
  remaining: number;
  bands: {
    label: string;
    capacity: number;
    consumed: number;
    remaining: number;
    exceeded: boolean;
  }[];
}
