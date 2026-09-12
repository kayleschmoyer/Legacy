/**
 * DraftPickSheet — the phone tier's slide-up available-player sheet (LS-10002).
 *
 * The phone board (`DraftRoundBoard`, LS-10000) is the main view; the player
 * browser rides in a sheet raised from the gold CTA beneath it, so a pick never
 * leaves the round grid. This file owns only the host — the CTA that raises it
 * and the sheet chrome (grab bar, title, close control, scrim). The body is
 * whatever the caller passes, which on the phone board is `DraftPlayersTab`:
 * the design's own note is "The browser keeps its own vocabulary; only its page
 * margins change", so this re-hosts the existing browser instead of forking a
 * second one.
 *
 * Design source (`docs/design/B8P9BQz8s6NZ9Q-FqWI_yA/legacy-sports-draft-board/
 * project/`): `.mob-cta` / `.mob-picksheet` / `.ps-scrim` in
 * `DraftRoomMobile.html` and `styles/mobile.css`, wired by the picksheet block
 * in `scripts/draft.js`.
 *
 * Anchored to the viewport, bounded, internally scrollable: a floating layer
 * that sizes itself to its content lets its bottom controls fall off the fold
 * (LS-8501, and again LS-9900 on the DateTimePicker). Tamagui's modal `Sheet`
 * portals to the root and snaps to a fixed share of the viewport, so the frame
 * never grows with the list — the list scrolls inside it instead.
 */
import React from 'react';
import { Sheet, Text, XStack, YStack } from 'tamagui';

import { useDraftPalette } from './nativeDraftPalette';
import { formatPickClock } from './pickClock';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { handleKeyActivate } from '../../utils/keyboardActivation';
import { withAlpha } from '../../utils/colors';

/** The design's `.mob-picksheet { max-height: 84% }` — the board stays visible
 *  above it, so the viewer never loses the round they are picking into. */
export const PICK_SHEET_HEIGHT_PERCENT = 84;

/** Touch-target floor shared by the CTA and the close control. */
const MIN_TOUCH = 44;

// ---------------------------------------------------------------------------
// CTA
// ---------------------------------------------------------------------------

export interface DraftPickCtaProps {
  /** The viewer can act on the current pick (their turn, Control All Teams,
   *  or a real commissioner pick). Off the clock the CTA still opens the
   *  sheet — browsing and queueing need it — but reads as a secondary action. */
  canDraft: boolean;
  untimed: boolean;
  draftPaused: boolean;
  timeRemaining: number;
  pickTimeLimitSeconds: number;
  onPress: () => void;
}

export function draftPickCtaLabel({
  canDraft,
  untimed,
  draftPaused,
  timeRemaining,
  pickTimeLimitSeconds,
}: Omit<DraftPickCtaProps, 'onPress'>): string {
  if (!canDraft) return 'Browse players';
  if (untimed || draftPaused) return 'Pick a player';
  return `Pick a player · ${formatPickClock(Math.max(timeRemaining, 0), pickTimeLimitSeconds)} left`;
}

export function DraftPickCta(props: DraftPickCtaProps): React.JSX.Element {
  const { canDraft, onPress } = props;
  const palette = useDraftPalette();
  const label = draftPickCtaLabel(props);

  return (
    <YStack
      testID="draft-pick-cta"
      minHeight={46}
      alignItems="center"
      justifyContent="center"
      paddingHorizontal={14}
      borderRadius={9}
      borderWidth={1}
      borderColor={palette.gold.gold}
      backgroundColor={canDraft ? palette.gold.gold : 'transparent'}
      onPress={onPress}
      pressStyle={{ opacity: 0.85 }}
      cursor="pointer"
      role="button"
      accessibilityRole="button"
      tabIndex={0}
      onKeyDown={handleKeyActivate(onPress)}
      aria-label={label}
      accessibilityLabel={label}
      aria-haspopup="dialog"
    >
      <Text
        fontFamily="$heading"
        fontSize={14}
        fontWeight="800"
        letterSpacing={1.1}
        textTransform="uppercase"
        color={canDraft ? '$textOnAccent' : palette.gold.goldLight}
        numberOfLines={1}
      >
        {label}
      </Text>
    </YStack>
  );
}

// ---------------------------------------------------------------------------
// Sheet
// ---------------------------------------------------------------------------

export interface DraftPickSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** One-line context under the title, e.g. "Pick #42 · Round 4". */
  subtitle?: string;
  /** Bottom safe-area inset (LS-9444) — the sheet covers the bottom nav, so it
   *  reserves the system navigation bar itself. */
  bottomInset?: number;
  children: React.ReactNode;
}

export function DraftPickSheet({
  open,
  onOpenChange,
  subtitle,
  bottomInset = 0,
  children,
}: DraftPickSheetProps): React.JSX.Element {
  const palette = useDraftPalette();
  const reducedMotion = useReducedMotion();
  const animation = reducedMotion ? '100ms' : 'medium';
  const close = (): void => onOpenChange(false);

  return (
    <Sheet
      modal
      open={open}
      onOpenChange={onOpenChange}
      snapPointsMode="percent"
      snapPoints={[PICK_SHEET_HEIGHT_PERCENT]}
      dismissOnSnapToBottom
      dismissOnOverlayPress
      // The body is a FlatList: letting the frame's pan gesture compete with
      // the list's own scroll makes the list feel stuck on native. Scrim and
      // close control are the dismissal paths, as in the design.
      disableDrag
      moveOnKeyboardChange
      // Nothing of the browser stays mounted (or re-renders on every pick)
      // while the sheet is down; search/position state lives in
      // useDraftUIState, so it survives a close/re-open.
      unmountChildrenWhenHidden
      animation={animation}
    >
      <Sheet.Overlay
        testID="draft-pick-sheet-scrim"
        animation={animation}
        backgroundColor={palette.scrim}
        enterStyle={{ opacity: 0 }}
        exitStyle={{ opacity: 0 }}
      />
      <Sheet.Frame
        testID="draft-pick-sheet"
        role="dialog"
        aria-modal
        aria-label="Available players"
        accessibilityLabel="Available players"
        backgroundColor={palette.surface.surfaceSubtle}
        borderWidth={1}
        borderBottomWidth={0}
        borderColor={withAlpha(palette.gold.gold, 0.4)}
        borderTopLeftRadius={14}
        borderTopRightRadius={14}
        paddingTop={10}
        paddingBottom={Math.max(bottomInset, 0)}
      >
        <YStack
          width={42}
          height={4}
          borderRadius={2}
          alignSelf="center"
          marginBottom={10}
          backgroundColor={palette.surface.outlineStrong}
        />
        <XStack
          alignItems="flex-start"
          justifyContent="space-between"
          gap={10}
          paddingHorizontal={12}
        >
          <YStack flex={1} minWidth={0}>
            <Text
              fontFamily="$heading"
              fontSize={16}
              fontWeight="800"
              letterSpacing={0.6}
              textTransform="uppercase"
              color={palette.text.fg1}
            >
              Available players
            </Text>
            {subtitle ? (
              <Text
                testID="draft-pick-sheet-subtitle"
                marginTop={3}
                fontSize={10.5}
                color={palette.text.fg3}
                numberOfLines={1}
              >
                {subtitle}
              </Text>
            ) : null}
          </YStack>
          <YStack
            testID="draft-pick-sheet-close"
            minWidth={MIN_TOUCH}
            minHeight={MIN_TOUCH}
            marginTop={-10}
            marginRight={-8}
            alignItems="center"
            justifyContent="center"
            onPress={close}
            pressStyle={{ opacity: 0.7 }}
            cursor="pointer"
            role="button"
            accessibilityRole="button"
            tabIndex={0}
            onKeyDown={handleKeyActivate(close)}
            aria-label="Close available players"
            accessibilityLabel="Close available players"
          >
            <Text fontSize={19} lineHeight={19} color={palette.text.fg3}>
              ✕
            </Text>
          </YStack>
        </XStack>

        {/* The browser owns its page margins and its own scroll; the frame
            only bounds it. `minHeight={0}` lets the flex child shrink below
            its content height so the list scrolls instead of overflowing. */}
        <YStack flex={1} minHeight={0}>
          {children}
        </YStack>
      </Sheet.Frame>
    </Sheet>
  );
}

export default DraftPickSheet;
