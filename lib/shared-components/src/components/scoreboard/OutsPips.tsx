/**
 * OutsPips — three small diamond-shaped pips representing balls retired
 * in the current half-inning. Filled = recorded out.
 *
 * Renders nothing visible past 3 outs; values are clamped to [0,3].
 */
import React from 'react';
import { Text, XStack, YStack } from 'tamagui';

export interface OutsPipsProps {
  /** Number of recorded outs (0–3). Out-of-range values are clamped. */
  outs: number;
  /** Filled-pip colour. Defaults to `$green11`. */
  filledColor?: string;
  /** Empty-pip outline colour. Defaults to `$color9`. */
  emptyColor?: string;
  /** Pip size in px. Defaults to 7. */
  size?: number;
  /** When true, hides the trailing "N out(s)" label. */
  hideLabel?: boolean;
  testID?: string;
}

export function OutsPips({
  outs,
  filledColor = '$green11',
  emptyColor = '$color9',
  size = 7,
  hideLabel = false,
  testID,
}: OutsPipsProps): React.JSX.Element {
  const safe = Math.max(0, Math.min(3, outs));

  return (
    <XStack
      alignItems="center"
      gap="$1.5"
      testID={testID}
      aria-label={`${safe} ${safe === 1 ? 'out' : 'outs'}`}
    >
      <XStack gap={3}>
        {[0, 1, 2].map((i) => {
          const filled = i < safe;
          return (
            <YStack
              key={i}
              width={size}
              height={size}
              backgroundColor={filled ? filledColor : 'transparent'}
              borderWidth={1}
              borderColor={filled ? filledColor : emptyColor}
              rotate="45deg"
            />
          );
        })}
      </XStack>
      {!hideLabel && (
        <Text
          fontSize={10}
          fontWeight="700"
          letterSpacing={1.4}
          color={emptyColor}
          textTransform="uppercase"
        >
          {safe} {safe === 1 ? 'out' : 'outs'}
        </Text>
      )}
    </XStack>
  );
}
