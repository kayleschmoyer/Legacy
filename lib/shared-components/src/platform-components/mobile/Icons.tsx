import React from 'react';
import { Text } from 'react-native';
import type { IconProps } from './LazyIcon';
import { safeStyle } from '../../utils/styles';

// Native icon implementation with fallback
const NativeIcons: React.FC<IconProps> = ({
  name,
  size = 24,
  color = 'black',
  style,
}) => {
  // Try to dynamically import MaterialIcons if available
  const [IconComponent, setIconComponent] = React.useState<any>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let mounted = true;

    const loadIcons = async () => {
      try {
        // Dynamic import with error handling
        const { MaterialIcons } = await import('@expo/vector-icons');
        if (mounted) {
          setIconComponent(() => MaterialIcons);
        }
      } catch (error) {
        console.log('MaterialIcons not available, using fallback');
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    loadIcons();

    return () => {
      mounted = false;
    };
  }, []);

  // Show loading state briefly
  if (isLoading) {
    return (
      <Text style={safeStyle([{ fontSize: size, color }, style]) as any}>⚙️</Text>
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
      style={safeStyle([{ fontSize: size, color, lineHeight: size }, style]) as any}
    >
      {iconSymbol}
    </Text>
  );
};

export default NativeIcons;
