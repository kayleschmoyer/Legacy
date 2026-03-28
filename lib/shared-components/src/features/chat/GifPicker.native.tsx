/**
 * GifPicker — native stub.
 *
 * The GIF picker relies on DOM elements (`<input>`, `<div>`, `<img>`) and is
 * web-only. This stub renders a placeholder message so imports resolve cleanly
 * on React Native without pulling in browser APIs.
 */

import React from 'react';
import { Text, YStack } from 'tamagui';

import type { GifPickerProps } from './GifPicker';

export type { GifPickerProps };

export function GifPicker(_props: GifPickerProps): React.JSX.Element {
  return (
    <YStack padding="$4" alignItems="center" justifyContent="center">
      <Text fontSize="$3" color="$textMuted">
        GIF picker is not available on this platform.
      </Text>
    </YStack>
  );
}
