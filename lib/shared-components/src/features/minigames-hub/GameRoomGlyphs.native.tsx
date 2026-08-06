/**
 * GameRoomGlyph (native) — `react-native-svg` port of the web
 * `GameRoomGlyph`, so the Game Room icon set renders on Android/iOS
 * (LS-8800). See `GameRoomGlyphs.tsx` for the shared contract.
 */
import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';
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
          <Path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
          <Path d="M9 3h6v4a1 1 0 0 1-1 1H10a1 1 0 0 1-1-1V3Z" />
          <Path d="M9 12h6M9 16h4" />
        </>
      );
    case 'barChart':
      return <Path d="M18 20V10M12 20V4M6 20v-6" />;
    case 'helpCircle':
      return (
        <>
          <Circle cx={12} cy={12} r={9} />
          <Path d="M9.2 9.3a3 3 0 0 1 5.8 1c0 2-3 2.6-3 4" />
          <Path d="M12 17.5h.01" />
        </>
      );
    case 'chevronRight':
      return <Path d="m9 18 6-6-6-6" />;
    case 'play':
      return <Path d="m9.5 7.5 7 4.5-7 4.5V7.5Z" />;
    case 'arrowRight':
      return <Path d="M5 12h14M13 6l6 6-6 6" />;
  }
}

export function GameRoomGlyph({
  name,
  size = 22,
  color,
  strokeWidth = 1.8,
}: GameRoomGlyphProps): React.JSX.Element {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={name === 'play' ? color : 'none'}
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      // Decorative: every glyph sits inside a row or banner that already
      // carries its own accessibilityLabel, so the mark itself must stay out
      // of the accessibility tree. React Native has no `aria-hidden` for this
      // — the platform pair below is the repo's idiom (see AvatarImage.native).
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {paths(name)}
    </Svg>
  );
}

export default GameRoomGlyph;
