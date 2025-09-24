import React from 'react';
import { Text, YStack } from 'tamagui';
import { Platform } from '../../platform-components';

export interface SportScreenProps {
  /**
   * The name of the sport
   */
  sportName: string;
  /**
   * Main title text
   * @default '{sportName} Fantasy'
   */
  title?: string;
  /**
   * Subtitle text
   * @default 'Coming soon...'
   */
  subtitle?: string;
  /**
   * Background color for the screen
   * @default '#1E1E1E'
   */
  backgroundColor?: string;
  /**
   * Title text color
   * @default '#FFFFFF'
   */
  titleColor?: string;
  /**
   * Subtitle text color
   * @default '#CCCCCC'
   */
  subtitleColor?: string;
  /**
   * Custom styles for the container
   */
  containerStyle?: React.CSSProperties;
  /**
   * Custom styles for the title
   */
  titleStyle?: React.CSSProperties;
  /**
   * Custom styles for the subtitle
   */
  subtitleStyle?: React.CSSProperties;
  /**
   * Additional content to render below the subtitle
   */
  children?: React.ReactNode;
}

function SportScreen({
  sportName,
  title,
  subtitle = 'Coming soon...',
  backgroundColor = '#1E1E1E',
  titleColor = '#FFFFFF',
  subtitleColor = '#CCCCCC',
  containerStyle,
  titleStyle,
  subtitleStyle,
  children,
}: SportScreenProps) {
  const displayTitle = title || `${sportName} Fantasy`;

  return (
    <YStack
      flex={1}
      justifyContent="center"
      alignItems="center"
      padding="$5"
      backgroundColor={backgroundColor}
      style={containerStyle}
    >
      <Text
        fontSize={Platform.OS === 'web' ? '$9' : '$8'}
        fontWeight={700 as const}
        marginBottom="$4"
        textAlign="center"
        color={titleColor}
        style={titleStyle}
      >
        {displayTitle}
      </Text>

      <Text
        fontSize={Platform.OS === 'web' ? '$6' : '$5'}
        textAlign="center"
        marginBottom="$6"
        color={subtitleColor}
        style={subtitleStyle}
      >
        {subtitle}
      </Text>

      {children}
    </YStack>
  );
}

// Specific sport screen implementations
export type BaseballScreenProps = Omit<SportScreenProps, 'sportName'>;

function BaseballScreen(props: BaseballScreenProps) {
  return <SportScreen sportName="Baseball" {...props} />;
}

export type FootballScreenProps = Omit<SportScreenProps, 'sportName'>;

function FootballScreen(props: FootballScreenProps) {
  return <SportScreen sportName="Football" {...props} />;
}

export type BasketballScreenProps = Omit<SportScreenProps, 'sportName'>;

function BasketballScreen(props: BasketballScreenProps) {
  return <SportScreen sportName="Basketball" {...props} />;
}

export type HockeyScreenProps = Omit<SportScreenProps, 'sportName'>;

function HockeyScreen(props: HockeyScreenProps) {
  return <SportScreen sportName="Hockey" {...props} />;
}

export { SportScreen };
export { BaseballScreen };
export { FootballScreen };
export { BasketballScreen };
export { HockeyScreen };
export default SportScreen;
