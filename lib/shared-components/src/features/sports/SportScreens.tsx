import React from 'react';
import { StyleSheet, Text, View, Platform } from '../../platform-components';

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
  containerStyle?: any;
  /**
   * Custom styles for the title
   */
  titleStyle?: any;
  /**
   * Custom styles for the subtitle
   */
  subtitleStyle?: any;
  /**
   * Additional content to render below the subtitle
   */
  children?: React.ReactNode;
}

export function SportScreen({
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
}: SportScreenProps): JSX.Element {
  const displayTitle = title || `${sportName} Fantasy`;

  return (
    <View style={[styles.container, { backgroundColor }, containerStyle]}>
      <Text style={[styles.title, { color: titleColor }, titleStyle]}>
        {displayTitle}
      </Text>

      <Text style={[styles.subtitle, { color: subtitleColor }, subtitleStyle]}>
        {subtitle}
      </Text>

      {children}
    </View>
  );
}

// Specific sport screen implementations
export type BaseballScreenProps = Omit<SportScreenProps, 'sportName'>;

export function BaseballScreen(props: BaseballScreenProps): JSX.Element {
  return <SportScreen sportName="Baseball" {...props} />;
}

export type FootballScreenProps = Omit<SportScreenProps, 'sportName'>;

export function FootballScreen(props: FootballScreenProps): JSX.Element {
  return <SportScreen sportName="Football" {...props} />;
}

export type BasketballScreenProps = Omit<SportScreenProps, 'sportName'>;

export function BasketballScreen(props: BasketballScreenProps): JSX.Element {
  return <SportScreen sportName="Basketball" {...props} />;
}

export type HockeyScreenProps = Omit<SportScreenProps, 'sportName'>;

export function HockeyScreen(props: HockeyScreenProps): JSX.Element {
  return <SportScreen sportName="Hockey" {...props} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: Platform.OS === 'web' ? 28 : 24,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: Platform.OS === 'web' ? 18 : 16,
    textAlign: 'center',
    marginBottom: 24,
  },
});

export default SportScreen;
