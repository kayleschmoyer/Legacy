import React from 'react';
import { Platform, StyleSheet, Text, View } from '../../platform-components';
import { safeStyle } from '../../utils/styles';

export interface MLBHomeProps {
  /**
   * Title text for the MLB home screen
   * @default 'MLB Players'
   */
  title?: string;
  /**
   * Subtitle text for the MLB home screen
   */
  subtitle?: string;
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
   * Additional content to render below the title
   */
  children?: React.ReactNode;
}

function MLBHome({
  title = 'MLB Players',
  subtitle,
  containerStyle,
  titleStyle,
  subtitleStyle,
  children,
}: MLBHomeProps) {
  return (
    <View style={safeStyle([styles.container, containerStyle])}>
      <Text style={safeStyle([styles.title, titleStyle])}>{title}</Text>
      {subtitle && (
        <Text style={safeStyle([styles.subtitle, subtitleStyle])}>
          {subtitle}
        </Text>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f8f9fa',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: Platform.OS === 'web' ? 32 : 28,
    fontWeight: 'bold',
    color: '#2c3e50',
    textAlign: 'center',
    marginBottom: 16,
  },
  subtitle: {
    fontSize: Platform.OS === 'web' ? 18 : 16,
    color: '#6c757d',
    textAlign: 'center',
    marginBottom: 24,
  },
});

export { MLBHome };
export default MLBHome;
