import React, { useEffect } from 'react';
import { Text, YStack } from 'tamagui';
import { FONT_DISPLAY } from '../utils/typography';

export type { SkeletonProps } from './Skeleton';
export { Skeleton, SkeletonRow } from './Skeleton';

// Inject keyframes + prefers-reduced-motion pause rule once per page (web only).
let _stylesInjected = false;
function injectSpinnerStyles(): void {
  if (typeof document === 'undefined' || _stylesInjected) return;
  _stylesInjected = true;
  const el = document.createElement('style');
  el.id = 'ls-spinner-styles';
  el.textContent =
    '@keyframes ls-spin{to{transform:rotate(360deg)}}' +
    '@media(prefers-reduced-motion:reduce){.ls-ring{animation-play-state:paused!important}}';
  document.head.appendChild(el);
}

const SIZE_MAP = {
  sm: { px: 18, bw: 2 },
  md: { px: 28, bw: 3 },
  lg: { px: 42, bw: 3 },
} as const;

// Map Tamagui brand token strings (e.g. "$brandGold") to CSS hex so callers can pass them unchanged.
const TOKEN_TO_HEX: Record<string, string> = {
  $brandGold: '#C5A55A',
  $brandGoldLight: '#D4BB78',
  $brandGoldDark: '#A68B3E',
  $brandSeamRed: '#C41E3A',
  $brandSeamRedLight: '#E63950',
  $brandNavy: '#1B3A5C',
  $brandNavyLight: '#2C4A7C',
};

function resolveColor(c: string): string {
  return TOKEN_TO_HEX[c] ?? c;
}

export interface SpinnerProps {
  /** Ring size. Defaults to "lg" (42 px). */
  size?: 'sm' | 'md' | 'lg';
  /** Accent color for the leading edge of the ring. Accepts hex, CSS color,
   *  or a Tamagui brand token string (e.g. "$brandGold"). Defaults to brand gold. */
  color?: string;
  /** Optional message rendered below (or beside, when `inline`) the ring. */
  label?: string;
  /** Render as a centred full-page overlay. */
  fullPage?: boolean;
  /** Render label beside the ring instead of below it. */
  inline?: boolean;
}

/** Brand-spec CSS ring spinner. Sizes: sm/md/lg. Honors prefers-reduced-motion. */
export function Spinner({
  size = 'lg',
  color = '$brandGold',
  label,
  fullPage = false,
  inline = false,
}: SpinnerProps): React.JSX.Element {
  useEffect(injectSpinnerStyles, []);

  const { px, bw } = SIZE_MAP[size];
  const topColor = resolveColor(color);

  const ring = (
    <div
      className="ls-ring"
      style={{
        width: px,
        height: px,
        borderRadius: '50%',
        border: `${bw}px solid rgba(255,255,255,0.12)`,
        borderTopColor: topColor,
        animation: 'ls-spin 0.9s linear infinite',
        flexShrink: 0,
      }}
    />
  );

  const labelEl = label ? (
    <Text
      fontFamily={FONT_DISPLAY}
      fontWeight="700"
      fontSize={11}
      letterSpacing={1.2}
      textTransform="uppercase"
      color="$textMuted"
    >
      {label}
    </Text>
  ) : null;

  const inner =
    labelEl !== null ? (
      <div
        style={{
          display: 'flex',
          flexDirection: inline ? 'row' : 'column',
          alignItems: 'center',
          gap: 10,
        }}
      >
        {ring}
        {labelEl}
      </div>
    ) : (
      ring
    );

  if (!fullPage) return inner;

  return (
    <YStack
      flex={1}
      width="100%"
      alignItems="center"
      justifyContent="center"
      padding="$6"
    >
      {inner}
    </YStack>
  );
}
