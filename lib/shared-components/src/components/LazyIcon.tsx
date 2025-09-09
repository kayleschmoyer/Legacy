import React, { Suspense, lazy } from 'react';
import { Platform, Text } from 'react-native';

// Platform-specific icon implementations
const NativeIcons = lazy(() => import('./NativeIcons'));
const WebIcons = lazy(() => import('./WebIcons'));

export interface IconProps {
  name: string;
  size?: number;
  color?: string;
  style?: any;
}

// Fallback icon component
const IconFallback = ({ size = 24 }: { size?: number }) => (
  <Text style={{ fontSize: size }}>⚙️</Text>
);

// Cross-platform icon component
export const LazyIcon: React.FC<IconProps> = (props) => {
  if (Platform.OS === 'web') {
    return (
      <Suspense fallback={<IconFallback size={props.size} />}>
        <WebIcons {...props} />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<IconFallback size={props.size} />}>
      <NativeIcons {...props} />
    </Suspense>
  );
};

export default LazyIcon;
