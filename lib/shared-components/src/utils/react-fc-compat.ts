import React from 'react';

// React 19 compatibility utility for React.FC
// This type works around the Element vs ReactNode incompatibility
export type ReactFC<P = Record<string, never>> = (
  props: P,
) => React.ReactElement | null;

// Legacy React.FC for compatibility
export type LegacyReactFC<P = Record<string, never>> = React.FC<P>;

// Type helper to ensure component returns proper ReactNode
export function createFC<T>(
  component: (props: T) => React.ReactElement | null,
): ReactFC<T> {
  return component;
}

// Wrapper that converts a component to work with React.FC
export function compatFC<T>(
  component: (props: T) => React.ReactElement | null,
): React.FC<T> {
  return component as unknown as React.FC<T>;
}

// Default export for easier usage
export { ReactFC as FC };
