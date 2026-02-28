import React, { useState } from 'react';
import { Paragraph, XStack, YStack } from '@legacy-sports/shared-components';
import {
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

/**
 * Wraps a key term with an underline and shows a tooltip card on hover/focus.
 * Used throughout the app to explain historical-stats concepts inline.
 */
export function ConceptTooltip({ term, explanation }: ConceptTooltipProps) {
  const [visible, setVisible] = useState(false);

  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <span
        role="button"
        tabIndex={0}
        aria-describedby={`tooltip-${term.replace(/\s+/g, '-')}`}
        style={{
          borderBottom: `1.5px dashed ${BRAND_GOLD_LIGHT}`,
          color: BRAND_GOLD_LIGHT,
          cursor: 'help',
          fontWeight: 600,
          display: 'inline',
        }}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') setVisible((v) => !v);
        }}
      >
        {term}
      </span>

      {visible && (
        <YStack
          id={`tooltip-${term.replace(/\s+/g, '-')}`}
          role="tooltip"
          style={{
            position: 'absolute',
            bottom: '130%',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9999,
            width: 260,
            background: `linear-gradient(135deg, #0D1526 0%, ${withAlpha(BRAND_NAVY_LIGHT, 0.95)} 100%)`,
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: `1px solid ${withAlpha(BRAND_GOLD, 0.35)}`,
            borderRadius: 10,
            padding: '10px 14px',
            pointerEvents: 'none',
            boxShadow: `0 8px 32px ${withAlpha('#000', 0.5)}`,
          }}
        >
          {/* Arrow */}
          <span
            style={{
              position: 'absolute',
              top: '100%',
              left: '50%',
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
        </YStack>
      )}
    </span>
  );
}
