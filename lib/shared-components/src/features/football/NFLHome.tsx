import React from 'react';
import { Platform } from 'react-native';
import { Text, YStack } from 'tamagui';

export interface NFLHomeProps {
  /**
   * Title text for the NFL home screen
   * @default 'NFL Fantasy'
   */
  title?: string;
  /**
   * Subtitle text for the NFL home screen
   */
  subtitle?: string;
  /**
   * Additional content to render below the title
   */
  children?: React.ReactNode;
}

function NFLHome({ title = 'NFL Fantasy', subtitle, children }: NFLHomeProps) {
  return (
    <YStack
      flex={1}
      padding="$5"
      backgroundColor="$gray1"
      justifyContent="center"
      alignItems="center"
    >
      <Text
        fontSize={Platform.OS === 'web' ? '$9' : '$8'}
        fontWeight="bold"
        color="$gray12"
        textAlign="center"
        marginBottom="$4"
      >
        {title}
      </Text>
      {subtitle && (
        <Text
          fontSize={Platform.OS === 'web' ? '$5' : '$4'}
          color="$gray10"
          textAlign="center"
          marginBottom="$6"
        >
          {subtitle}
        </Text>
      )}
      {children}
    </YStack>
  );
}

export { NFLHome };
export default NFLHome;
