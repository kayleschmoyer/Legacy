import React from 'react';
import { Platform } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { ArrowLeft } from '@tamagui/lucide-icons';
import { useDraftPalette } from './nativeDraftPalette';
import { handleKeyActivate } from '../../utils/keyboardActivation';

export interface DraftSlimNavProps {
  /** League name — the bar's title. Omitted while the league is loading. */
  leagueName?: string | null;
  /** Leaves the draft room (native: `closeToHomeTab`). */
  onBack: () => void;
}

/** Keyboard-focusable button semantics for a pressable stack. */
const BUTTON_A11Y = { role: 'button' as const, tabIndex: 0 };

/** Touch-target floor for the back control. */
const BACK_SIZE = 44;

/**
 * Phone slim nav bar (LS-10204) — DraftRoomMobile.html's `.mob-nav`: back +
 * league title, no destinations and no actions (LS-10165 settled this).
 *
 * Native only. The native draft route is pushed on the root Stack outside the
 * `(tabs)` shell with `headerShown: false`, so without this bar the phone
 * draft room has no way out. On web the app header stays up on the draft
 * route and already carries the menu and the league, so a second bar here
 * would stack navigation on top of the shell's — it renders nothing.
 *
 * The design's right slot is deliberately empty (a hidden spacer keeps the
 * title centred): Chat lives in the clock bar.
 */
export function DraftSlimNav({
  leagueName,
  onBack,
}: DraftSlimNavProps): React.JSX.Element | null {
  const palette = useDraftPalette();
  if (Platform.OS === 'web') return null;

  return (
    <XStack
      testID="draft-slim-nav"
      height={48}
      paddingHorizontal={4}
      alignItems="center"
      justifyContent="space-between"
      borderBottomWidth={1}
      borderBottomColor={palette.surface.outlineDefault}
      backgroundColor={palette.surface.surfacePanel}
    >
      <YStack
        testID="draft-slim-nav-back"
        width={BACK_SIZE}
        height={BACK_SIZE}
        alignItems="center"
        justifyContent="center"
        onPress={onBack}
        pressStyle={{ opacity: 0.7 }}
        {...BUTTON_A11Y}
        accessibilityRole="button"
        onKeyDown={handleKeyActivate(onBack)}
        aria-label="Leave draft room"
        accessibilityLabel="Leave draft room"
      >
        <ArrowLeft size={18} color={palette.text.fg2} />
      </YStack>
      <Text
        flex={1}
        textAlign="center"
        fontFamily="$heading"
        fontSize={14}
        fontWeight="700"
        color={palette.text.fg1}
        numberOfLines={1}
        accessibilityRole="header"
      >
        {leagueName ?? ''}
      </Text>
      <YStack width={BACK_SIZE} height={BACK_SIZE} aria-hidden />
    </XStack>
  );
}
