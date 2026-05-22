/** Shared types + pure helpers for AvatarImage (web + native). */

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type AvatarRing = 'none' | 'gold' | 'seam' | 'success';

export interface AvatarImageProps {
  /** URL of the avatar image. If null/undefined, shows an initials/empty fallback. */
  url?: string | null;
  /** Username used to derive the initials fallback. */
  username?: string | null;
  /** Token size or pixel diameter. Defaults to `sm` (32). */
  size?: AvatarSize | number;
  /** Border radius as a ratio of size. Defaults to 0.5 (circle). */
  borderRadius?: number;
  /** Decorative ring around the avatar. Defaults to `none`. */
  ring?: AvatarRing;
}

export const SIZE_MAP: Record<
  AvatarSize,
  { px: number; font: number; icon: number }
> = {
  xs: { px: 24, font: 10, icon: 12 },
  sm: { px: 32, font: 12, icon: 14 },
  md: { px: 44, font: 14, icon: 18 },
  lg: { px: 64, font: 20, icon: 26 },
  xl: { px: 88, font: 28, icon: 36 },
};

export function resolveSize(size: AvatarSize | number): {
  px: number;
  font: number;
  icon: number;
} {
  if (typeof size === 'number') {
    return {
      px: size,
      font: Math.max(10, Math.round(size * 0.4)),
      icon: Math.max(10, Math.round(size * 0.45)),
    };
  }
  return SIZE_MAP[size];
}

/**
 * Returns up to two uppercase initials from a username. "Brad Krupa" → "BK";
 * single-word usernames return one initial. Empty/null returns "".
 */
export function deriveInitials(username: string | null | undefined): string {
  if (!username) return '';
  const parts = username.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Deterministic hue (0–360) from a username string. Retained for backward
 * compatibility with the prior HSL-based initials background; the current
 * component renders initials over the brand gradient instead.
 */
export function usernameToHue(username: string): number {
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}
