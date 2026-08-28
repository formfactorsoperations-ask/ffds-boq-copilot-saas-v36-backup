/**
 * Centralized Application Design Tokens & UI Constants
 *
 * Defines the application's premium design tokens for BOQ Copilot:
 * - Milky White palette (#FDFDFB, #FAFAFA, #F5F5F0)
 * - Muted Gold accents (#C5A85C, #B4964B)
 * - Deep Navy / Slate text & headers (#0F172A, #1E293B, #334155)
 * - Standardized border radii (12px / rounded-xl for cards)
 * - Standardized padding scales (horizontal = 2x vertical for controls)
 * - Typography scales adhering to design system rules
 */

export const COLOR_TOKENS = {
  milkyWhite: '#FDFDFB',
  milkyWhiteCream: '#FAFAFA',
  milkyWhiteSubtle: '#F8F9FA',
  teamIndiaBlue: '#0066CC',
  teamIndiaBlueGlass: 'rgba(0, 102, 204, 0.9)',
  teamIndiaBlueHover: '#0055B3',
  goldAccent: '#C5A85C',
  goldAccentHover: '#B4964B',
  navyDark: '#0F172A',
  navyHeader: '#1E293B',
  slateBody: '#334155',
  borderLight: '#E2E8F0',
  borderMuted: '#E2E8F0/80',
};

export const RADII_TOKENS = {
  card: 'rounded-xl',
  button: 'rounded-lg',
  pill: 'rounded-full',
  inner: 'rounded-lg',
  modal: 'rounded-2xl',
};

export const PADDING_TOKENS = {
  card: 'p-6',
  cardCompact: 'p-4',
  container: 'p-6 md:p-8',
  buttonSm: 'px-4 py-2',
  buttonMd: 'px-6 py-3',
  buttonLg: 'px-8 py-4',
};

export const UI_STYLES = {
  // Theme & Colors
  colors: COLOR_TOKENS,
  radii: RADII_TOKENS,
  padding: PADDING_TOKENS,

  // Border utility classes consistent with Milky White theme and Navy + Gold palette
  border: {
    primary: "border-slate-200/80",
    accent: "border-[#C5A85C]/30",
    goldHairline: "border-[#C5A85C]",
    skyGlass: "border-sky-300/30",
    dark: "border-slate-800",
    focus: "focus:ring-2 focus:ring-[#0066CC]/50 focus:border-[#0066CC]",
  },

  // Padding with strict horizontal padding = 2x vertical padding
  button: {
    xs: "px-3 py-1.5 text-xs rounded-md font-medium inline-flex items-center justify-center gap-1.5 transition-all active:scale-[0.98]",
    sm: "px-4 py-2 text-sm rounded-lg font-medium inline-flex items-center justify-center gap-2 transition-all active:scale-[0.98]",
    md: "px-6 py-3 text-sm rounded-lg font-medium inline-flex items-center justify-center gap-2.5 transition-all active:scale-[0.98]",
    lg: "px-8 py-4 text-base rounded-xl font-semibold inline-flex items-center justify-center gap-3 transition-all active:scale-[0.98]",

    // Theme-specific button variants with glass polished finish
    primary: "bg-[#0066CC]/90 hover:bg-[#0055B3] text-white backdrop-blur-md border border-white/20 shadow-md shadow-sky-500/20 transition-all",
    secondary: "bg-[#FDFDFB] hover:bg-slate-50 text-slate-700 border border-slate-200/80 transition-colors shadow-sm",
    accent: "bg-[#C5A85C] hover:bg-[#B4964B] text-[#FDFDFB] transition-colors shadow-sm",
    ghost: "text-slate-600 hover:bg-slate-100 transition-colors",
    danger: "bg-rose-600 hover:bg-rose-700 text-white transition-colors shadow-sm",
  },

  // Font scales using a Low Contrast scale for clean UI density
  // Minimum body size is 16px (text-base)
  font: {
    display: "font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl",
    h1: "text-xl font-bold tracking-tight text-slate-900 sm:text-2xl",
    h2: "text-lg font-semibold tracking-tight text-slate-900",
    h3: "text-base font-semibold text-slate-800",
    body: "text-base leading-relaxed text-slate-600",
    sm: "text-sm leading-normal text-slate-500",
    xs: "text-xs font-medium text-slate-400",
  },

  // Container styling matching the Milky White & Team India Blue polished glass aesthetic
  container: {
    base: "p-6 bg-[#FDFDFB] border border-slate-200/80 rounded-xl shadow-sm",
    inner: "p-4 bg-slate-50/50 rounded-lg",
    card: "p-6 bg-[#FDFDFB] border border-slate-200/80 rounded-xl shadow-sm hover:shadow-md transition-all duration-200",
    glassBanner: "p-6 bg-[#0066CC]/90 backdrop-blur-md text-white border border-white/20 rounded-xl shadow-lg shadow-sky-600/20",
    header: "p-4 bg-[#FDFDFB] border-b border-slate-200/80 flex items-center justify-between",
  },
};

export const UI_CONSTANTS = UI_STYLES;
