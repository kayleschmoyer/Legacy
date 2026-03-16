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

function BaseballGlyph({
  color,
  accentColor,
  strokeWidth,
}: Pick<Required<BrandIconProps>, 'color' | 'accentColor' | 'strokeWidth'>) {
  return (
    <>
      <circle
        cx="16"
        cy="16"
        r="10.5"
        stroke={color}
        strokeWidth={strokeWidth}
      />
      <path
        d="M11.25 8.6C8.9 10.85 7.5 13.7 7.5 16.9C7.5 20.05 8.88 22.95 11.15 25.2"
        stroke={accentColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <path
        d="M20.85 6.8C23.12 9.05 24.5 11.95 24.5 15.1C24.5 18.3 23.1 21.15 20.75 23.4"
        stroke={accentColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <path
        d="M10.8 11.5L12.8 13.2"
        stroke={accentColor}
        strokeWidth={strokeWidth - 0.3}
        strokeLinecap="round"
      />
      <path
        d="M9.8 14.5L11.9 16.1"
        stroke={accentColor}
        strokeWidth={strokeWidth - 0.3}
        strokeLinecap="round"
      />
      <path
        d="M20.1 15.9L22.2 17.5"
        stroke={accentColor}
        strokeWidth={strokeWidth - 0.3}
        strokeLinecap="round"
      />
      <path
        d="M19.2 18.8L21.2 20.5"
        stroke={accentColor}
        strokeWidth={strokeWidth - 0.3}
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
      <path
        d="M10.3 21.8C7.8 19.25 7.8 14.75 10.3 12.2L13.15 9.35C15.7 6.8 20.3 6.8 22.85 9.35C25.4 11.9 25.4 16.5 22.85 19.05L20 21.9C17.45 24.45 12.85 24.45 10.3 21.8Z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <path
        d="M13.2 18.8L18.8 13.2"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <path
        d="M14.9 17.1H17.1"
        stroke={accentColor}
        strokeWidth={strokeWidth - 0.3}
        strokeLinecap="round"
      />
      <path
        d="M13.7 15.9H16"
        stroke={accentColor}
        strokeWidth={strokeWidth - 0.3}
        strokeLinecap="round"
      />
      <path
        d="M16 14.7H18.3"
        stroke={accentColor}
        strokeWidth={strokeWidth - 0.3}
        strokeLinecap="round"
      />
      <path
        d="M11.8 10.9L13.4 12.5"
        stroke={accentColor}
        strokeWidth={strokeWidth - 0.2}
        strokeLinecap="round"
      />
      <path
        d="M18.6 19.5L20.2 21.1"
        stroke={accentColor}
        strokeWidth={strokeWidth - 0.2}
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
      <path
        d="M8 23.5H24"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <rect
        x="9.5"
        y="15.5"
        width="3.2"
        height="6"
        rx="1.2"
        fill={color}
        opacity="0.9"
      />
      <rect
        x="14.4"
        y="11.7"
        width="3.2"
        height="9.8"
        rx="1.2"
        fill={accentColor}
      />
      <rect x="19.3" y="9" width="3.2" height="12.5" rx="1.2" fill={color} />
      <path
        d="M9.7 12.6L14.5 9.7L18.1 12L22.1 7.9"
        stroke={accentColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19.8 7.9H22.1V10.2"
        stroke={accentColor}
        strokeWidth={strokeWidth - 0.2}
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
      <path
        d="M16 6.8L22.7 10.2V17.6C22.7 21.4 19.8 24.2 16 25.3C12.2 24.2 9.3 21.4 9.3 17.6V10.2L16 6.8Z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <path
        d="M16 10.4L17.55 13.55L21 13.95L18.45 16.3L19.2 19.7L16 17.95L12.8 19.7L13.55 16.3L11 13.95L14.45 13.55L16 10.4Z"
        fill={accentColor}
      />
      <path
        d="M11.4 8.95L16 11.25L20.6 8.95"
        stroke={accentColor}
        strokeWidth={strokeWidth - 0.2}
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
  return (
    <>
      <path
        d="M16 11.2V20.8"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <path
        d="M11.8 16H20.2"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <path
        d="M16 8.5C20.14 8.5 23.5 11.86 23.5 16"
        stroke={accentColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <path
        d="M16 23.5C20.14 23.5 23.5 20.14 23.5 16"
        stroke={accentColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        opacity="0.65"
      />
      <path
        d="M16 8.5C11.86 8.5 8.5 11.86 8.5 16"
        stroke={accentColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        opacity="0.65"
      />
      <path
        d="M16 23.5C11.86 23.5 8.5 20.14 8.5 16"
        stroke={accentColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <circle cx="16" cy="16" r="2.3" fill={accentColor} />
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
      <path
        d="M16 6.9L23 10.2V16.7C23 21.1 19.95 24.15 16 25.35C12.05 24.15 9 21.1 9 16.7V10.2L16 6.9Z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <path
        d="M12.7 15.5L15.05 17.85L19.5 13.4"
        stroke={accentColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16 10.4V13"
        stroke={accentColor}
        strokeWidth={strokeWidth - 0.2}
        strokeLinecap="round"
        opacity="0.7"
      />
    </>
  );
}

function SettingsGlyph({
  color,
  accentColor,
  strokeWidth,
}: Pick<Required<BrandIconProps>, 'color' | 'accentColor' | 'strokeWidth'>) {
  return (
    <>
      <circle
        cx="16"
        cy="16"
        r="3.2"
        stroke={color}
        strokeWidth={strokeWidth}
      />
      <path
        d="M16 8.2V10.1"
        stroke={accentColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <path
        d="M16 21.9V23.8"
        stroke={accentColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <path
        d="M23.8 16H21.9"
        stroke={accentColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <path
        d="M10.1 16H8.2"
        stroke={accentColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <path
        d="M21.4 10.6L20.05 11.95"
        stroke={accentColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <path
        d="M11.95 20.05L10.6 21.4"
        stroke={accentColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <path
        d="M21.4 21.4L20.05 20.05"
        stroke={accentColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <path
        d="M11.95 11.95L10.6 10.6"
        stroke={accentColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <circle
        cx="16"
        cy="16"
        r="7.1"
        stroke={color}
        strokeWidth={strokeWidth}
        opacity="0.55"
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
      <path
        d="M8.8 9.6H14.9C15.8 9.6 16.55 10.35 16.55 11.25V22.2C16.05 21.45 15.2 21 14.2 21H8.8V9.6Z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <path
        d="M23.2 9.6H17.1C16.2 9.6 15.45 10.35 15.45 11.25V22.2C15.95 21.45 16.8 21 17.8 21H23.2V9.6Z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <path
        d="M11.2 13.1H13.9"
        stroke={accentColor}
        strokeWidth={strokeWidth - 0.2}
        strokeLinecap="round"
      />
      <path
        d="M18.1 13.1H20.8"
        stroke={accentColor}
        strokeWidth={strokeWidth - 0.2}
        strokeLinecap="round"
      />
      <path
        d="M12 16.1L14.2 18.3"
        stroke={accentColor}
        strokeWidth={strokeWidth - 0.2}
        strokeLinecap="round"
      />
      <path
        d="M20 16.1L17.8 18.3"
        stroke={accentColor}
        strokeWidth={strokeWidth - 0.2}
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
        strokeWidth={strokeWidth - 0.5}
      />
    </>
  );
}

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

export function BrandIcon({
  name,
  size = 24,
  color = BRAND_GOLD_LIGHT,
  accentColor = BRAND_SEAM_RED,
  strokeWidth = 1.8,
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
  background = `linear-gradient(135deg, ${withAlpha(BRAND_NAVY_LIGHT, 0.24)} 0%, ${withAlpha(BG_DARK, 0.9)} 100%)`,
  borderColor = withAlpha(BRAND_GOLD_LIGHT, 0.16),
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
        boxShadow: `inset 0 1px 0 ${withAlpha(WHITE, 0.06)}`,
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
