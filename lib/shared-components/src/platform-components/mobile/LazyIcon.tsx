import React from 'react';
import type { ReactNativeStyleProperties } from '../types/platform-exports';

export interface IconProps {
  name: string;
  size?: number;
  color?: string;
  style?: ReactNativeStyleProperties;
  onPress?: () => void;
}

// Lazy-loaded icon component for mobile
export const LazyIcon: React.FC<IconProps> = ({
  name,
  size = 24,
  color = 'black',
  style,
  onPress,
}) => {
  // Placeholder implementation - could be replaced with actual icon library
  const iconStyle: React.CSSProperties = {
    fontSize: size,
    color: color || 'black',
    cursor: onPress ? 'pointer' : 'default',
    ...(style as unknown as React.CSSProperties),
  };

  return (
    <span style={iconStyle} onClick={onPress}>
      {name}
    </span>
  );
};
