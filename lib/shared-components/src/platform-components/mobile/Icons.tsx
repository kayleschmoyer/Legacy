import React from 'react';
import { Text } from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';
import type { IconProps } from './LazyIcon';
import { safeStyle } from '../../utils/styles';
// Simple logger fallback for Icons
const LOGGER = {
  debug: (message: string, ...args: unknown[]) =>
    console.debug(message, ...args),
  info: (message: string, ...args: unknown[]) => console.info(message, ...args),
  warn: (message: string, ...args: unknown[]) => console.warn(message, ...args),
  error: (message: string, ...args: unknown[]) =>
    console.error(message, ...args),
};

// Native icon implementation with fallback
const NativeIcons: React.FC<IconProps> = ({
  name,
  size = 24,
  color = 'black',
  style,
}) => {
  // Try to dynamically import MaterialIcons if available
  const useState = React.useState<React.ComponentType<{
    name: string;
    size: number;
    color: string;
    style?: unknown;
  }> | null>;
  const [IconComponent, setIconComponent] = useState(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let mounted = true;

    const loadIcons = async () => {
      try {
        // Dynamic import with error handling
        const { MaterialIcons } = await import('@expo/vector-icons');
        if (mounted) {
          setIconComponent(
            MaterialIcons as React.ComponentType<{
              name: string;
              size: number;
              color: string;
              style?: unknown;
            }>,
          );
        }
      } catch {
        LOGGER.info('MaterialIcons not available, using fallback');
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    void loadIcons();

    return () => {
      mounted = false;
    };
  }, []);

  // Show loading state briefly
  if (isLoading) {
    return (
      <Text
        style={safeStyle([{ fontSize: size, color }, style]) as StyleProp<TextStyle>}
        accessibilityLabel="Loading gear"
      >
        {/* eslint-disable-next-line jsx-a11y/accessible-emoji */}
        ⚙️
      </Text>
    );
  }

  // Use MaterialIcons if available
  if (IconComponent) {
    return (
      <IconComponent name={name} size={size} color={color} style={style} />
    );
  }

  // Fallback to Unicode symbols
  const iconMap: Record<string, string> = {
    'filter-list': '⚙️',
    search: '🔍',
    home: '🏠',
    person: '👤',
    settings: '⚙️',
    close: '✕',
    'arrow-back': '←',
    'arrow-forward': '→',
    'keyboard-arrow-up': '↑',
    'keyboard-arrow-down': '↓',
    check: '✓',
    add: '+',
    remove: '-',
    edit: '✏️',
    delete: '🗑️',
    star: '⭐',
    favorite: '❤️',
  };

  const iconSymbol = iconMap[name] || '❓';

  return (
    <Text
      style={safeStyle([{ fontSize: size, color, lineHeight: size }, style]) as StyleProp<TextStyle>}
    >
      {iconSymbol}
    </Text>
  );
};

export default NativeIcons;
