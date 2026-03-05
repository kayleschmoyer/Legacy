import React, { useState } from 'react';
import { Text, XStack } from 'tamagui';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AvatarImageProps {
  /** URL of the avatar image. If null/undefined, shows an initials fallback. */
  url?: string | null;
  /** Username used to derive the initials fallback. */
  username?: string | null;
  /** Diameter in pixels. Defaults to 32. */
  size?: number;
  /** Border radius as a ratio of size. Defaults to 0.5 (circle). */
  borderRadius?: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * AvatarImage — displays a user or team avatar.
 *
 * Web implementation: uses an HTML <img> element for the avatar.
 * For the native implementation, see AvatarImage.native.tsx.
 *
 * Shows the image URL when provided; falls back to a colored circle with the
 * first letter of the username. The initial color is derived from the username
 * so the same user always gets the same hue.
 */
export function AvatarImage({
  url,
  username,
  size = 32,
  borderRadius,
}: AvatarImageProps): React.JSX.Element {
  const [imgError, setImgError] = useState(false);
  const radius = borderRadius !== undefined ? borderRadius : size / 2;

  const initial = username ? username[0].toUpperCase() : '?';
  const hue = usernameToHue(username ?? '');

  const showImg = !!url && !imgError;

  return (
    <XStack
      width={size}
      height={size}
      borderRadius={radius}
      overflow="hidden"
      alignItems="center"
      justifyContent="center"
      style={{
        flexShrink: 0,
        backgroundColor: showImg ? 'transparent' : `hsl(${hue}, 60%, 45%)`,
      }}
    >
      {showImg ? (
        <img
          src={url}
          alt={username ?? 'avatar'}
          width={size}
          height={size}
          onError={() => setImgError(true)}
          style={{ display: 'block', objectFit: 'cover', borderRadius: radius }}
        />
      ) : (
        <Text
          color="white"
          fontSize={size * 0.4}
          fontWeight="700"
          lineHeight={`${size}px`}
          textAlign="center"
        >
          {initial}
        </Text>
      )}
    </XStack>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Deterministic hue (0–360) from a username string. */
export function usernameToHue(username: string): number {
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}
