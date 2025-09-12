import React from 'react';

export interface IconProps {
  name: string;
  size?: number;
  color?: string;
  style?: any;
  onPress?: () => void;
}

// Lazy-loaded icon component for web
export const LazyIcon: React.FC<IconProps> = ({
  name,
  size = 24,
  color = 'black',
  style,
  onPress,
}) => {
  // Placeholder implementation - could be replaced with actual icon library
  return (
    <span
      style={{
        fontSize: size,
        color,
        cursor: onPress ? 'pointer' : 'default',
        ...style,
      }}
      onClick={onPress}
    >
      {name}
    </span>
  );
};
