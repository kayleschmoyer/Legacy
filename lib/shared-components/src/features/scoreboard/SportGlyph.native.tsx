/**
 * SportGlyph (native) — react-native-svg port of the web `SportGlyph`, keeping
 * the Scoreboard sport filter visually identical on mobile.
 */
import React from 'react';
import Svg, { Circle, Line, Path } from 'react-native-svg';

export interface SportGlyphProps {
  sport: 'mlb' | 'nfl';
  size?: number;
  color?: string;
}

export function SportGlyph({
  sport,
  size = 14,
  color = '#FFFFFF',
}: SportGlyphProps): React.JSX.Element {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {sport === 'mlb' ? (
        <>
          <Circle cx="10" cy="10" r="8.5" />
          <Path d="M 7 2.5 C 4.5 5 4.5 8.5 7 10 C 9.5 11.5 9.5 15 7 17.5" />
          <Path d="M 13 2.5 C 15.5 5 15.5 8.5 13 10 C 10.5 11.5 10.5 15 13 17.5" />
        </>
      ) : (
        <>
          <Path d="M 10 2 C 13 4 17 6.5 17 10 C 17 13.5 13 16 10 18 C 7 16 3 13.5 3 10 C 3 6.5 7 4 10 2 Z" />
          <Line x1="10" y1="6" x2="10" y2="14" />
          <Line x1="8.5" y1="8" x2="11.5" y2="8" />
          <Line x1="8.5" y1="10" x2="11.5" y2="10" />
          <Line x1="8.5" y1="12" x2="11.5" y2="12" />
        </>
      )}
    </Svg>
  );
}
