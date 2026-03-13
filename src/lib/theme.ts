/**
 * Lowpass Design System - Light Mode
 * Complete color, typography, and spacing definitions
 * Based on Figma light mode design
 */

export const colors = {
  // Brand
  primary: '#FF4500',      // Orange
  brown: '#6A1D01',        // Dark brown (primary bg for sidebar)

  // Backgrounds
  background: '#FFFFFF',   // Main background
  surface: '#F5F5F5',      // Secondary surface
  surfaceHover: '#EFEFEF', // Hover state

  // Text
  text: '#0F0F0F',         // Primary text
  textSecondary: '#737373', // Secondary text
  textTertiary: '#999999', // Tertiary text (lighter)
  textMuted: 'rgba(15, 15, 15, 0.8)', // Muted text

  // Borders & Dividers
  border: '#E5E6EE',       // Border color
  borderLight: 'rgba(51, 42, 28, 0.60)', // Light border (orange-tinted)

  // Semantic Colors
  success: '#10B981',      // Green/Emerald
  error: '#EF4444',        // Red
  warning: '#F59E0B',      // Amber
  info: '#3B82F6',         // Blue

  // Section Indicators (for budget categories)
  income: '#10B981',       // Green
  expenses: '#EF4444',     // Red
  overheads: '#7C3AED',    // Purple
  transport: '#34D399',    // Teal
  production: '#FB923C',   // Orange
  hotels: '#60A5FA',       // Light blue
  flights: '#38BDF8',      // Sky

  // Gradients
  sidebarGradient: 'linear-gradient(0deg, #6A1D01 0%, #FFC0A3 20%, white 95%)',
  cardGradient: 'linear-gradient(270deg, rgba(255, 69, 0, 0.05) 5%, rgba(255, 228, 220, 0.04) 14%, rgba(255, 228.29, 219.61, 0.04) 86%, rgba(255, 62.91, 0.48, 0.05) 100%)',

  // Opacity variants
  white80: 'rgba(255, 255, 255, 0.80)',
  white79: 'rgba(255, 255, 255, 0.79)',
  black5: 'rgba(0, 0, 0, 0.05)',
  black10: 'rgba(0, 0, 0, 0.10)',
};

export const typography = {
  // Font family
  fontFamily: 'SF Pro, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',

  // Font sizes
  sizes: {
    xs: '10px',    // Labels, small text
    sm: '11px',    // Section headers
    base: '12px',  // Body text
    md: '13px',    // Medium
    lg: '14px',    // Large
    xl: '18px',    // Extra large
    '2xl': '24px', // Headings
    '3xl': '36px', // Large headings
    '4xl': '38.4px', // Hero text
  },

  // Font weights
  weights: {
    light: 400,
    normal: 500,
    semibold: 590,
    bold: 700,
  },

  // Line heights
  lineHeights: {
    tight: '15px',
    normal: '16px',
    relaxed: '20px',
    spacious: '32px',
  },

  // Letter spacing
  letterSpacing: {
    tight: '0px',
    normal: '0.60px',
    wide: '1px',
    wider: '1.10px',
    widest: '1.80px',
  },
};

export const spacing = {
  xs: '4px',
  sm: '6px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  '2xl': '20px',
  '3xl': '24px',
  '4xl': '32px',
};

export const radius = {
  sm: '4px',
  md: '6px',
  lg: '8px',
  xl: '12px',
};

export const shadows = {
  sm: '0 1px 2px rgba(0, 0, 0, 0.05)',
  md: '0 4px 4px rgba(0, 0, 0, 0.10)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.10)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.10)',
};

// Component-specific token sets
export const components = {
  sidebar: {
    width: '260px',
    background: colors.sidebarGradient,
    borderRight: `1px solid ${colors.primary}`,
  },

  header: {
    height: '64px',
    background: colors.white80,
    backdrop: 'blur(4px)',
    padding: spacing['2xl'],
  },

  card: {
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.lg,
    padding: spacing['3xl'],
  },

  button: {
    primary: {
      background: colors.brown,
      text: colors.primary,
      padding: `${spacing.sm} ${spacing.lg}`,
      borderRadius: radius.sm,
    },
    secondary: {
      background: 'transparent',
      text: colors.text,
      border: `1px solid ${colors.border}`,
    },
  },

  input: {
    background: colors.background,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.md,
    padding: `${spacing.md} ${spacing.lg}`,
  },

  table: {
    headerBackground: colors.surface,
    headerText: colors.text,
    rowBorder: `1px solid ${colors.border}`,
    rowHover: colors.surfaceHover,
  },
};

/**
 * CSS Custom Properties for Tailwind integration
 * Use these in your tailwind.config.ts
 */
export const cssVariables = {
  '--color-primary': colors.primary,
  '--color-brown': colors.brown,
  '--color-background': colors.background,
  '--color-surface': colors.surface,
  '--color-text': colors.text,
  '--color-text-secondary': colors.textSecondary,
  '--color-border': colors.border,
  '--color-success': colors.success,
  '--color-error': colors.error,
  '--color-warning': colors.warning,
  '--spacing-xs': spacing.xs,
  '--spacing-md': spacing.md,
  '--spacing-lg': spacing.lg,
  '--radius-md': radius.md,
};
