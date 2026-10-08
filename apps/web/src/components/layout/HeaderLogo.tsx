import React from 'react';
import { Link } from 'react-router-dom';
import { Text, XStack } from 'tamagui';

const FONT_DISPLAY = "'Big Shoulders Display', system-ui, sans-serif";

interface HeaderLogoProps {
  /** Condensed state (scrolled): smaller mark, wordmark collapsed. */
  compact?: boolean;
  /**
   * Full document navigation instead of a client-side route change. Signed-out
   * headers need it: the auth guard decides between the sign-in landing and
   * the app from the URL on load, so a client-side hop to `/` would skip it
   * (LS-10767).
   */
  reloadDocument?: boolean;
}

/** Header logo + two-line wordmark linking home — shared by the signed-in and public headers. */
export function HeaderLogo({
  compact = false,
  reloadDocument = false,
}: HeaderLogoProps): React.JSX.Element {
  return (
    <Link
      to="/"
      reloadDocument={reloadDocument}
      aria-label="Legacy Sports home"
      style={{ textDecoration: 'none', flexShrink: 0 }}
    >
      <XStack alignItems="center" gap={0} cursor="pointer">
        <img
          src="/logo.png"
          alt="Legacy Sports"
          data-testid="header-logo"
          style={{
            height: compact ? 30 : 38,
            width: 'auto',
            display: 'block',
            transition: 'height 200ms ease',
          }}
        />
        {/* Always mounted (rather than conditionally rendered)
            and collapsed via width/opacity in the same 200ms
            window as the logo's height transition above — a
            hard mount/unmount here raced the logo's animation
            and produced a brief overlap right at the `compact`
            toggle. */}
        <div
          data-testid="brand-text"
          style={{
            display: 'flex',
            flexDirection: 'column',
            userSelect: 'none',
            lineHeight: 1,
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            marginLeft: compact ? 0 : 8,
            maxWidth: compact ? 0 : 140,
            opacity: compact ? 0 : 1,
            transition:
              'max-width 200ms ease, margin-left 200ms ease, opacity 150ms ease',
          }}
        >
          <Text
            color="$wordmarkGold"
            style={{
              fontFamily: FONT_DISPLAY,
              fontWeight: '800',
              fontSize: 14,
              letterSpacing: '0.04em',
              // Pixel value, not unitless: Tamagui's Text style
              // treats a bare `1` as 1px, which clipped the
              // wordmark to a 1px sliver (LS-10697).
              lineHeight: '14px',
            }}
          >
            LEGACY
          </Text>
          <Text
            color="$color12"
            style={{
              fontFamily: FONT_DISPLAY,
              fontWeight: '700',
              fontSize: 11,
              letterSpacing: '0.16em',
              lineHeight: '11px',
            }}
          >
            SPORTS
          </Text>
        </div>
      </XStack>
    </Link>
  );
}
