import React from 'react';
import { YStack } from 'tamagui';

/**
 * Local Tamagui primitive aliases used by the Season Draft components.
 *
 * Tamagui exports `Circle` and `Stack` as separate components, but the
 * jest mock in `jest-setup-web.js` does not include them. We re-implement
 * the small subset we need on top of `YStack` so the components render
 * in unit tests without extending the global mock.
 */

/**
 * Declared explicitly rather than derived from Tamagui's `YStack` props:
 * `React.ComponentProps<typeof YStack>` resolves to `any` under this
 * package's type-aware ESLint config, which silently collapses any
 * intersection built on it (LS-8799). An explicit surface — covering only
 * the props this file's callers actually pass — keeps the primitives
 * honest; see `.agents/skills/ui/SKILL.md` for the repo-wide convention.
 */
interface YStackProps {
  children?: React.ReactNode;
  backgroundColor?: string;
  borderWidth?: number;
  borderColor?: string;
  borderStyle?: 'solid' | 'dashed';
  borderRadius?: number | string;
  width?: number | string;
  height?: number | string;
  minWidth?: number | string;
  padding?: number | string;
  paddingHorizontal?: number | string;
  paddingVertical?: number | string;
  marginVertical?: number | string;
  gap?: number | string;
  alignItems?: 'center' | 'flex-start' | 'flex-end' | 'stretch';
  justifyContent?: 'center' | 'flex-start' | 'flex-end' | 'space-between';
  alignSelf?: 'center' | 'flex-start' | 'flex-end' | 'stretch';
  overflow?: 'hidden' | 'visible';
  testID?: string;
  'data-testid'?: string;
}

/** A circular container — Tamagui's `Circle` equivalent. */
export function Circle({
  size,
  children,
  ...rest
}: Omit<YStackProps, 'width' | 'height' | 'borderRadius'> & {
  size: number;
}): React.JSX.Element {
  return (
    <YStack
      width={size}
      height={size}
      borderRadius={size / 2}
      alignItems="center"
      justifyContent="center"
      {...rest}
    >
      {children}
    </YStack>
  );
}

/** Tamagui's `Stack` equivalent — a base flex container. */
export function Stack(props: YStackProps): React.JSX.Element {
  return <YStack {...props} />;
}
