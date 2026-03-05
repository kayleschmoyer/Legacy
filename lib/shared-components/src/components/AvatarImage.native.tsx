import React, { useState } from 'react';
import { Image } from 'react-native';
import { Text, XStack } from 'tamagui';
import { type AvatarImageProps, usernameToHue } from './AvatarImage';

/**
 * AvatarImage — displays a user or team avatar (React Native implementation).
 *
 * Uses React Native's Image component for the avatar photo and falls back to a
 * colored circle with the first letter of the username when no URL is provided.
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
      backgroundColor={showImg ? 'transparent' : `hsl(${hue}, 60%, 45%)`}
    >
      {showImg ? (
        <Image
          source={{ uri: url }}
          style={{
            width: size,
            height: size,
            borderRadius: radius,
          }}
          onError={() => setImgError(true)}
        />
      ) : (
        <Text
          color="white"
          fontSize={size * 0.4}
          fontWeight="700"
          textAlign="center"
        >
          {initial}
        </Text>
      )}
    </XStack>
  );
}
