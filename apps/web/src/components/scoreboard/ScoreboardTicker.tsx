import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { styled, Text, XStack } from 'tamagui';
import { useGetScoreboardQuery } from '../../api/db/graphql.generated';
import {
  NAV_HEIGHT_PX,
  TICKER_HEIGHT_PX,
  TICKER_Z_INDEX,
} from '../../constants/dimensions';

// ─── Constants ────────────────────────────────────────────────────────────────

const LIVE_POLL_MS = 15_000;
const BIG_SHOULDERS = "'Big Shoulders Display', system-ui, sans-serif";

/** Scale scroll speed with game count so 3 games and 15 games both feel natural. */
function scrollDurationSecs(gameCount: number): number {
  return Math.max(20, Math.min(80, gameCount * 5));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatStartTime(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface TickerGame {
  gamePk: number;
  status: string;
  startTime?: string | null;
  inning?: number | null;
  inningHalf?: string | null;
  outs?: number | null;
  homeTeam: { abbreviation: string; runs: number };
  awayTeam: { abbreviation: string; runs: number };
}

// ─── Styled components ────────────────────────────────────────────────────────

const TickerStrip = styled(XStack, {
  position: 'fixed' as never,
  top: NAV_HEIGHT_PX,
  left: 0,
  right: 0,
  height: TICKER_HEIGHT_PX,
  backgroundColor: '$color2',
  borderBottomWidth: 1,
  borderBottomColor: '$borderColor',
  overflow: 'hidden',
  alignItems: 'center',
  zIndex: TICKER_Z_INDEX,
} as never);

// Container that provides the right border separating the label from the scroll area
const TickerLabelContainer = styled(XStack, {
  paddingHorizontal: '$3',
  alignItems: 'center',
  alignSelf: 'stretch',
  flexShrink: 0,
  borderRightWidth: 1,
  borderRightColor: '$borderColor',
} as never);

const TickerLabel = styled(Text, {
  fontSize: '$2',
  fontWeight: '700',
  color: '$brandGold',
  letterSpacing: 2,
});

const ScrollOuter = styled(XStack, {
  flex: 1,
  overflow: 'hidden',
  alignItems: 'center',
  height: TICKER_HEIGHT_PX,
} as never);

// ─── Status text ──────────────────────────────────────────────────────────────

/**
 * Human-readable status string.
 * Live:    "TOP 7 · 2 OUT"
 * Final:   "FINAL"
 * Preview: "7:05 PM"
 */
function gameStatusText(game: TickerGame): string {
  const { status, inning, inningHalf, outs, startTime } = game;
  if (status === 'Live') {
    const half = inningHalf?.toLowerCase().startsWith('t')
      ? 'TOP'
      : inningHalf?.toLowerCase().startsWith('b')
        ? 'BOT'
        : null;
    const inn = inning != null ? String(inning) : null;
    const outsLabel = outs != null ? `${outs} OUT` : null;
    // Filter nulls so we never produce leading/double spaces
    return [half, inn, outsLabel ? `· ${outsLabel}` : null]
      .filter(Boolean)
      .join(' ');
  }
  if (status === 'Final') return 'FINAL';
  return formatStartTime(startTime);
}

// ─── Game chip ────────────────────────────────────────────────────────────────

function GameChip({ game }: { game: TickerGame }) {
  const isLive = game.status === 'Live';
  const isFinal = game.status === 'Final';
  const isPreview = !isLive && !isFinal;

  // Leading score gets heritage gold; trailing score gets muted; tied gets neutral.
  const awayLeading = !isPreview && game.awayTeam.runs > game.homeTeam.runs;
  const homeLeading = !isPreview && game.homeTeam.runs > game.awayTeam.runs;
  const awayScoreColor = awayLeading
    ? '$brandGold'
    : homeLeading
      ? '$color9'
      : '$color12';
  const homeScoreColor = homeLeading
    ? '$brandGold'
    : awayLeading
      ? '$color9'
      : '$color12';

  // Status: green pulse for live, muted for everything else
  const statusColor = isLive ? '$green8' : '$color10';
  const statusText = gameStatusText(game);

  const ariaLabel = isPreview
    ? `${game.awayTeam.abbreviation} at ${game.homeTeam.abbreviation}, ${statusText}`
    : `${game.awayTeam.abbreviation} ${game.awayTeam.runs}, ${game.homeTeam.abbreviation} ${game.homeTeam.runs} — ${statusText}`;

  return (
    <Link
      to="/scoreboard"
      style={{ textDecoration: 'none', flexShrink: 0 }}
      aria-label={ariaLabel}
    >
      <XStack
        alignItems="center"
        gap="$1"
        paddingHorizontal="$3"
        marginHorizontal="$1"
        borderRadius="$3"
        hoverStyle={{ backgroundColor: '$color4' }}
        cursor="pointer"
        flexShrink={0}
      >
        {/* Away team abbreviation */}
        <Text
          fontSize="$1"
          fontWeight="500"
          color="$color11"
          letterSpacing={0.5}
        >
          {game.awayTeam.abbreviation}
        </Text>

        {/* Away score — visually dominant */}
        {!isPreview && (
          <Text
            fontSize="$4"
            fontWeight="800"
            color={awayScoreColor}
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {game.awayTeam.runs}
          </Text>
        )}

        {/* Score divider */}
        <Text fontSize="$1" color="$color8" paddingHorizontal="$1">
          {isPreview ? 'vs' : '–'}
        </Text>

        {/* Home score — visually dominant */}
        {!isPreview && (
          <Text
            fontSize="$4"
            fontWeight="800"
            color={homeScoreColor}
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {game.homeTeam.runs}
          </Text>
        )}

        {/* Home team abbreviation */}
        <Text
          fontSize="$1"
          fontWeight="500"
          color="$color11"
          letterSpacing={0.5}
        >
          {game.homeTeam.abbreviation}
        </Text>

        {/* Status — includes pulsing dot for live games */}
        <XStack alignItems="center" gap="$1" marginLeft="$1">
          {isLive && (
            <Text
              className="scoreboard-ticker-live-dot"
              fontSize="$1"
              color="$green8"
            >
              ●
            </Text>
          )}
          <Text
            fontSize="$1"
            color={statusColor}
            fontWeight={isLive ? '700' : '400'}
            letterSpacing={isLive ? 0.5 : 0}
            fontFamily={isLive ? BIG_SHOULDERS : undefined}
          >
            {statusText}
          </Text>
        </XStack>
      </XStack>
    </Link>
  );
}

function Separator() {
  return (
    <Text
      fontSize="$2"
      color="$color8"
      fontWeight="500"
      flexShrink={0}
      paddingHorizontal="$1"
    >
      ·
    </Text>
  );
}

// ─── Ticker ───────────────────────────────────────────────────────────────────

/**
 * ScoreboardTicker — a horizontally auto-scrolling strip fixed just below the
 * nav bar showing today's MLB scores. Hidden when no games are returned.
 * Auto-polls every 15 seconds while any game is live.
 */
export function ScoreboardTicker() {
  const { data, startPolling, stopPolling } = useGetScoreboardQuery({
    fetchPolicy: 'cache-and-network',
  });

  const games: TickerGame[] = (data?.scoreboard?.games ?? []) as TickerGame[];
  const isAnyGameLive = games.some((g) => g.status === 'Live');

  // Detect reduced-motion preference once on mount (synchronous so there is no
  // flash of the animated layout before switching to the static one).
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (isAnyGameLive) {
      startPolling(LIVE_POLL_MS);
    } else {
      stopPolling();
    }
    return () => stopPolling();
  }, [isAnyGameLive, startPolling, stopPolling]);

  const [paused, setPaused] = useState(false);
  const innerRef = useRef<HTMLDivElement>(null);

  // Inject keyframes once per document lifecycle. No-op when reduced motion is
  // active since the animation class is not applied in that path.
  useEffect(() => {
    if (prefersReducedMotion) return;
    const styleId = 'scoreboard-ticker-keyframes';
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes ticker-scroll {
        0%   { transform: translateX(0); }
        100% { transform: translateX(-50%); }
      }
      @keyframes ticker-live-pulse {
        0%, 100% { opacity: 1; }
        50%       { opacity: 0.3; }
      }
      .scoreboard-ticker-live-dot {
        animation: ticker-live-pulse 1.5s ease-in-out infinite;
      }
      @media (prefers-reduced-motion: reduce) {
        .scoreboard-ticker-inner,
        .scoreboard-ticker-live-dot {
          animation: none !important;
        }
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.getElementById(styleId)?.remove();
    };
  }, [prefersReducedMotion]);

  // Don't render when no games — no ticker strip and no spacer
  if (games.length === 0) return null;

  const scrollDuration = scrollDurationSecs(games.length);

  const chips = games.map((game, idx) => (
    <React.Fragment key={game.gamePk}>
      <GameChip game={game} />
      {idx < games.length - 1 && <Separator />}
    </React.Fragment>
  ));

  return (
    <>
      {/*
       * Layout spacer — same height as the fixed ticker strip so page content
       * is not hidden behind it. Rendered only when games are present (i.e.
       * when the ticker itself renders), which means no blank strip on days
       * with no games.
       */}
      <div
        aria-hidden="true"
        style={{ height: TICKER_HEIGHT_PX, flexShrink: 0 }}
      />
      <TickerStrip
        role="region"
        aria-label="MLB Scores"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        data-testid="scoreboard-ticker"
      >
        {/* "MLB" identity label — Big Shoulders Display, heritage gold */}
        <TickerLabelContainer>
          <TickerLabel fontFamily={BIG_SHOULDERS}>MLB</TickerLabel>
        </TickerLabelContainer>

        {prefersReducedMotion ? (
          /*
           * Reduced-motion layout: static, horizontally scrollable strip so
           * every game is reachable without animation. No chip duplication.
           */
          <ScrollOuter style={{ overflowX: 'auto' } as React.CSSProperties}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                flexShrink: 0,
              }}
            >
              {chips}
            </div>
          </ScrollOuter>
        ) : (
          /*
           * Animated layout: chips are duplicated so the scroll loops
           * seamlessly. The outer container clips the content.
           * Duplicate chips are aria-hidden to avoid screen-reader repetition.
           */
          <ScrollOuter>
            <div
              ref={innerRef}
              className="scoreboard-ticker-inner"
              style={{
                display: 'flex',
                alignItems: 'center',
                flexShrink: 0,
                willChange: 'transform',
                animation: `ticker-scroll ${scrollDuration}s linear infinite`,
                animationPlayState: paused ? 'paused' : 'running',
              }}
            >
              {chips}
              <div aria-hidden="true" style={{ display: 'contents' }}>
                {games.map((game, idx) => (
                  <React.Fragment key={`dup-${game.gamePk}`}>
                    <GameChip game={game} />
                    {idx < games.length - 1 && <Separator />}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </ScrollOuter>
        )}
      </TickerStrip>
    </>
  );
}
