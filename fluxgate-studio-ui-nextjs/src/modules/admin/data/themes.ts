import { type Theme } from '../types';

export const themes: Record<string, Theme> = {
  light: {
    name: 'Light',
    colors: {
      // Backgrounds
      bg: 'bg-slate-50',
      bgSecondary: 'bg-white',
      bgTertiary: 'bg-slate-100',
      bgCard: 'bg-white',
      bgCardHover: 'hover:bg-slate-50',
      bgInput: 'bg-slate-100',
      bgOverlay: 'bg-black/50',
      bgGlow: 'bg-cyan-500/10',

      // Borders
      border: 'border-slate-200',
      borderHover: 'hover:border-cyan-400',
      borderFocus: 'focus:border-cyan-500',
      borderSubtle: 'border-slate-100',

      // Text
      textPrimary: 'text-slate-900',
      textSecondary: 'text-slate-600',
      textTertiary: 'text-slate-500',
      textMuted: 'text-slate-400',
      textInverse: 'text-white',

      // Accents
      accent: 'text-cyan-600',
      accentBg: 'bg-cyan-500',
      accentBgLight: 'bg-cyan-50',
      accentBorder: 'border-cyan-200',

      // Status
      success: 'text-emerald-600',
      successBg: 'bg-emerald-50',
      successBorder: 'border-emerald-200',
      warning: 'text-amber-600',
      warningBg: 'bg-amber-50',
      warningBorder: 'border-amber-200',
      danger: 'text-red-600',
      dangerBg: 'bg-red-50',
      dangerBorder: 'border-red-200',
      info: 'text-cyan-600',
      infoBg: 'bg-cyan-50',
      infoBorder: 'border-cyan-200',

      // Shadows
      shadow: 'shadow-lg shadow-slate-200/50',
      shadowCard: 'shadow-sm shadow-slate-100',
      shadowAccent: 'shadow-lg shadow-cyan-500/20',

      // Gradients
      gradientPrimary: 'from-cyan-500 to-teal-500',
      gradientCard: 'from-slate-50 to-white',
      gradientGlow: 'from-cyan-500/5 to-teal-500/5',
    },
  },
  dark: {
    name: 'Dark',
    colors: {
      // Backgrounds
      bg: 'bg-slate-950',
      bgSecondary: 'bg-slate-900',
      bgTertiary: 'bg-slate-800',
      bgCard: 'bg-slate-900/60',
      bgCardHover: 'hover:bg-slate-800/50',
      bgInput: 'bg-slate-800',
      bgOverlay: 'bg-black/80',
      bgGlow: 'bg-cyan-500/20',

      // Borders
      border: 'border-slate-800',
      borderHover: 'hover:border-cyan-700/50',
      borderFocus: 'focus:border-cyan-600',
      borderSubtle: 'border-slate-800/50',

      // Text
      textPrimary: 'text-white',
      textSecondary: 'text-slate-300',
      textTertiary: 'text-slate-400',
      textMuted: 'text-slate-500',
      textInverse: 'text-slate-900',

      // Accents
      accent: 'text-cyan-400',
      accentBg: 'bg-cyan-500',
      accentBgLight: 'bg-cyan-500/20',
      accentBorder: 'border-cyan-800/50',

      // Status
      success: 'text-emerald-400',
      successBg: 'bg-emerald-950/50',
      successBorder: 'border-emerald-800/50',
      warning: 'text-amber-400',
      warningBg: 'bg-amber-950/50',
      warningBorder: 'border-amber-800/50',
      danger: 'text-red-400',
      dangerBg: 'bg-red-950/50',
      dangerBorder: 'border-red-800/50',
      info: 'text-cyan-400',
      infoBg: 'bg-cyan-950/50',
      infoBorder: 'border-cyan-800/50',

      // Shadows
      shadow: 'shadow-2xl shadow-black/50',
      shadowCard: 'shadow-lg shadow-black/20',
      shadowAccent: 'shadow-lg shadow-cyan-500/20',

      // Gradients
      gradientPrimary: 'from-cyan-600 to-teal-600',
      gradientCard: 'from-slate-900 to-slate-800',
      gradientGlow: 'from-cyan-500/10 to-teal-500/10',
    },
  },
  midnight: {
    name: 'Midnight',
    colors: {
      // Ultra dark with purple accents
      bg: 'bg-[#0a0a12]',
      bgSecondary: 'bg-[#12121f]',
      bgTertiary: 'bg-[#1a1a2e]',
      bgCard: 'bg-[#12121f]/80',
      bgCardHover: 'hover:bg-[#1a1a2e]/50',
      bgInput: 'bg-[#1a1a2e]',
      bgOverlay: 'bg-black/90',
      bgGlow: 'bg-violet-500/20',

      border: 'border-violet-900/30',
      borderHover: 'hover:border-violet-500/50',
      borderFocus: 'focus:border-violet-500',
      borderSubtle: 'border-violet-900/20',

      textPrimary: 'text-white',
      textSecondary: 'text-slate-300',
      textTertiary: 'text-slate-400',
      textMuted: 'text-slate-500',
      textInverse: 'text-slate-900',

      accent: 'text-violet-400',
      accentBg: 'bg-violet-500',
      accentBgLight: 'bg-violet-500/20',
      accentBorder: 'border-violet-800/50',

      success: 'text-emerald-400',
      successBg: 'bg-emerald-950/50',
      successBorder: 'border-emerald-800/50',
      warning: 'text-amber-400',
      warningBg: 'bg-amber-950/50',
      warningBorder: 'border-amber-800/50',
      danger: 'text-rose-400',
      dangerBg: 'bg-rose-950/50',
      dangerBorder: 'border-rose-800/50',
      info: 'text-violet-400',
      infoBg: 'bg-violet-950/50',
      infoBorder: 'border-violet-800/50',

      shadow: 'shadow-2xl shadow-violet-950/50',
      shadowCard: 'shadow-lg shadow-violet-950/30',
      shadowAccent: 'shadow-lg shadow-violet-500/20',

      gradientPrimary: 'from-violet-600 to-fuchsia-600',
      gradientCard: 'from-[#12121f] to-[#1a1a2e]',
      gradientGlow: 'from-violet-500/10 to-fuchsia-500/10',
    },
  },
};
