/**
 * SportGlyph (web) — thin, single-stroke baseball / football marks for the
 * Scoreboard sport filter. Lucide ships neither glyph, so these are
 * purpose-built SVGs matching the Lucide style (stroke, no fill).
 *
 * A `.native.tsx` sibling renders the identical artwork via `react-native-svg`
 * so the filter looks the same on mobile.
 */
import React from 'react';

export interface SportGlyphProps {
  sport: 'mlb' | 'nfl';
  size?: number;
  color?: string;
}

export function SportGlyph({
  sport,
  size = 14,
  color = 'currentColor',
}: SportGlyphProps): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {sport === 'mlb' ? (
        <>
          {/* Ball outline */}
          <circle cx="10" cy="10" r="8.5" />
          {/* Left seam arc */}
          <path d="M 7 2.5 C 4.5 5 4.5 8.5 7 10 C 9.5 11.5 9.5 15 7 17.5" />
          {/* Right seam arc */}
          <path d="M 13 2.5 C 15.5 5 15.5 8.5 13 10 C 10.5 11.5 10.5 15 13 17.5" />
        </>
      ) : (
        <>
          {/* Ball body: pointed oval */}
          <path d="M 10 2 C 13 4 17 6.5 17 10 C 17 13.5 13 16 10 18 C 7 16 3 13.5 3 10 C 3 6.5 7 4 10 2 Z" />
          {/* Lace — vertical spine */}
          <line x1="10" y1="6" x2="10" y2="14" />
          {/* Lace — three cross stitches */}
          <line x1="8.5" y1="8" x2="11.5" y2="8" />
          <line x1="8.5" y1="10" x2="11.5" y2="10" />
          <line x1="8.5" y1="12" x2="11.5" y2="12" />
        </>
      )}
    </svg>
  );
}
