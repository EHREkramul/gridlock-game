import { PLAYER_COLORS } from '@gridlock/engine';

export const colors = {
  bg: '#0B0D1A',
  bgGlowA: '#1B1F4A',
  bgGlowB: '#0B0D1A',
  surface: '#141833',
  surfaceHi: '#1C2146',
  border: 'rgba(255,255,255,0.08)',
  borderHi: 'rgba(255,255,255,0.16)',
  text: '#F2F4FF',
  textMuted: '#8A91B8',
  textDim: '#5B6189',
  primary: '#3DDCFF',
  primaryAlt: '#7CFFB2',
  onPrimary: '#06121A',
  danger: '#FF5C7A',
  gold: '#FFC53D',
  boardBg: '#0E1230',
  tile: '#1A1F45',
  tileAlt: '#1E2350',
  groove: '#0E1230',
} as const;

export const playerColor = (seat: number) => PLAYER_COLORS[seat % PLAYER_COLORS.length];

/** Hex colour with alpha, e.g. alpha('#3DDCFF', 0.2). */
export function alpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export const fonts = {
  regular: 'SpaceGrotesk_400Regular',
  medium: 'SpaceGrotesk_500Medium',
  semibold: 'SpaceGrotesk_600SemiBold',
  bold: 'SpaceGrotesk_700Bold',
} as const;

export const radius = { sm: 10, md: 16, lg: 22, xl: 28, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
