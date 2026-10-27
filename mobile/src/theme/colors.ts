/** Spotify-inspired palette with matching dark and light schemes. */
export type Colors = {
  background: string;
  elevated: string;
  card: string;
  cardPressed: string;
  border: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentText: string;
  danger: string;
  youtube: string;
  overlay: string;
  gradientTop: string;
};

export const dark: Colors = {
  background: '#121212',
  elevated: '#181818',
  card: '#242424',
  cardPressed: '#2f2f2f',
  border: '#2a2a2a',
  text: '#ffffff',
  textSecondary: '#b3b3b3',
  textMuted: '#7a7a7a',
  accent: '#1ed760',
  accentText: '#000000',
  danger: '#f15e6c',
  youtube: '#ff3b30',
  overlay: 'rgba(0,0,0,0.6)',
  gradientTop: '#3a3a3a',
};

export const light: Colors = {
  background: '#ffffff',
  elevated: '#f6f6f6',
  card: '#efefef',
  cardPressed: '#e2e2e2',
  border: '#e4e4e4',
  text: '#111111',
  textSecondary: '#535353',
  textMuted: '#8a8a8a',
  accent: '#1aa34a',
  accentText: '#ffffff',
  danger: '#d83a4a',
  youtube: '#e00000',
  overlay: 'rgba(0,0,0,0.4)',
  gradientTop: '#dcdcdc',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 4, md: 8, lg: 12, pill: 999 } as const;
export const font = {
  title: { fontSize: 28, fontWeight: '800' as const, letterSpacing: -0.5 },
  h2: { fontSize: 22, fontWeight: '700' as const },
  h3: { fontSize: 17, fontWeight: '700' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  small: { fontSize: 13, fontWeight: '400' as const },
  tiny: { fontSize: 11, fontWeight: '600' as const },
};
