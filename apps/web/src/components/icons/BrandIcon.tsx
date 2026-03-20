/**
 * Re-export BrandIcon from shared-components.
 *
 * The canonical implementation now lives in lib/shared-components so it can
 * be used on both web and mobile. This file preserves the existing import
 * path for web consumers.
 */
export {
  BRAND_ICON_ACCENT,
  ALL_BRAND_ICON_NAMES,
  BrandIcon,
  BrandIconBadge,
} from '@legacy-sports/shared-components';
export type {
  BrandIconName,
  BrandIconProps,
  BrandIconBadgeProps,
} from '@legacy-sports/shared-components';
