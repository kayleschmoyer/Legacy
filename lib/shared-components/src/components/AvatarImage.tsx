import React, { useState } from 'react';
import {
  brand,
  darkSurface,
  darkText,
  semantic,
  shadowsDark,
} from '@legacy-sports/design-tokens';
import { Text, XStack } from 'tamagui';
import {
  type AvatarImageProps,
  type AvatarRing,
  deriveInitials,
  resolveSize,
} from './avatar-image-utils';
import { FONT_DISPLAY } from '../utils/typography';

export type {
  AvatarImageProps,
  AvatarRing,
  AvatarSize,
} from './avatar-image-utils';
export { deriveInitials, usernameToHue } from './avatar-image-utils';

// ─── Tokens ───────────────────────────────────────────────────────────────────

const RING_STYLES: Record<Exclude<AvatarRing, 'none'>, string> = {
  gold: `0 0 0 2px ${brand.gold}, ${shadowsDark.sm}`,
  seam: `0 0 0 2px ${brand.seamRed}, ${shadowsDark.sm}`,
  success: `0 0 0 2px ${semantic.success}, 0 0 0 4px ${semantic.successSoft}`,
};

const AVATAR_GRADIENT = `linear-gradient(135deg, ${brand.navy} 0%, ${brand.gold} 100%)`;

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * AvatarImage — displays a user or team avatar.
 *
 * Web implementation: uses an HTML <img> for the avatar photo, falls back to
 * a brand-gradient circle with up-to-two derived initials. When neither a URL
 * nor a username is provided, renders a neutral empty state with a user glyph.
 * For the native implementation, see AvatarImage.native.tsx.
 */
export function AvatarImage({
  url,
  username,
  size = 'sm',
  borderRadius,
  ring = 'none',
}: AvatarImageProps): React.JSX.Element {
  const [imgError, setImgError] = useState(false);

  const dims = resolveSize(size);
  const radius = borderRadius !== undefined ? borderRadius : dims.px / 2;
  const showImg = !!url && !imgError;
  const initials = deriveInitials(username);
  const hasInitials = initials.length > 0;

  const background = showImg
    ? 'transparent'
    : hasInitials
      ? AVATAR_GRADIENT
      : darkSurface.surfaceCard;

  const boxShadow = ring === 'none' ? shadowsDark.sm : RING_STYLES[ring];

  return (
    <XStack
      width={dims.px}
      height={dims.px}
      borderRadius={radius}
      overflow="hidden"
      alignItems="center"
      justifyContent="center"
      style={{
        flexShrink: 0,
        background,
        boxShadow,
        boxSizing: 'border-box',
      }}
    >
      {showImg ? (
        <img
          src={url}
          alt={username ?? 'avatar'}
          width={dims.px}
          height={dims.px}
          onError={() => setImgError(true)}
          style={{ display: 'block', objectFit: 'cover', borderRadius: radius }}
        />
      ) : hasInitials ? (
        <Text
          color={darkText.fg1Strong}
          fontSize={dims.font}
          fontWeight="800"
          fontFamily={FONT_DISPLAY}
          lineHeight={`${dims.px}px`}
          textAlign="center"
        >
          {initials}
        </Text>
      ) : (
        <EmptyGlyph color={darkText.fg3} size={dims.icon} />
      )}
    </XStack>
  );
}

function EmptyGlyph({
  color,
  size,
}: {
  color: string;
  size: number;
}): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}
