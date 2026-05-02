/**
 * LiveLamp — small circular indicator used to mark live state.
 *
 * When `pulse` is true the lamp slow-fades between full and 35% opacity
 * via `setInterval`, so it works the same way on web and native.
 */
import React, { useEffect, useState } from 'react';
import { YStack } from 'tamagui';

export interface LiveLampProps {
  /** Diameter in px. Defaults to 8. */
  size?: number;
  /** Background colour. Defaults to `$green11` (turf). */
  color?: string;
  /** When true, fades opacity in a 1.4s loop. */
  pulse?: boolean;
  /** When true, adds a soft halo behind the lamp. */
  glow?: boolean;
  testID?: string;
}

export function LiveLamp({
  size = 8,
  color = '$green11',
  pulse = false,
  glow = false,
  testID,
}: LiveLampProps): React.JSX.Element {
  const [bright, setBright] = useState(true);

  useEffect(() => {
    if (!pulse) return;
    const id = setInterval(() => setBright((b) => !b), 700);
    return () => clearInterval(id);
  }, [pulse]);

  return (
    <YStack
      width={size}
      height={size}
      borderRadius={size}
      backgroundColor={color}
      opacity={pulse && !bright ? 0.35 : 1}
      animation="quick"
      shadowColor={glow ? color : undefined}
      shadowRadius={glow ? 6 : 0}
      shadowOpacity={glow ? 0.55 : 0}
      testID={testID}
      // Always decorative — the live/state label that accompanies the
      // lamp already conveys the same meaning to screen readers.
      aria-hidden
    />
  );
}
