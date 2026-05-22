import React, { useState } from 'react';
import { Image } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import {
  brand,
  darkSurface,
  darkText,
  semantic,
} from '@legacy-sports/design-tokens';
import { Text, XStack } from 'tamagui';
import {
  type AvatarImageProps,
  type AvatarRing,
  deriveInitials,
  resolveSize,
} from './avatar-image-utils';
import { FONT_DISPLAY } from '../utils/typography';

const RING_COLORS: Record<Exclude<AvatarRing, 'none'>, string> = {
  gold: brand.gold,
  seam: brand.seamRed,
  success: semantic.success,
};

/**
 * AvatarImage — React Native implementation. Mirrors the web component:
 * brand-gradient fallback is approximated by a solid `brand.navy` surface
 * (no expo-linear-gradient dependency), initials are derived (up to two),
 * and a neutral empty state renders when neither URL nor username is given.
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
      ? brand.navy
      : darkSurface.surfaceCard;

  const ringWidth = ring === 'none' ? 0 : 2;
  const ringColor = ring === 'none' ? 'transparent' : RING_COLORS[ring];

  return (
    <XStack
      width={dims.px}
      height={dims.px}
      borderRadius={radius}
      overflow="hidden"
      alignItems="center"
      justifyContent="center"
      backgroundColor={background}
      borderWidth={ringWidth}
      borderColor={ringColor}
    >
      {showImg ? (
        <Image
          source={{ uri: url }}
          style={{ width: dims.px, height: dims.px, borderRadius: radius }}
          onError={() => setImgError(true)}
        />
      ) : hasInitials ? (
        <Text
          color={darkText.fg1Strong}
          fontSize={dims.font}
          fontWeight="800"
          fontFamily={FONT_DISPLAY}
          textAlign="center"
        >
          {initials}
        </Text>
      ) : (
        <Svg
          width={dims.icon}
          height={dims.icon}
          viewBox="0 0 24 24"
          fill="none"
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Circle
            cx="12"
            cy="8"
            r="4"
            stroke={darkText.fg3}
            strokeWidth={1.8}
          />
          <Path
            d="M4 21a8 8 0 0 1 16 0"
            stroke={darkText.fg3}
            strokeWidth={1.8}
          />
        </Svg>
      )}
    </XStack>
  );
}
