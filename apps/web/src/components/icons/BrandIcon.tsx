import React from 'react';
import {
  BG_DARK,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED,
  WHITE,
  withAlpha,
} from '../../constants/colors';

export type BrandIconName =
  | 'baseball'
  | 'football'
  | 'stats'
  | 'draft'
  | 'live'
  | 'secure'
  | 'settings'
  | 'book'
  | 'google';

type BrandIconProps = {
  name: BrandIconName;
  size?: number;
  color?: string;
  accentColor?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
} & (
  | { decorative?: true; title?: string }
  | { decorative: false; title: string }
);

type BrandIconBadgeProps = {
  name: BrandIconName;
  size?: number;
  iconSize?: number;
  color?: string;
  accentColor?: string;
  background?: string;
  borderColor?: string;
  rounded?: 'circle' | 'square';
  style?: React.CSSProperties;
} & (
  | { decorative?: true; title?: string }
  | { decorative: false; title: string }
);

// ─── Glyphs ───────────────────────────────────────────────────────────────────

function BaseballGlyph({
  color,
  accentColor,
  strokeWidth,
}: Pick<Required<BrandIconProps>, 'color' | 'accentColor' | 'strokeWidth'>) {
  return (
    <>
      {/* Ball outline */}
      <circle
        cx="16"
        cy="16"
        r="10.5"
        stroke={color}
        strokeWidth={strokeWidth}
      />
      {/* Left seam curve — wider arc for clarity at small sizes */}
      <path
        d="M11.5 7.8C8.6 10.4 6.9 13.9 6.9 16.9C6.9 20.2 8.6 23.4 11.4 25.8"
        stroke={accentColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      {/* Right seam curve */}
      <path
        d="M20.6 6.2C23.5 8.8 25.1 12.1 25.1 15.1C25.1 18.5 23.4 21.7 20.5 24.2"
        stroke={accentColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      {/* Left tick marks — longer for legibility at 16px */}
      <path
        d="M10.4 11.0L13.0 13.0"
        stroke={accentColor}
        strokeWidth={Math.max(strokeWidth - 0.2, 0.1)}
        strokeLinecap="round"
      />
      <path
        d="M9.2 14.4L11.9 16.1"
        stroke={accentColor}
        strokeWidth={Math.max(strokeWidth - 0.2, 0.1)}
        strokeLinecap="round"
      />
      {/* Right tick marks */}
      <path
        d="M20.1 15.9L22.8 17.6"
        stroke={accentColor}
        strokeWidth={Math.max(strokeWidth - 0.2, 0.1)}
        strokeLinecap="round"
      />
      <path
        d="M19.1 19.0L21.6 20.9"
        stroke={accentColor}
        strokeWidth={Math.max(strokeWidth - 0.2, 0.1)}
        strokeLinecap="round"
      />
    </>
  );
}

function FootballGlyph({
  color,
  accentColor,
  strokeWidth,
}: Pick<Required<BrandIconProps>, 'color' | 'accentColor' | 'strokeWidth'>) {
  return (
    <>
      {/* Ball body — subtle fill so it doesn't look hollow */}
      <path
        d="M10.3 21.8C7.8 19.25 7.8 14.75 10.3 12.2L13.15 9.35C15.7 6.8 20.3 6.8 22.85 9.35C25.4 11.9 25.4 16.5 22.85 19.05L20 21.9C17.45 24.45 12.85 24.45 10.3 21.8Z"
        fill={withAlpha(BRAND_GOLD_LIGHT, 0.07)}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      {/* Centre lace seam */}
      <path
        d="M13.2 18.8L18.8 13.2"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      {/* Horizontal lace stitches — bolder */}
      <path
        d="M14.6 17.4H17.4"
        stroke={accentColor}
        strokeWidth={Math.max(strokeWidth - 0.2, 0.1)}
        strokeLinecap="round"
      />
      <path
        d="M13.4 16.2H16.2"
        stroke={accentColor}
        strokeWidth={Math.max(strokeWidth - 0.2, 0.1)}
        strokeLinecap="round"
      />
      <path
        d="M15.8 14.6H18.6"
        stroke={accentColor}
        strokeWidth={Math.max(strokeWidth - 0.2, 0.1)}
        strokeLinecap="round"
      />
      {/* End tip accent marks */}
      <path
        d="M11.4 10.5L13.2 12.3"
        stroke={accentColor}
        strokeWidth={Math.max(strokeWidth - 0.2, 0.1)}
        strokeLinecap="round"
      />
      <path
        d="M18.8 19.7L20.6 21.5"
        stroke={accentColor}
        strokeWidth={Math.max(strokeWidth - 0.2, 0.1)}
        strokeLinecap="round"
      />
    </>
  );
}

function StatsGlyph({
  color,
  accentColor,
  strokeWidth,
}: Pick<Required<BrandIconProps>, 'color' | 'accentColor' | 'strokeWidth'>) {
  return (
    <>
      {/* Baseline */}
      <path
        d="M7.5 23.5H24.5"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      {/* Left bar */}
      <rect
        x="9"
        y="16"
        width="3.5"
        height="6"
        rx="1.2"
        fill={color}
        opacity="0.85"
      />
      {/* Centre bar — accent colour, tallest */}
      <rect
        x="14.25"
        y="11"
        width="3.5"
        height="11"
        rx="1.2"
        fill={accentColor}
      />
      {/* Right bar — gold */}
      <rect x="19.5" y="8.5" width="3.5" height="13.5" rx="1.2" fill={color} />
      {/* Trend line */}
      <path
        d="M9.5 13L14.5 9.5L18.5 12L22.5 7.5"
        stroke={accentColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Arrow head */}
      <path
        d="M20.0 7.5H22.5V10.0"
        stroke={accentColor}
        strokeWidth={Math.max(strokeWidth - 0.2, 0.1)}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}

function DraftGlyph({
  color,
  accentColor,
  strokeWidth,
}: Pick<Required<BrandIconProps>, 'color' | 'accentColor' | 'strokeWidth'>) {
  return (
    <>
      {/* Shield with navy fill */}
      <path
        d="M16 6.8L22.7 10.2V17.6C22.7 21.4 19.8 24.2 16 25.3C12.2 24.2 9.3 21.4 9.3 17.6V10.2L16 6.8Z"
        fill={withAlpha(BRAND_NAVY_LIGHT, 0.18)}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      {/* Star — centred at (16, 16.5) */}
      <path
        d="M16 10.8L17.65 14.15L21.4 14.6L18.7 17.2L19.5 20.9L16 19.0L12.5 20.9L13.3 17.2L10.6 14.6L14.35 14.15L16 10.8Z"
        fill={accentColor}
      />
      {/* Shoulder accent lines */}
      <path
        d="M11.4 8.95L16 11.25L20.6 8.95"
        stroke={accentColor}
        strokeWidth={Math.max(strokeWidth - 0.2, 0.1)}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}

function LiveGlyph({
  color,
  accentColor,
  strokeWidth,
}: Pick<Required<BrandIconProps>, 'color' | 'accentColor' | 'strokeWidth'>) {
  // Broadcast / radar style — arcs emanating from a base point
  return (
    <>
      {/* Outer arc — right strong */}
      <path
        d="M20.2 11.8C22.1 13.7 23.2 16.3 23.2 19.0"
        stroke={accentColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      {/* Outer arc — left dimmed */}
      <path
        d="M11.8 11.8C9.9 13.7 8.8 16.3 8.8 19.0"
        stroke={accentColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        opacity="0.45"
      />
      {/* Mid arc — right */}
      <path
        d="M18.3 13.7C19.6 15.0 20.4 16.8 20.4 18.8"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      {/* Mid arc — left dimmed */}
      <path
        d="M13.7 13.7C12.4 15.0 11.6 16.8 11.6 18.8"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        opacity="0.45"
      />
      {/* Inner arc — right small */}
      <path
        d="M16.1 15.8C17.1 15.9 17.9 16.8 17.9 17.9"
        stroke={accentColor}
        strokeWidth={Math.max(strokeWidth - 0.2, 0.1)}
        strokeLinecap="round"
      />
      {/* Signal stem */}
      <path
        d="M16 8.0V10.5"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      {/* Broadcast dot anchor — larger for visual weight */}
      <circle cx="16" cy="19.5" r="2.8" fill={accentColor} />
    </>
  );
}

function SecureGlyph({
  color,
  accentColor,
  strokeWidth,
}: Pick<Required<BrandIconProps>, 'color' | 'accentColor' | 'strokeWidth'>) {
  return (
    <>
      {/* Shield with subtle navy fill */}
      <path
        d="M16 6.9L23 10.2V16.7C23 21.1 19.95 24.15 16 25.35C12.05 24.15 9 21.1 9 16.7V10.2L16 6.9Z"
        fill={withAlpha(BRAND_NAVY_LIGHT, 0.18)}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      {/* Checkmark — bolder stroke, slightly larger */}
      <path
        d="M12.2 15.8L15.0 18.6L20.0 13.0"
        stroke={accentColor}
        strokeWidth={strokeWidth + 0.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}

function SettingsGlyph({
  color,
  accentColor,
  strokeWidth,
}: Pick<Required<BrandIconProps>, 'color' | 'accentColor' | 'strokeWidth'>) {
  // 8-tooth gear drawn directly on 32×32 viewBox.
  // Alternates between outer-radius points (r≈11.2) and root-radius points (r≈8.4)
  // at 22.5° increments, producing 8 evenly-spaced teeth.
  // Points generated at angles 0°, 22.5°, 45°, 67.5° … (×8 teeth)
  // outer at 0°, 45°, 90°, 135°, 180°, 225°, 270°, 315° (tooth peaks)
  // root  at 22.5°, 67.5°, 112.5° … (tooth valleys)
  const cx = 16;
  const cy = 16;
  const rOuter = 11.2;
  const rRoot = 8.4;
  const toothHalfWidth = 14; // degrees
  const numTeeth = 8;
  const pts: string[] = [];
  for (let i = 0; i < numTeeth; i++) {
    const peakDeg = i * 45;
    const valleyDeg = peakDeg + 22.5;
    // Tooth leading edge (before peak)
    const leadDeg = peakDeg - toothHalfWidth;
    const leadRad = (leadDeg * Math.PI) / 180;
    pts.push(
      `${(cx + rRoot * Math.cos(leadRad)).toFixed(3)} ${(cy + rRoot * Math.sin(leadRad)).toFixed(3)}`,
    );
    // Tooth peak (two points to make flat top)
    const pk1Rad = ((peakDeg - 8) * Math.PI) / 180;
    const pk2Rad = ((peakDeg + 8) * Math.PI) / 180;
    pts.push(
      `${(cx + rOuter * Math.cos(pk1Rad)).toFixed(3)} ${(cy + rOuter * Math.sin(pk1Rad)).toFixed(3)}`,
    );
    pts.push(
      `${(cx + rOuter * Math.cos(pk2Rad)).toFixed(3)} ${(cy + rOuter * Math.sin(pk2Rad)).toFixed(3)}`,
    );
    // Tooth trailing edge (after peak)
    const trailDeg = peakDeg + toothHalfWidth;
    const trailRad = (trailDeg * Math.PI) / 180;
    pts.push(
      `${(cx + rRoot * Math.cos(trailRad)).toFixed(3)} ${(cy + rRoot * Math.sin(trailRad)).toFixed(3)}`,
    );
    // Valley
    const valleyRad = (valleyDeg * Math.PI) / 180;
    pts.push(
      `${(cx + rRoot * Math.cos(valleyRad)).toFixed(3)} ${(cy + rRoot * Math.sin(valleyRad)).toFixed(3)}`,
    );
  }
  const gearPath = `M ${pts[0]} L ${pts.slice(1).join(' L ')} Z`;

  return (
    <>
      {/* Gear body */}
      <path
        d={gearPath}
        fill={withAlpha(color, 0.14)}
        stroke={color}
        strokeWidth={Math.max(strokeWidth - 0.2, 0.1)}
        strokeLinejoin="round"
      />
      {/* Centre bore */}
      <circle
        cx={cx}
        cy={cy}
        r={3.4}
        fill={withAlpha(accentColor, 0.22)}
        stroke={accentColor}
        strokeWidth={strokeWidth}
      />
    </>
  );
}

function BookGlyph({
  color,
  accentColor,
  strokeWidth,
}: Pick<Required<BrandIconProps>, 'color' | 'accentColor' | 'strokeWidth'>) {
  return (
    <>
      {/* Left page */}
      <path
        d="M16 22.5C16 22.5 12.5 21.2 9.0 21.5V8.5C12.5 8.2 16 9.5 16 9.5V22.5Z"
        fill={withAlpha(color, 0.12)}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      {/* Right page */}
      <path
        d="M16 22.5C16 22.5 19.5 21.2 23.0 21.5V8.5C19.5 8.2 16 9.5 16 9.5V22.5Z"
        fill={withAlpha(accentColor, 0.08)}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      {/* Spine crease */}
      <path
        d="M16 9.5V22.5"
        stroke={color}
        strokeWidth={Math.max(strokeWidth - 0.2, 0.1)}
        strokeLinecap="round"
      />
      {/* Left page text lines */}
      <path
        d="M10.5 12.5H14.2"
        stroke={accentColor}
        strokeWidth={Math.max(strokeWidth - 0.4, 0.1)}
        strokeLinecap="round"
      />
      <path
        d="M10.5 14.8H14.2"
        stroke={accentColor}
        strokeWidth={Math.max(strokeWidth - 0.4, 0.1)}
        strokeLinecap="round"
      />
      <path
        d="M10.5 17.1H13.0"
        stroke={accentColor}
        strokeWidth={Math.max(strokeWidth - 0.4, 0.1)}
        strokeLinecap="round"
      />
      {/* Right page text lines */}
      <path
        d="M17.8 12.5H21.5"
        stroke={accentColor}
        strokeWidth={Math.max(strokeWidth - 0.4, 0.1)}
        strokeLinecap="round"
      />
      <path
        d="M17.8 14.8H21.5"
        stroke={accentColor}
        strokeWidth={Math.max(strokeWidth - 0.4, 0.1)}
        strokeLinecap="round"
      />
      <path
        d="M17.8 17.1H20.3"
        stroke={accentColor}
        strokeWidth={Math.max(strokeWidth - 0.4, 0.1)}
        strokeLinecap="round"
      />
      {/* Open book base curve */}
      <path
        d="M9.0 21.5 Q16 24.0 23.0 21.5"
        stroke={color}
        strokeWidth={Math.max(strokeWidth - 0.2, 0.1)}
        strokeLinecap="round"
      />
    </>
  );
}

function GoogleGlyph({
  strokeWidth,
}: Pick<Required<BrandIconProps>, 'strokeWidth'>) {
  return (
    <>
      <path
        d="M23.7 16.35C23.7 15.55 23.63 14.95 23.47 14.3H16V17.25H20.39C20.3 18 19.81 19.13 18.73 19.9L18.71 20.09L21.08 21.88L21.24 21.89C22.74 20.54 23.7 18.55 23.7 16.35Z"
        fill="#4285F4"
      />
      <path
        d="M16 24C18.15 24 19.95 23.31 21.24 21.89L18.73 19.9C18.06 20.36 17.15 20.68 16 20.68C13.89 20.68 12.11 19.33 11.47 17.46L11.28 17.48L8.82 19.34L8.75 19.52C10.03 22 12.79 24 16 24Z"
        fill="#34A853"
      />
      <path
        d="M11.47 17.46C11.3 16.81 11.2 16.13 11.2 15.43C11.2 14.73 11.3 14.05 11.46 13.4L11.45 13.2L8.92 11.31L8.75 11.38C8.22 12.4 7.91 13.55 7.91 14.77C7.91 15.99 8.22 17.14 8.75 18.16L11.47 17.46Z"
        fill="#FBBC05"
      />
      <path
        d="M16 10.18C17.45 10.18 18.42 10.79 18.97 11.3L21.3 9.09C19.95 7.87 18.15 7.11 16 7.11C12.79 7.11 10.03 9.11 8.75 11.58L11.46 13.4C12.11 11.53 13.89 10.18 16 10.18Z"
        fill="#EA4335"
      />
      <circle
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
    default:
      return null;
  }
}

// ─── Public components ────────────────────────────────────────────────────────

export function BrandIcon({
  name,
  size = 24,
  color = BRAND_GOLD_LIGHT,
  accentColor = BRAND_SEAM_RED,
  // Bump to 2.2 at ≤16px so strokes stay legible at small render sizes
  strokeWidth = size <= 16 ? 2.2 : 2.0,
  title,
  decorative = true,
  style,
}: BrandIconProps): React.JSX.Element {
  const labelled = !decorative && Boolean(title);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role={labelled ? 'img' : 'presentation'}
      aria-hidden={labelled ? undefined : true}
      aria-label={labelled ? title : undefined}
      style={{ display: 'block', flexShrink: 0, ...style }}
    >
      {labelled ? <title>{title}</title> : null}
      {renderGlyph(name, color, accentColor, strokeWidth)}
    </svg>
  );
}

export function BrandIconBadge({
  name,
  size = 44,
  iconSize = 24,
  color = BRAND_GOLD_LIGHT,
  accentColor = BRAND_SEAM_RED,
  title,
  decorative = true,
  // Slightly richer navy gradient
  background = `linear-gradient(135deg, ${withAlpha(BRAND_NAVY_LIGHT, 0.28)} 0%, ${withAlpha(BG_DARK, 0.92)} 100%)`,
  // Increased border alpha 0.16 → 0.30 for a visible gold frame
  borderColor = withAlpha(BRAND_GOLD_LIGHT, 0.3),
  rounded = 'circle',
  style,
}: BrandIconBadgeProps): React.JSX.Element {
  return (
    <span
      style={{
        width: size,
        height: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: rounded === 'circle' ? 9999 : 14,
        background,
        border: `1px solid ${borderColor}`,
        // Top-edge highlight + subtle outer gold glow
        boxShadow: [
          `inset 0 1px 0 ${withAlpha(WHITE, 0.1)}`,
          `0 0 10px ${withAlpha(BRAND_GOLD_LIGHT, 0.18)}`,
        ].join(', '),
        flexShrink: 0,
        ...style,
      }}
    >
      <BrandIcon
        name={name}
        size={iconSize}
        color={color}
        accentColor={accentColor}
        {...(decorative === false
          ? { decorative: false as const, title: title! }
          : { decorative: true as const, title })}
      />
    </span>
  );
}

export const BRAND_ICON_ACCENT = BRAND_NAVY_LIGHT;
