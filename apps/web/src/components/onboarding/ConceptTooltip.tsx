import React, { useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { Paragraph, XStack, YStack } from '@legacy-sports/shared-components/ui';
import {
  BLACK,
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY_LIGHT,
  withAlpha,
} from '../../constants/colors';

interface ConceptTooltipProps {
  /** The text to highlight with the tooltip anchor */
  term: string;
  /** Tooltip explanation shown on hover */
  explanation: string;
  children?: React.ReactNode;
}

const TOOLTIP_WIDTH = 260;
/** Minimum gap (px) between tooltip edge and viewport edge */
const VIEWPORT_MARGIN = 12;
/** Gap (px) between the anchor's top edge and the bottom of the tooltip */
const TOOLTIP_GAP = 8;

interface TooltipPos {
  top: number;
  left: number;
  hOffset: number;
}

/**
 * Wraps a key term with an underline and shows a tooltip card on hover/focus.
 * Used throughout the app to explain historical-stats concepts inline.
 *
 * The tooltip is rendered via a React portal into document.body so that
 * overflow:hidden on ancestor containers (e.g. the OnboardingTutorial modal)
 * does not clip the card.  Fixed viewport coordinates are derived from
 * getBoundingClientRect() at the moment the tooltip becomes visible.
 */
export function ConceptTooltip({ term, explanation }: ConceptTooltipProps) {
  const [visible, setVisible] = useState(false);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<TooltipPos>({ top: 0, left: 0, hOffset: 0 });

  const computePos = () => {
    if (!anchorRef.current) return;

    const rect = anchorRef.current.getBoundingClientRect();
    const anchorCenterX = rect.left + rect.width / 2;
    const tooltipLeft = anchorCenterX - TOOLTIP_WIDTH / 2;
    const tooltipRight = anchorCenterX + TOOLTIP_WIDTH / 2;
    const viewportWidth = window.innerWidth;

    let hOffset = 0;
    if (tooltipLeft < VIEWPORT_MARGIN) {
      hOffset = VIEWPORT_MARGIN - tooltipLeft;
    } else if (tooltipRight > viewportWidth - VIEWPORT_MARGIN) {
      hOffset = viewportWidth - VIEWPORT_MARGIN - tooltipRight;
    }

    setPos({
      top: rect.top - TOOLTIP_GAP,
      left: anchorCenterX + hOffset,
      hOffset,
    });
  };

  const tooltipId = `tooltip-${term.replace(/\s+/g, '-')}`;

  return (
    <span
      ref={anchorRef}
      style={{ position: 'relative', display: 'inline-block' }}
    >
      <span
        role="button"
        tabIndex={0}
        aria-describedby={tooltipId}
        style={{
          borderBottom: `1.5px dashed ${BRAND_GOLD_LIGHT}`,
          color: BRAND_GOLD_LIGHT,
          cursor: 'help',
          fontWeight: 600,
          display: 'inline',
        }}
        onMouseEnter={() => {
          computePos();
          setVisible(true);
        }}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => {
          computePos();
          setVisible(true);
        }}
        onBlur={() => setVisible(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            if (!visible) computePos();
            setVisible((v) => !v);
          }
        }}
      >
        {term}
      </span>

      {visible &&
        typeof document !== 'undefined' &&
        ReactDOM.createPortal(
          <YStack
            id={tooltipId}
            role="tooltip"
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              transform: 'translate(-50%, -100%)',
              zIndex: 99999,
              width: TOOLTIP_WIDTH,
              background: `linear-gradient(135deg, #0D1526 0%, ${BRAND_NAVY_LIGHT} 100%)`,
              border: `1px solid ${withAlpha(BRAND_GOLD, 0.35)}`,
              borderRadius: 10,
              padding: '10px 14px',
              pointerEvents: 'none',
              boxShadow: `0 8px 32px ${withAlpha(BLACK, 0.5)}`,
            }}
          >
            {/* Arrow – counter-shift so it always points at the anchor */}
            <span
              style={{
                position: 'absolute',
                top: '100%',
                // `left: 50%` centres the arrow on the tooltip box.  Subtract
                // hOffset to move it back toward the anchor's centre.
                left: `calc(50% - ${pos.hOffset}px)`,
                transform: 'translateX(-50%)',
                width: 0,
                height: 0,
                borderLeft: '7px solid transparent',
                borderRight: '7px solid transparent',
                borderTop: `7px solid ${withAlpha(BRAND_GOLD, 0.35)}`,
              }}
            />
            <XStack alignItems="center" gap="$2" marginBottom="$1">
              <Paragraph
                fontSize="$2"
                fontWeight="700"
                color={BRAND_GOLD_LIGHT}
                textTransform="uppercase"
                letterSpacing={0.8}
              >
                {term}
              </Paragraph>
            </XStack>
            <Paragraph fontSize="$3" color="$colorPress" lineHeight={20}>
              {explanation}
            </Paragraph>
          </YStack>,
          document.body,
        )}
    </span>
  );
}
