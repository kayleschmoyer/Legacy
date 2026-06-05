import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import {
  BRAND_GOLD_LIGHT,
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED,
  WHITE,
  withAlpha,
} from '../../utils/colors';

export type BrandIconName =
  | 'baseball'
  | 'football'
  | 'stats'
  | 'draft'
  | 'live'
  | 'secure'
  | 'settings'
  | 'book'
  | 'google'
  | 'discord'
  | 'apple';

type GlyphProps = {
  color: string;
  accentColor: string;
  strokeWidth: number;
};

type BrandIconProps = {
  name: BrandIconName;
  size?: number;
  color?: string;
  accentColor?: string;
  strokeWidth?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
};

// ─── Glyphs ───────────────────────────────────────────────────────────────────

function BaseballGlyph({ color, accentColor, strokeWidth }: GlyphProps) {
  const thin = Math.max(strokeWidth - 0.2, 0.1);
  return (
    <>
      <Circle
        cx="16"
        cy="16"
        r="10.5"
        stroke={color}
        strokeWidth={strokeWidth}
      />
      <Path
        d="M11.5 7.8C8.6 10.4 6.9 13.9 6.9 16.9C6.9 20.2 8.6 23.4 11.4 25.8"
        stroke={accentColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <Path
        d="M20.6 6.2C23.5 8.8 25.1 12.1 25.1 15.1C25.1 18.5 23.4 21.7 20.5 24.2"
        stroke={accentColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <Path
        d="M10.4 11.0L13.0 13.0"
        stroke={accentColor}
        strokeWidth={thin}
        strokeLinecap="round"
      />
      <Path
        d="M9.2 14.4L11.9 16.1"
        stroke={accentColor}
        strokeWidth={thin}
        strokeLinecap="round"
      />
      <Path
        d="M20.1 15.9L22.8 17.6"
        stroke={accentColor}
        strokeWidth={thin}
        strokeLinecap="round"
      />
      <Path
        d="M19.1 19.0L21.6 20.9"
        stroke={accentColor}
        strokeWidth={thin}
        strokeLinecap="round"
      />
    </>
  );
}

function FootballGlyph({ color, accentColor, strokeWidth }: GlyphProps) {
  const thin = Math.max(strokeWidth - 0.2, 0.1);
  return (
    <>
      <Path
        d="M10.3 21.8C7.8 19.25 7.8 14.75 10.3 12.2L13.15 9.35C15.7 6.8 20.3 6.8 22.85 9.35C25.4 11.9 25.4 16.5 22.85 19.05L20 21.9C17.45 24.45 12.85 24.45 10.3 21.8Z"
        fill={withAlpha(BRAND_GOLD_LIGHT, 0.07)}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <Path
        d="M13.2 18.8L18.8 13.2"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <Path
        d="M14.6 17.4H17.4"
        stroke={accentColor}
        strokeWidth={thin}
        strokeLinecap="round"
      />
      <Path
        d="M13.4 16.2H16.2"
        stroke={accentColor}
        strokeWidth={thin}
        strokeLinecap="round"
      />
      <Path
        d="M15.8 14.6H18.6"
        stroke={accentColor}
        strokeWidth={thin}
        strokeLinecap="round"
      />
      <Path
        d="M11.4 10.5L13.2 12.3"
        stroke={accentColor}
        strokeWidth={thin}
        strokeLinecap="round"
      />
      <Path
        d="M18.8 19.7L20.6 21.5"
        stroke={accentColor}
        strokeWidth={thin}
        strokeLinecap="round"
      />
    </>
  );
}

function StatsGlyph({ color, accentColor, strokeWidth }: GlyphProps) {
  const thin = Math.max(strokeWidth - 0.2, 0.1);
  return (
    <>
      <Path
        d="M7.5 23.5H24.5"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <Rect
        x="9"
        y="16"
        width="3.5"
        height="6"
        rx="1.2"
        fill={color}
        opacity="0.85"
      />
      <Rect
        x="14.25"
        y="11"
        width="3.5"
        height="11"
        rx="1.2"
        fill={accentColor}
      />
      <Rect x="19.5" y="8.5" width="3.5" height="13.5" rx="1.2" fill={color} />
      <Path
        d="M9.5 13L14.5 9.5L18.5 12L22.5 7.5"
        stroke={accentColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M20.0 7.5H22.5V10.0"
        stroke={accentColor}
        strokeWidth={thin}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}

function DraftGlyph({ color, accentColor, strokeWidth }: GlyphProps) {
  const thin = Math.max(strokeWidth - 0.2, 0.1);
  return (
    <>
      <Path
        d="M16 6.8L22.7 10.2V17.6C22.7 21.4 19.8 24.2 16 25.3C12.2 24.2 9.3 21.4 9.3 17.6V10.2L16 6.8Z"
        fill={withAlpha(BRAND_NAVY_LIGHT, 0.18)}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <Path
        d="M16 10.8L17.65 14.15L21.4 14.6L18.7 17.2L19.5 20.9L16 19.0L12.5 20.9L13.3 17.2L10.6 14.6L14.35 14.15L16 10.8Z"
        fill={accentColor}
      />
      <Path
        d="M11.4 8.95L16 11.25L20.6 8.95"
        stroke={accentColor}
        strokeWidth={thin}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}

function LiveGlyph({ color, accentColor, strokeWidth }: GlyphProps) {
  const thin = Math.max(strokeWidth - 0.2, 0.1);
  return (
    <>
      <Path
        d="M20.2 11.8C22.1 13.7 23.2 16.3 23.2 19.0"
        stroke={accentColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <Path
        d="M11.8 11.8C9.9 13.7 8.8 16.3 8.8 19.0"
        stroke={accentColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        opacity="0.45"
      />
      <Path
        d="M18.3 13.7C19.6 15.0 20.4 16.8 20.4 18.8"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <Path
        d="M13.7 13.7C12.4 15.0 11.6 16.8 11.6 18.8"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        opacity="0.45"
      />
      <Path
        d="M16.1 15.8C17.1 15.9 17.9 16.8 17.9 17.9"
        stroke={accentColor}
        strokeWidth={thin}
        strokeLinecap="round"
      />
      <Path
        d="M16 8.0V10.5"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <Circle cx="16" cy="19.5" r="2.8" fill={accentColor} />
    </>
  );
}

function SecureGlyph({ color, accentColor, strokeWidth }: GlyphProps) {
  return (
    <>
      <Path
        d="M16 6.9L23 10.2V16.7C23 21.1 19.95 24.15 16 25.35C12.05 24.15 9 21.1 9 16.7V10.2L16 6.9Z"
        fill={withAlpha(BRAND_NAVY_LIGHT, 0.18)}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <Path
        d="M12.2 15.8L15.0 18.6L20.0 13.0"
        stroke={accentColor}
        strokeWidth={strokeWidth + 0.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}

function SettingsGlyph({ color, accentColor, strokeWidth }: GlyphProps) {
  const cx = 16;
  const cy = 16;
  const rOuter = 11.2;
  const rRoot = 8.4;
  const toothHalfWidth = 14;
  const numTeeth = 8;
  const pts: string[] = [];
  for (let i = 0; i < numTeeth; i++) {
    const peakDeg = i * 45;
    const valleyDeg = peakDeg + 22.5;
    const leadDeg = peakDeg - toothHalfWidth;
    const leadRad = (leadDeg * Math.PI) / 180;
    pts.push(
      `${(cx + rRoot * Math.cos(leadRad)).toFixed(3)} ${(cy + rRoot * Math.sin(leadRad)).toFixed(3)}`,
    );
    const pk1Rad = ((peakDeg - 8) * Math.PI) / 180;
    const pk2Rad = ((peakDeg + 8) * Math.PI) / 180;
    pts.push(
      `${(cx + rOuter * Math.cos(pk1Rad)).toFixed(3)} ${(cy + rOuter * Math.sin(pk1Rad)).toFixed(3)}`,
    );
    pts.push(
      `${(cx + rOuter * Math.cos(pk2Rad)).toFixed(3)} ${(cy + rOuter * Math.sin(pk2Rad)).toFixed(3)}`,
    );
    const trailDeg = peakDeg + toothHalfWidth;
    const trailRad = (trailDeg * Math.PI) / 180;
    pts.push(
      `${(cx + rRoot * Math.cos(trailRad)).toFixed(3)} ${(cy + rRoot * Math.sin(trailRad)).toFixed(3)}`,
    );
    const valleyRad = (valleyDeg * Math.PI) / 180;
    pts.push(
      `${(cx + rRoot * Math.cos(valleyRad)).toFixed(3)} ${(cy + rRoot * Math.sin(valleyRad)).toFixed(3)}`,
    );
  }
  const gearPath = `M ${pts[0]} L ${pts.slice(1).join(' L ')} Z`;

  return (
    <>
      <Path
        d={gearPath}
        fill={color}
        fillOpacity={0.14}
        stroke={color}
        strokeWidth={Math.max(strokeWidth - 0.2, 0.1)}
        strokeLinejoin="round"
      />
      <Circle
        cx={cx}
        cy={cy}
        r={3.4}
        fill={accentColor}
        fillOpacity={0.22}
        stroke={accentColor}
        strokeWidth={strokeWidth}
      />
    </>
  );
}

function BookGlyph({ color, accentColor, strokeWidth }: GlyphProps) {
  const thin = Math.max(strokeWidth - 0.2, 0.1);
  const textThin = Math.max(strokeWidth - 0.4, 0.1);
  return (
    <>
      <Path
        d="M16 22.5C16 22.5 12.5 21.2 9.0 21.5V8.5C12.5 8.2 16 9.5 16 9.5V22.5Z"
        fill={color}
        fillOpacity={0.12}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <Path
        d="M16 22.5C16 22.5 19.5 21.2 23.0 21.5V8.5C19.5 8.2 16 9.5 16 9.5V22.5Z"
        fill={accentColor}
        fillOpacity={0.08}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <Path
        d="M16 9.5V22.5"
        stroke={color}
        strokeWidth={thin}
        strokeLinecap="round"
      />
      <Path
        d="M10.5 12.5H14.2"
        stroke={accentColor}
        strokeWidth={textThin}
        strokeLinecap="round"
      />
      <Path
        d="M10.5 14.8H14.2"
        stroke={accentColor}
        strokeWidth={textThin}
        strokeLinecap="round"
      />
      <Path
        d="M10.5 17.1H13.0"
        stroke={accentColor}
        strokeWidth={textThin}
        strokeLinecap="round"
      />
      <Path
        d="M17.8 12.5H21.5"
        stroke={accentColor}
        strokeWidth={textThin}
        strokeLinecap="round"
      />
      <Path
        d="M17.8 14.8H21.5"
        stroke={accentColor}
        strokeWidth={textThin}
        strokeLinecap="round"
      />
      <Path
        d="M17.8 17.1H20.3"
        stroke={accentColor}
        strokeWidth={textThin}
        strokeLinecap="round"
      />
      <Path
        d="M9.0 21.5 Q16 24.0 23.0 21.5"
        stroke={color}
        strokeWidth={thin}
        strokeLinecap="round"
      />
    </>
  );
}

function DiscordGlyph() {
  // Official Discord brand mark — paths use 0–24 coordinate space; scaled to
  // the 32×32 viewBox via a wrapping G transform.
  return (
    <G transform="scale(1.3333333)">
      <Path
        d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057.1 18.08.114 18.1.13 18.11a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"
        fill="#5865F2"
      />
    </G>
  );
}

function AppleGlyph() {
  // Official Apple brand mark — path uses a 0–24 coordinate space scaled to the
  // 32×32 viewBox via a wrapping G transform. Rendered white so it reads on the
  // black "Sign in with Apple" button per Apple's Human Interface Guidelines.
  return (
    <G transform="scale(1.3333333)">
      <Path
        d="M17.05 12.04c-.03-2.6 2.12-3.85 2.22-3.91-1.21-1.77-3.09-2.01-3.76-2.04-1.6-.16-3.12.94-3.93.94-.81 0-2.06-.92-3.39-.9-1.74.03-3.35 1.01-4.25 2.57-1.81 3.14-.46 7.79 1.3 10.34.86 1.25 1.89 2.65 3.24 2.6 1.3-.05 1.79-.84 3.36-.84 1.57 0 2.01.84 3.39.81 1.4-.02 2.29-1.27 3.15-2.53.99-1.45 1.4-2.85 1.42-2.93-.03-.01-2.72-1.04-2.75-4.13zM14.62 4.84c.72-.87 1.2-2.08 1.07-3.29-1.03.04-2.28.69-3.02 1.56-.66.77-1.24 2-1.08 3.18 1.15.09 2.32-.58 3.03-1.45z"
        fill="#FFFFFF"
      />
    </G>
  );
}

function GoogleGlyph({ strokeWidth }: Pick<GlyphProps, 'strokeWidth'>) {
  return (
    <>
      <Path
        d="M23.7 16.35C23.7 15.55 23.63 14.95 23.47 14.3H16V17.25H20.39C20.3 18 19.81 19.13 18.73 19.9L18.71 20.09L21.08 21.88L21.24 21.89C22.74 20.54 23.7 18.55 23.7 16.35Z"
        fill="#4285F4"
      />
      <Path
        d="M16 24C18.15 24 19.95 23.31 21.24 21.89L18.73 19.9C18.06 20.36 17.15 20.68 16 20.68C13.89 20.68 12.11 19.33 11.47 17.46L11.28 17.48L8.82 19.34L8.75 19.52C10.03 22 12.79 24 16 24Z"
        fill="#34A853"
      />
      <Path
        d="M11.47 17.46C11.3 16.81 11.2 16.13 11.2 15.43C11.2 14.73 11.3 14.05 11.46 13.4L11.45 13.2L8.92 11.31L8.75 11.38C8.22 12.4 7.91 13.55 7.91 14.77C7.91 15.99 8.22 17.14 8.75 18.16L11.47 17.46Z"
        fill="#FBBC05"
      />
      <Path
        d="M16 10.18C17.45 10.18 18.42 10.79 18.97 11.3L21.3 9.09C19.95 7.87 18.15 7.11 16 7.11C12.79 7.11 10.03 9.11 8.75 11.58L11.46 13.4C12.11 11.53 13.89 10.18 16 10.18Z"
        fill="#EA4335"
      />
      <Circle
        cx="16"
        cy="16"
        r="9.7"
        stroke={withAlpha(WHITE, 0.16)}
        strokeWidth={Math.max(strokeWidth - 0.5, 0.1)}
      />
    </>
  );
}

// ─── Render dispatcher ────────────────────────────────────────────────────────

function renderGlyph(
  name: BrandIconName,
  color: string,
  accentColor: string,
  strokeWidth: number,
) {
  switch (name) {
    case 'baseball':
      return (
        <BaseballGlyph
          color={color}
          accentColor={accentColor}
          strokeWidth={strokeWidth}
        />
      );
    case 'football':
      return (
        <FootballGlyph
          color={color}
          accentColor={accentColor}
          strokeWidth={strokeWidth}
        />
      );
    case 'stats':
      return (
        <StatsGlyph
          color={color}
          accentColor={accentColor}
          strokeWidth={strokeWidth}
        />
      );
    case 'draft':
      return (
        <DraftGlyph
          color={color}
          accentColor={accentColor}
          strokeWidth={strokeWidth}
        />
      );
    case 'live':
      return (
        <LiveGlyph
          color={color}
          accentColor={accentColor}
          strokeWidth={strokeWidth}
        />
      );
    case 'secure':
      return (
        <SecureGlyph
          color={color}
          accentColor={accentColor}
          strokeWidth={strokeWidth}
        />
      );
    case 'settings':
      return (
        <SettingsGlyph
          color={color}
          accentColor={accentColor}
          strokeWidth={strokeWidth}
        />
      );
    case 'book':
      return (
        <BookGlyph
          color={color}
          accentColor={accentColor}
          strokeWidth={strokeWidth}
        />
      );
    case 'google':
      return <GoogleGlyph strokeWidth={strokeWidth} />;
    case 'discord':
      return <DiscordGlyph />;
    case 'apple':
      return <AppleGlyph />;
    default:
      return null;
  }
}

// ─── Public component ─────────────────────────────────────────────────────────

export function BrandIcon({
  name,
  size = 24,
  color = BRAND_GOLD_LIGHT,
  accentColor = BRAND_SEAM_RED,
  strokeWidth = size <= 16 ? 2.2 : 2.0,
  style,
  testID,
  accessibilityLabel,
}: BrandIconProps): React.JSX.Element {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      style={style}
    >
      {renderGlyph(name, color, accentColor, strokeWidth)}
    </Svg>
  );
}
