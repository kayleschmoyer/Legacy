/**
 * GameRoomGlyph (web) — the Game Room icon set drawn as raw `<svg>` (LS-8800).
 *
 * The `.native.tsx` sibling renders the identical artwork via
 * `react-native-svg`, mirroring `SportGlyph` — React Native has no view config
 * for lowercase host tags, so the two platforms cannot share one file.
 */
import React from 'react';
import type {
  GameRoomGlyphName,
  GameRoomGlyphProps,
} from './GameRoomGlyphs.types';

export type { GameRoomGlyphName, GameRoomGlyphProps };

function paths(name: GameRoomGlyphName): React.ReactNode {
  switch (name) {
    case 'clipboard':
      return (
        <>
          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
          <path d="M9 3h6v4a1 1 0 0 1-1 1H10a1 1 0 0 1-1-1V3Z" />
          <path d="M9 12h6M9 16h4" />
        </>
      );
    case 'barChart':
      return <path d="M18 20V10M12 20V4M6 20v-6" />;
    case 'helpCircle':
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M9.2 9.3a3 3 0 0 1 5.8 1c0 2-3 2.6-3 4" />
          <path d="M12 17.5h.01" />
        </>
      );
    case 'chevronRight':
      return <path d="m9 18 6-6-6-6" />;
    case 'play':
      return <path d="m9.5 7.5 7 4.5-7 4.5V7.5Z" />;
    case 'arrowRight':
      return <path d="M5 12h14M13 6l6 6-6 6" />;
  }
}

export function GameRoomGlyph({
  name,
  size = 22,
  color,
  strokeWidth = 1.8,
}: GameRoomGlyphProps): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={name === 'play' ? color : 'none'}
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths(name)}
    </svg>
  );
}

export default GameRoomGlyph;
