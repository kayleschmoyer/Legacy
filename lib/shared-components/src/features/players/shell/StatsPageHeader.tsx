import React from 'react';
import { Text, XStack, YStack } from 'tamagui';
import {
  FG3,
  FG4,
  FONT_BODY,
  FONT_DISPLAY,
  FONT_MONO,
  OUTLINE_SUBTLE,
} from './tokens';
import { Platform } from '../../../platform-components';
import {
  BRAND_GOLD_LIGHT,
  SURFACE_SUBTLE,
  WHITE,
  withAlpha,
} from '../../../utils/colors';
import { csp } from '../crossPlatformStyle';

export interface StatsPageHeaderProps {
  /** Small uppercase kicker above the title (e.g. "Players · League Archive"). */
  eyebrow: string;
  title: string;
  description: string;
  /** Shareable query-string preview shown in the URL chip. */
  urlPreview: string;
  showActions?: boolean;
  /** Share/export action buttons rendered on the right when `showActions`. */
  actions?: React.ReactNode;
}

/**
 * Editorial stats-page hero: eyebrow kicker, large display title, descriptive
 * copy, a monospace URL preview chip, and an optional right-aligned actions
 * slot. Sport-neutral — copy is fully prop-driven so both MLB and NFL render the
 * same branded header. Replaces the plain-HTML `NflStatsHeader` duplicate that
 * previously lived in the web route.
 */
export function StatsPageHeader({
  eyebrow,
  title,
  description,
  urlPreview,
  showActions = true,
  actions,
}: StatsPageHeaderProps) {
  return (
    <YStack
      style={csp({
        maxWidth: 1280,
        width: '100%',
        padding: '32px 24px 0',
        margin: '0 auto',
      })}
    >
      <XStack
        justifyContent="space-between"
        alignItems="flex-start"
        gap="$6"
        flexWrap="wrap"
      >
        {/* Left: editorial copy */}
        <YStack gap="$2" style={csp({ flex: 1, minWidth: 240 })}>
          <Text
            style={csp({
              fontFamily: FONT_DISPLAY,
              fontWeight: '700',
              fontSize: 11,
              letterSpacing: 1.76,
              textTransform: 'uppercase',
              color: BRAND_GOLD_LIGHT,
            })}
          >
            {eyebrow}
          </Text>
          <Text
            tag="h1"
            style={csp({
              fontFamily: FONT_DISPLAY,
              fontWeight: '800',
              fontSize:
                Platform.OS === 'web'
                  ? ('clamp(40px, 4.4vw, 60px)' as unknown as number)
                  : 48,
              // String bypasses Tamagui's numeric→px conversion (lineHeight: 1 → "1px").
              // Native uses absolute px; 48 = fontSize * 1 ratio.
              // See .agents/skills/standards/references/tamagui-web-pitfalls.md
              lineHeight:
                Platform.OS === 'web' ? ('1' as unknown as number) : 48,
              // em is fluid on web's clamp() fontSize; native uses the 48px branch → -0.02 × 48.
              letterSpacing:
                Platform.OS === 'web'
                  ? ('-0.02em' as unknown as number)
                  : -0.96,
              color: WHITE,
              margin: 0,
            })}
          >
            {title}
          </Text>
          <Text
            style={csp({
              fontFamily: FONT_BODY,
              fontSize: 17,
              lineHeight:
                Platform.OS === 'web' ? ('1.55' as unknown as number) : 26,
              color: FG3,
              maxWidth: '64ch',
              margin: 0,
            })}
          >
            {description}
          </Text>
          {/* URL preview — shows the shareable query string */}
          <XStack
            alignItems="center"
            gap="$2"
            style={csp({
              marginTop: 14,
              padding: '8px 14px',
              background: withAlpha(SURFACE_SUBTLE, 0.6),
              border: `1px solid ${OUTLINE_SUBTLE}`,
              borderRadius: 8,
              maxWidth: '100%',
              overflow: 'hidden',
            })}
          >
            <Text
              style={csp({
                fontFamily: FONT_DISPLAY,
                fontWeight: '700',
                fontSize: 10,
                letterSpacing: 1.4,
                textTransform: 'uppercase',
                color: FG4,
                flexShrink: 0,
              })}
            >
              URL
            </Text>
            <Text
              style={csp({
                fontFamily: FONT_MONO,
                fontSize: 12,
                color: FG3,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0,
              })}
              numberOfLines={1}
            >
              {urlPreview}
            </Text>
          </XStack>
        </YStack>

        {/* Right: action buttons — only shown when showActions is true */}
        {showActions && actions}
      </XStack>
    </YStack>
  );
}
