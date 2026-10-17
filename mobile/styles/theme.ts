export const colors = {
  // Brand
  primary: '#3D4EE0',
  primaryPressed: '#2F3EC4',
  primarySurface: '#EEF0FD',
  primaryDark: '#0F1426',
  secondary: '#7A86F0',

  // Neutrals
  background: '#F5F6F8',
  backgroundSoft: '#FAFAFB',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  surfaceMuted: '#F0F1F4',
  border: '#E7E8EC',
  borderStrong: '#D7D9DF',
  text: '#0F1426',
  textMuted: '#5E6476',
  textSoft: '#9AA0AE',

  // Ink card (balance, highlights)
  ink: '#0F1426',
  inkMuted: 'rgba(255,255,255,0.62)',
  inkLine: 'rgba(255,255,255,0.10)',

  // Status
  accent: '#3D4EE0',
  accentPressed: '#2F3EC4',
  accentSurface: '#EEF0FD',
  success: '#12A16B',
  successSurface: '#E6F6EF',
  danger: '#E5484D',
  dangerSurface: '#FDEDED',
  warning: '#D9822B',
  warningSurface: '#FDF3E7',

  workTag: '#2563EB',
  personalTag: '#0F766E',
  reminderTag: '#EA580C',
  projectTag: '#059669',
  black: '#0F1426',
  white: '#FFFFFF'
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28
};

export const type = {
  display: { fontSize: 34, fontWeight: '700' as const, letterSpacing: -0.8 },
  title: { fontSize: 26, fontWeight: '700' as const, letterSpacing: -0.5 },
  heading: { fontSize: 17, fontWeight: '600' as const, letterSpacing: -0.2 },
  body: { fontSize: 15, fontWeight: '500' as const },
  label: { fontSize: 13, fontWeight: '500' as const },
  caption: { fontSize: 12, fontWeight: '500' as const },
  overline: { fontSize: 11, fontWeight: '600' as const, letterSpacing: 0.6, textTransform: 'uppercase' as const }
};

export const cardShadow = {
  shadowColor: '#0F1426',
  shadowOffset: {
    width: 0,
    height: 10
  },
  shadowOpacity: 0.08,
  shadowRadius: 24,
  elevation: 3
};

export const subtleShadow = {
  shadowColor: '#0F1426',
  shadowOffset: {
    width: 0,
    height: 2
  },
  shadowOpacity: 0.04,
  shadowRadius: 8,
  elevation: 1
};
