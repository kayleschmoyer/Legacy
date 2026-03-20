import React from 'react';
import { Text } from 'react-native';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { LOGGER } from '@legacy-sports/logging';
import type { IconProps } from './LazyIcon';
import { safeStyle } from '../../utils/styles';
import type { BrandIconName } from '../../components/icons/BrandIcon.native';
import { BrandIcon } from '../../components/icons/BrandIcon.native';

const BRAND_ICON_NAMES: ReadonlySet<string> = new Set<BrandIconName>([
  'baseball',
  'football',
  'stats',
  'draft',
  'live',
  'secure',
  'settings',
  'book',
  'google',
]);

// Native icon implementation — BrandIcon for heritage glyphs, MaterialIcons for the rest
const NativeIcons: React.FC<IconProps> = ({
  name,
  size = 24,
  color,
  style,
}) => {
  const isBrandIcon = BRAND_ICON_NAMES.has(name);

  // Try to dynamically import MaterialIcons if available
  const [IconComponent, setIconComponent] = React.useState<React.ComponentType<{
    name: string;
    size: number;
    color: string;
    style?: unknown;
  }> | null>(null);
  const [isLoading, setIsLoading] = React.useState(!isBrandIcon);

  React.useEffect(() => {
    if (isBrandIcon) return;

    setIsLoading(true);
    let mounted = true;

    const loadIcons = async () => {
      try {
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
        LOGGER.info('MaterialIcons not available, rendering nothing');
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
  }, [isBrandIcon]);

  // Render BrandIcon for heritage glyph names
  if (isBrandIcon) {
    return (
      <BrandIcon
        name={name as BrandIconName}
        size={size}
        color={color}
        style={style as StyleProp<ViewStyle>}
        testID={`brand-icon-${name}`}
      />
    );
  }

  if (isLoading) {
    return (
      <Text
        style={
          safeStyle([
            { fontSize: size, color: color ?? 'black' },
            style,
          ]) as StyleProp<TextStyle>
        }
        accessibilityLabel="Loading icon"
      />
    );
  }

  if (IconComponent) {
    return (
      <IconComponent
        name={name}
        size={size}
        color={color ?? 'black'}
        style={style as StyleProp<ViewStyle>}
      />
    );
  }

  // MaterialIcons unavailable — render nothing rather than misleading Unicode
  return null;
};

export default NativeIcons;
