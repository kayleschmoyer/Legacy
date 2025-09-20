import React from 'react';
import { Text } from 'react-native';
import type { IconProps } from './LazyIcon';
import { safeStyle } from '../../utils/styles';

// Logger setup with fallback
let LOGGER: {
  info: (...args: unknown[]) => void;
} = {
  // Default fallback implementations
  info: (...args: unknown[]) => {
    // eslint-disable-next-line no-console
    console.info(...args);
  },
};

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const logging = require('@legacy-sports/logging') as {
    LOGGER: typeof LOGGER;
  };
  LOGGER = logging.LOGGER;
} catch {
  // Fallback for test environment
}

// Native icon implementation with fallback
const NativeIcons: React.FC<IconProps> = ({
  name,
  size = 24,
  color = 'black',
  style,
}) => {
  // Try to dynamically import MaterialIcons if available
  const [IconComponent, setIconComponent] = React.useState<React.ComponentType<{
    name: string;
    size: number;
    color: string;
    style?: unknown;
  }> | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let mounted = true;

    const loadIcons = async () => {
      try {
        // Dynamic import with error handling
        const { MaterialIcons } = await import('@expo/vector-icons');
        if (mounted) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
          setIconComponent(MaterialIcons as any);
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
      <>
        {/* eslint-disable-next-line jsx-a11y/accessible-emoji */}
        <Text
          // @ts-expect-error - Cross-platform style compatibility
          style={safeStyle([{ fontSize: size, color }, style])}
          accessibilityLabel="Loading gear"
        >
          ⚙️
        </Text>
      </>
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
      // @ts-expect-error - Cross-platform style compatibility
      style={safeStyle([{ fontSize: size, color, lineHeight: size }, style])}
    >
      {iconSymbol}
    </Text>
  );
};

export default NativeIcons;
