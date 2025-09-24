import React from 'react';
import {
  Alert,
  Platform,
  Text,
  TouchableOpacity,
  View,
} from '../platform-components';

// Temporary styles object to replace StyleSheet.create
const styles = {
  container: {
    flex: 1,
    backgroundColor: '#1E1E1E',
    padding: 20,
    ...(Platform.OS === 'web' && {
      minHeight: 400,
      display: 'flex' as const,
    }),
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#3366FF',
    marginBottom: 8,
    textAlign: 'center' as const,
    ...(Platform.OS === 'web' && {
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }),
  },
  subtitle: {
    fontSize: 16,
    color: '#CCCCCC',
    textAlign: 'center' as const,
    marginBottom: 32,
    ...(Platform.OS === 'web' && {
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }),
  },
  card: {
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#333',
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#3366FF',
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }),
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#CCCCCC',
    marginBottom: 16,
    ...(Platform.OS === 'web' && {
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }),
  },
  buttonRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#3366FF',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 80,
  },
  buttonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#3366FF',
  },
  buttonDanger: {
    backgroundColor: '#FF4444',
  },
  buttonSuccess: {
    backgroundColor: '#44AA44',
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
    ...(Platform.OS === 'web' && {
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }),
  },
  buttonTextSecondary: {
    color: '#3366FF',
  },
  listItem: {
    fontSize: 14,
    color: '#CCCCCC',
    marginBottom: 8,
    lineHeight: 20,
    ...(Platform.OS === 'web' && {
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }),
  },
};

const Button = ({
  title,
  onPress,
  variant = 'primary',
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'success';
}) => {
  const buttonStyles = [
    styles.button,
    variant === 'secondary' && styles.buttonSecondary,
    variant === 'danger' && styles.buttonDanger,
    variant === 'success' && styles.buttonSuccess,
  ];

  const textStyles = [
    styles.buttonText,
    variant === 'secondary' && styles.buttonTextSecondary,
  ];

  if (Platform.OS === 'web') {
    // For web, we need to flatten styles for the div element
    const validButtonStyles = buttonStyles.filter(
      Boolean,
    ) as React.CSSProperties[];
    const validTextStyles = textStyles.filter(Boolean) as React.CSSProperties[];

    const flatButtonStyle = validButtonStyles.reduce(
      (acc, style) => ({ ...acc, ...style }),
      {} as React.CSSProperties,
    );
    const flatTextStyle = validTextStyles.reduce(
      (acc, style) => ({ ...acc, ...style }),
      {} as React.CSSProperties,
    );

    return (
      <div
        style={{
          ...flatButtonStyle,
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onClick={onPress}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = '0.8';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = '1';
        }}
      >
        <span style={flatTextStyle}>{title}</span>
      </div>
    );
  }

  return (
    <TouchableOpacity style={buttonStyles} onPress={onPress}>
      <Text style={textStyles}>{title}</Text>
    </TouchableOpacity>
  );
};

function DemoScreen() {
  const showAlert = (message: string) => {
    if (Platform.OS === 'web') {
      alert(message);
    } else {
      Alert.alert('Demo Action', message);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Component Demo</Text>
      <Text style={styles.subtitle}>
        Cross-platform React Native components
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Interactive Buttons</Text>
        <Text style={styles.cardSubtitle}>
          Different button variants and interactions
        </Text>

        <View style={styles.buttonRow}>
          <Button
            title="Primary"
            onPress={() => showAlert('Primary button pressed!')}
          />
          <Button
            title="Secondary"
            variant="secondary"
            onPress={() => showAlert('Secondary button pressed!')}
          />
          <Button
            title="Success"
            variant="success"
            onPress={() => showAlert('Success button pressed!')}
          />
          <Button
            title="Danger"
            variant="danger"
            onPress={() => showAlert('Danger button pressed!')}
          />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>React Native Components</Text>
        <Text style={styles.cardSubtitle}>
          Core components used in this demo
        </Text>

        <Text style={styles.listItem}>• Text for displaying text content</Text>
        <Text style={styles.listItem}>
          • TouchableOpacity for interactive elements
        </Text>
        <Text style={styles.listItem}>• View for container layouts</Text>
        <Text style={styles.listItem}>• Flexbox for responsive layouts</Text>
        <Text style={styles.listItem}>• Platform-specific styling</Text>
        <Text style={styles.listItem}>• Cross-platform compatibility</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Platform Detection</Text>
        <Text style={styles.cardSubtitle}>Current platform information</Text>

        <Text style={styles.listItem}>• Platform: {Platform.OS}</Text>
        <Text style={styles.listItem}>
          • Environment:{' '}
          {Platform.select({
            web: 'Web Browser',
            ios: 'iOS Device',
            android: 'Android Device',
            default: 'Unknown',
          })}
        </Text>
        <Text style={styles.listItem}>
          • Is Web: {Platform.OS === 'web' ? 'Yes' : 'No'}
        </Text>
      </View>
    </View>
  );
}

export { DemoScreen };
