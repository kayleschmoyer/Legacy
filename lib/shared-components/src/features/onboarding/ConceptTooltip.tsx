import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import {
  readConceptTooltipSeen,
  writeConceptTooltipSeen,
} from './conceptTooltipSeen';
import { Popover } from '../../components/Popover';
import { BRAND_GOLD_LIGHT } from '../../utils/colors';

export interface ConceptTooltipProps {
  /** The text to highlight with the tooltip anchor */
  term: string;
  /** Tooltip explanation shown when the term is pressed/hovered/focused */
  explanation: string;
}

const TOOLTIP_WIDTH = 260;
/**
 * Grace period (ms) before the tooltip hides after the pointer leaves the
 * anchor or the card.  Bridges the gap between them so the pointer can travel
 * from the anchor onto the card (to select its text) without closing it.
 */
const HIDE_DELAY_MS = 150;
/**
 * A press landing this soon after hover/focus auto-opened the card is the same
 * gesture (mousedown focuses, then click fires; a tap focuses then presses) —
 * ignore its toggle-close so the card doesn't open and immediately shut.
 */
const PRESS_GRACE_MS = 400;

/**
 * Wraps a key term with a dashed underline and reveals an explanation card.
 * Used throughout the app to explain historical-stats concepts inline.
 *
 * One component for web and native: press/tap (or Enter/Space) toggles the
 * card; hover and focus also open it on web.  Positioning, collision flipping
 * and reposition-on-scroll/resize come from the shared Tamagui `Popover`, so
 * there are no document/window/portal APIs here (LS-10380).
 *
 * The card's "Got it" control persists a per-term seen flag; once set, hover
 * no longer opens the card, while press/focus/keyboard still do (LS-6886).
 */
export function ConceptTooltip({
  term,
  explanation,
}: ConceptTooltipProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(() => readConceptTooltipSeen(term));
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerOverCardRef = useRef(false);
  const autoOpenedAtRef = useRef(0);

  const cancelHide = useCallback(() => {
    if (hideTimerRef.current !== null) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    cancelHide();
    hideTimerRef.current = setTimeout(() => {
      hideTimerRef.current = null;
      setOpen(false);
    }, HIDE_DELAY_MS);
  }, [cancelHide]);

  useEffect(() => cancelHide, [cancelHide]);

  const show = () => {
    cancelHide();
    if (!open) autoOpenedAtRef.current = Date.now();
    setOpen(true);
  };

  /** Press/Popover-driven open state change (not hover, focus or keyboard). */
  const requestOpen = (next: boolean) => {
    if (!next && Date.now() - autoOpenedAtRef.current < PRESS_GRACE_MS) return;
    cancelHide();
    setOpen(next);
  };

  const acknowledge = () => {
    writeConceptTooltipSeen(term);
    setSeen(true);
    // The card unmounts under the pointer, so no hover-out will clear this.
    pointerOverCardRef.current = false;
    cancelHide();
    setOpen(false);
  };

  const tooltipId = `tooltip-${term.replace(/\s+/g, '-')}`;

  return (
    <Popover
      open={open}
      onOpenChange={requestOpen}
      placement="top"
      arrow
      contentProps={{
        id: tooltipId,
        role: 'tooltip',
        width: TOOLTIP_WIDTH,
        minWidth: TOOLTIP_WIDTH,
        paddingVertical: 10,
        paddingHorizontal: 14,
        // Interactive + selectable so the text can be copied/translated; the
        // hover handlers keep the card open while the pointer is on it.
        userSelect: 'text',
        cursor: 'text',
        onHoverIn: () => {
          pointerOverCardRef.current = true;
          cancelHide();
        },
        onHoverOut: () => {
          pointerOverCardRef.current = false;
          scheduleHide();
        },
      }}
      trigger={
        <Text
          role="button"
          tabIndex={0}
          aria-describedby={tooltipId}
          aria-expanded={open}
          color={BRAND_GOLD_LIGHT}
          fontWeight="600"
          cursor="help"
          borderBottomWidth={1.5}
          borderStyle="dashed"
          borderBottomColor={BRAND_GOLD_LIGHT}
          onPress={() => requestOpen(!open)}
          // Tamagui `Text` forwards `onHoverIn`/`onHoverOut` to the DOM
          // unmapped (React drops them), so hover uses the mouse events
          // directly. Hover only auto-opens until the term is acknowledged
          // (LS-6886).
          onMouseEnter={seen ? undefined : show}
          onMouseLeave={scheduleHide}
          onFocus={show}
          onBlur={() => {
            // Pressing the mouse on the card (to select its text) blurs a
            // focused anchor; keep the card open while the pointer is on it.
            if (pointerOverCardRef.current) return;
            cancelHide();
            setOpen(false);
          }}
          onKeyDown={(e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              cancelHide();
              setOpen((v) => !v);
            } else if (e.key === 'Escape' && open) {
              // WAI-ARIA tooltip pattern: Escape dismisses the tooltip
              // without moving focus off the anchor (LS-6888).
              cancelHide();
              setOpen(false);
            }
          }}
        >
          {term}
        </Text>
      }
    >
      <YStack>
        <XStack alignItems="center" gap="$2" marginBottom="$1">
          <Text
            fontSize="$2"
            fontWeight="700"
            color={BRAND_GOLD_LIGHT}
            textTransform="uppercase"
            letterSpacing={0.8}
          >
            {term}
          </Text>
        </XStack>
        <Text fontSize="$3" color="$colorPress" lineHeight={20}>
          {explanation}
        </Text>
        {!seen && (
          <Text
            role="button"
            tabIndex={0}
            alignSelf="flex-end"
            marginTop="$2"
            fontSize="$2"
            fontWeight="600"
            color="$colorPress"
            opacity={0.75}
            cursor="pointer"
            hoverStyle={{ opacity: 1 }}
            onPress={acknowledge}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                acknowledge();
              }
            }}
          >
            Got it
          </Text>
        )}
      </YStack>
    </Popover>
  );
}
