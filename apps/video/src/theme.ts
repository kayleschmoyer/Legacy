// ─── Brand Colors ───────────────────────────────────────────────────────────
export const BG_DARK = '#0A0F1A';
export const SURFACE_SUBTLE = '#0D1526';
export const SURFACE_PANEL = '#111B2F';
export const SURFACE_CARD = '#16223A';
export const PANEL_BORDER = '#1F2D48';
export const OUTLINE_SUBTLE = '#1C2740';

export const BRAND_NAVY = '#1B3A5C';
export const BRAND_NAVY_LIGHT = '#2C4A7C';
export const BRAND_GOLD = '#C5A55A';
export const BRAND_GOLD_LIGHT = '#D4BB78';
export const BRAND_SEAM_RED = '#C41E3A';
export const GREEN = '#22C55E';

export const TEXT_PRIMARY = '#F8FAFC';
export const TEXT_MUTED = '#9CAAC5';

// Position colors
export const POS_PITCHER = '#C41E3A';
export const POS_CATCHER = '#7C8794';
export const POS_INFIELD = '#8B6F47';
export const POS_OUTFIELD = '#2D6A4F';
export const POS_UTILITY = '#C5A55A';

// ─── Typography ─────────────────────────────────────────────────────────────
export const FONT_DISPLAY = "'Big Shoulders', sans-serif";
export const FONT_BODY = "'Literata', Georgia, serif";
export const FONT_MONO = "'Roboto Mono', monospace";

// ─── Video Config ────────────────────────────────────────────────────────────
export const VIDEO_FPS = 30;
export const VIDEO_WIDTH = 1920;
export const VIDEO_HEIGHT = 1080;
export const VIDEO_DURATION_FRAMES = 1800; // 60 seconds

// ─── Scene Timing ────────────────────────────────────────────────────────────
export const SCENES = {
  TITLE: { from: 0, duration: 120 }, // 0s–4s
  DIFFERENTIATOR: { from: 120, duration: 240 }, // 4s–12s
  CROSS_ERA: { from: 360, duration: 240 }, // 12s–20s
  CREATE_LEAGUE: { from: 600, duration: 330 }, // 20s–31s
  DRAFT: { from: 930, duration: 300 }, // 31s–41s
  MATCHUP: { from: 1230, duration: 300 }, // 41s–51s
  CTA: { from: 1530, duration: 270 }, // 51s–60s
} as const;

// ─── Easing Helpers ──────────────────────────────────────────────────────────
export function easeOutQuart(t: number): number {
  return 1 - Math.pow(1 - t, 4);
}

export function easeInOutQuart(t: number): number {
  return t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;
}
