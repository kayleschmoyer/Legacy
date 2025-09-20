import React from 'react';

// Animation types for cross-platform compatibility
export interface AnimatedValue {
  setValue: (value: number) => void;
  getValue?: () => number;
  addListener?: (callback: (value: { value: number }) => void) => string;
  removeListener?: (id: string) => void;
  removeAllListeners?: () => void;
  interpolate?: (config: {
    inputRange: number[];
    outputRange: (number | string)[];
    extrapolate?: 'extend' | 'clamp' | 'identity';
  }) => { __getValue: () => number | string };
}

export interface SpringConfig {
  toValue: number;
  tension?: number;
  friction?: number;
  speed?: number;
  bounciness?: number;
  useNativeDriver?: boolean;
}

export interface AnimatedTimingConfig {
  toValue: number;
  duration?: number;
  delay?: number;
  easing?: (value: number) => number;
  useNativeDriver?: boolean;
}

export type AnimationConfig = (SpringConfig | AnimatedTimingConfig) & {
  duration?: number;
};

export interface AnimatedAPI {
  View: React.ComponentType<
    React.HTMLAttributes<HTMLDivElement> & {
      style?:
        | React.CSSProperties
        | React.CSSProperties[]
        | (React.CSSProperties | { [key: string]: unknown })[];
    }
  >;
  Text?: React.ComponentType<
    React.HTMLAttributes<HTMLSpanElement> & {
      style?: React.CSSProperties;
    }
  >;
  Value: new (value: number) => AnimatedValue;
  timing: (
    value: AnimatedValue,
    config: AnimatedTimingConfig,
  ) => { start: (callback?: () => void) => void };
  spring: (
    value: AnimatedValue,
    config: SpringConfig,
  ) => { start: (callback?: () => void) => void };
  parallel: (animations: { start: (callback?: () => void) => void }[]) => {
    start: (callback?: () => void) => void;
  };
}

// Additional platform types
export type PlatformOS = 'web' | 'ios' | 'android' | 'native';

export interface PlatformSelectConfig<T> {
  web?: T;
  ios?: T;
  android?: T;
  native?: T;
  default?: T;
  [key: string]: T | undefined;
}

export interface PlatformAPI {
  OS: PlatformOS;
  Version?: string;
  select: <T>(specifics: PlatformSelectConfig<T>) => T | undefined;
}
