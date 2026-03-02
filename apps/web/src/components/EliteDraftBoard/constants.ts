// ---------------------------------------------------------------------------
// Shared constants for EliteDraftBoard
// ---------------------------------------------------------------------------

export const POSITION_COLORS: Record<string, string> = {
  C: '#ef4444',
  '1B': '#f97316',
  '2B': '#eab308',
  '3B': '#22c55e',
  SS: '#3b82f6',
  OF: '#8b5cf6',
  P: '#06b6d4',
  SP: '#06b6d4',
  RP: '#14b8a6',
  DH: '#ec4899',
};

export const TIMER_RADIUS = 50;
export const TIMER_CIRCUMFERENCE = 2 * Math.PI * TIMER_RADIUS;
export const DEFAULT_PICK_TIME = 120; // matches server default

export const CONFETTI_COLORS = [
  '#C5A55A',
  '#22C55E',
  '#3B82F6',
  '#F59E0B',
  '#8b5cf6',
  '#C41E3A',
  '#1B3A5C',
  '#D4BB78',
];
