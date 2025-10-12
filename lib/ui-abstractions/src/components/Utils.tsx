import * as React from 'react';
import { forwardRef } from 'react';

// Import Tamagui utility components
import { Separator as TamaguiSeparator, Spinner as TamaguiSpinner } from 'tamagui';
import type { BaseUIProps, ViewProps } from '../types/ui';

// Loading spinner component
interface SpinnerProps extends BaseUIProps {
  size?: 'small' | 'large' | number;
  color?: string;
}

export const Spinner = forwardRef<any, SpinnerProps>(
  ({ size = 'small', color, testID, accessibilityLabel, id }, ref) => {
    const tamaguiSize = typeof size === 'number' ? 'small' : size === 'large' ? 'large' : 'small';
    
    return (
      <TamaguiSpinner
        ref={ref}
        size={tamaguiSize}
        color={color}
      />
    );
  }
);

Spinner.displayName = 'Spinner';

// Loading panel with spinner
interface LoadingPanelProps extends ViewProps {
  message?: string;
  spinnerSize?: 'small' | 'large' | number;
}

export function LoadingPanel({ message = 'Loading...', spinnerSize = 'large', ...props }: LoadingPanelProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        ...props.flex && { flex: props.flex },
        ...props.width && { width: props.width },
        ...props.height && { height: props.height },
      }}
    >
      <Spinner size={spinnerSize} />
      {message && (
        <span style={{ marginTop: 8, fontSize: 14, color: '#666' }}>
          {message}
        </span>
      )}
    </div>
  );
}

// Separator/Divider component
interface SeparatorProps extends BaseUIProps {
  orientation?: 'horizontal' | 'vertical';
  color?: string;
  width?: number | string;
  height?: number | string;
  margin?: number | string;
}

export const Separator = forwardRef<any, SeparatorProps>(
  ({ orientation = 'horizontal', color, width, height, margin, testID, accessibilityLabel, id }, ref) => {
    return (
      <TamaguiSeparator
        ref={ref}
        vertical={orientation === 'vertical'}
        borderColor={color}
        width={width}
        height={height}
        margin={margin}
        testID={testID}
        id={id}
        accessibilityLabel={accessibilityLabel}
      />
    );
  }
);

Separator.displayName = 'Separator';

// Divider alias for Separator
export const Divider = Separator;

// ActivityIndicator alias for Spinner (React Native compatibility)
export const ActivityIndicator = Spinner;
