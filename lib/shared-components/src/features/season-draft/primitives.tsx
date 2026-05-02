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

type YStackProps = React.ComponentProps<typeof YStack>;

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
