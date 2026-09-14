/**
 * DraftPickInspector — the shared pick-inspector popup (LS-10163).
 *
 * The design opens this when a grid cell, timeline row, or phone round tile
 * is tapped (docs/design/B8P9BQz8s6NZ9Q-FqWI_yA/legacy-sports-draft-board/
 * project/styles/adaptive.css:102-117, scripts/draft.js:157-252,432-440):
 * an eyebrow ("Pick 4.06 · Round 4"), the player or the on-the-clock /
 * not-yet-made copy, a meta line, and Team/Position/Pick/Status rows (or an
 * empty-state sentence for a pick nobody has made yet).
 *
 * One component hosts all three surfaces — `DraftGrid`, `DraftBoardTimeline`,
 * `DraftRoundBoard` — each of which only has to build a `PickInspectorData`
 * (see `draftPickInspector.ts`) from whatever pick state it already has and
 * hand it here. It is purely presentational: no query, no board-specific
 * layout knowledge.
 *
 * Colors are plain Tamagui `$token` strings (matching `Dialog.tsx`'s own
 * pattern) rather than `useDraftPalette()`/`useThemeTokens()` — `DraftGrid`
 * never called a theming hook before this component reached it, and at
 * least one consuming test suite (`EliteDraftBoard.a11y.spec.tsx`) mocks
 * `tamagui` without `useThemeName`, which that hook chain needs. `$token`
 * props don't call any hook, so they can't hit that gap.
 *
 * Dismissal (Esc, backdrop tap, close button) is implemented directly rather
 * than delegated to Tamagui's `Dialog`/`Sheet` primitives, mirroring
 * `DraftPickSheet`'s own explicit close control — the web jest setup mocks
 * those primitives as passthrough divs that drop `onPress` and swallow
 * keyboard handling, which would leave two of the three dismissal paths
 * untestable at the unit level (see `DraftPickSheet.spec.tsx`'s note on this).
 */
import React, { useEffect } from 'react';
import { Text, XStack, YStack } from 'tamagui';

import type { PickInspectorData } from './draftPickInspector';
import { handleKeyActivate } from '../../utils/keyboardActivation';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { BLACK, withAlpha } from '../../utils/colors';

const MIN_TOUCH = 44;

export interface DraftPickInspectorProps {
  /** `null` renders nothing — the inspector is closed. */
  data: PickInspectorData | null;
  onClose: () => void;
  /** Overrides the root `testID`, so multiple boards on one screen (unlikely,
   *  but matches `DraftPickSheet`'s convention) stay separately targetable. */
  testID?: string;
}

export function DraftPickInspector({
  data,
  onClose,
  testID = 'draft-pick-inspector',
}: DraftPickInspectorProps): React.JSX.Element | null {
  const reducedMotion = useReducedMotion();
  const animation = reducedMotion ? '100ms' : 'medium';

  // Esc closes from anywhere while open, matching the design's own
  // `document.addEventListener('keydown', ...)` — a document-level listener
  // rather than a focus-scoped one because the popup here has no native
  // focus trap to route the key through (unlike Tamagui's Dialog).
  useEffect(() => {
    if (data === null) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [data, onClose]);

  if (data === null) return null;

  return (
    <YStack
      testID={`${testID}-overlay`}
      position="fixed"
      top={0}
      left={0}
      right={0}
      bottom={0}
      zIndex={100}
      alignItems="center"
      justifyContent="center"
      padding={24}
      backgroundColor={withAlpha(BLACK, 0.7)}
      animation={animation}
      enterStyle={{ opacity: 0 }}
      exitStyle={{ opacity: 0 }}
      onPress={onClose}
      role="presentation"
    >
      <YStack
        testID={testID}
        role="dialog"
        aria-modal
        aria-label={data.title}
        accessibilityRole="alert"
        accessibilityLabel={data.title}
        width="100%"
        maxWidth={380}
        padding={22}
        borderRadius={14}
        borderWidth={1}
        borderColor="$brandGold"
        backgroundColor="$surfacePanel"
        animation={animation}
        enterStyle={{ opacity: 0, scale: 0.96, y: 8 }}
        exitStyle={{ opacity: 0, scale: 0.96, y: 8 }}
        // Stop a tap on the card itself from bubbling to the overlay and
        // closing the popup it was meant to interact with.
        onPress={(e: { stopPropagation?: () => void }) => e.stopPropagation?.()}
      >
        <XStack justifyContent="flex-end">
          <YStack
            testID={`${testID}-close`}
            minWidth={MIN_TOUCH}
            minHeight={MIN_TOUCH}
            marginTop={-14}
            marginRight={-14}
            marginBottom={-6}
            alignItems="center"
            justifyContent="center"
            onPress={onClose}
            pressStyle={{ opacity: 0.7 }}
            cursor="pointer"
            role="button"
            accessibilityRole="button"
            tabIndex={0}
            onKeyDown={handleKeyActivate(onClose)}
            aria-label="Close"
            accessibilityLabel="Close"
          >
            <Text fontSize={20} lineHeight={20} color="$textMuted">
              ✕
            </Text>
          </YStack>
        </XStack>

        <Text
          fontFamily="$heading"
          fontWeight="700"
          fontSize={11}
          letterSpacing={1.4}
          textTransform="uppercase"
          color="$brandGoldLight"
        >
          {data.eyebrow}
        </Text>
        <Text
          testID={`${testID}-title`}
          fontFamily="$heading"
          fontWeight="800"
          fontSize={24}
          marginTop={5}
          color="$color12"
        >
          {data.title}
        </Text>
        {data.meta && (
          <Text fontSize={12} marginTop={2} color="$textMuted">
            {data.meta}
          </Text>
        )}

        {data.rows.length > 0 && (
          <YStack
            testID={`${testID}-rows`}
            marginTop={16}
            borderRadius={10}
            borderWidth={1}
            borderColor="$outlineStrong"
            overflow="hidden"
          >
            {data.rows.map((row, index) => (
              <XStack
                key={row.label}
                paddingHorizontal={12}
                paddingVertical={9}
                gap={12}
                backgroundColor="$surfacePanel"
                borderTopWidth={index === 0 ? 0 : 1}
                borderTopColor="$outlineStrong"
              >
                <Text
                  width={84}
                  fontFamily="$heading"
                  fontWeight="700"
                  fontSize={10}
                  letterSpacing={0.6}
                  textTransform="uppercase"
                  color="$textMuted"
                >
                  {row.label}
                </Text>
                <Text fontSize={13} color="$color12">
                  {row.value}
                </Text>
              </XStack>
            ))}
          </YStack>
        )}

        {data.empty && (
          <Text
            testID={`${testID}-empty`}
            marginTop={14}
            fontStyle="italic"
            fontSize={13}
            color="$textMuted"
          >
            {data.empty}
          </Text>
        )}
      </YStack>
    </YStack>
  );
}

export default DraftPickInspector;
