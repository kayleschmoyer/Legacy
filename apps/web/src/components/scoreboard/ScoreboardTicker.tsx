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
const SCROLL_DURATION_S = 40;

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

// ─── Sub-components ───────────────────────────────────────────────────────────

const TickerStrip = styled(XStack, {
  position: 'fixed' as never,
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

const TickerLabel = styled(Text, {
  fontSize: '$2',
  fontWeight: '700',
  color: '$color11',
  paddingHorizontal: '$3',
  letterSpacing: 1,
  flexShrink: 0,
});

const ScrollOuter = styled(XStack, {
  flex: 1,
  overflow: 'hidden',
  alignItems: 'center',
  height: TICKER_HEIGHT_PX,
} as never);

// ─── Game chip ────────────────────────────────────────────────────────────────

function gameStatusText(game: TickerGame): string {
  const { status, inning, inningHalf, outs, startTime } = game;
  if (status === 'Live') {
    const half = inningHalf ? `${inningHalf.charAt(0).toUpperCase()}.` : '';
    const inn = inning ?? '';
    const outsStr = outs !== null && outs !== undefined ? ` ${outs}O` : '';
    return `${half}${inn}${outsStr}`;
  }
  if (status === 'Final') return 'Final';
  return formatStartTime(startTime);
}

function GameChip({ game }: { game: TickerGame }) {
  const isLive = game.status === 'Live';
  const isFinal = game.status === 'Final';
  const isPreview = !isLive && !isFinal;

  const statusColor = isLive ? '$green10' : isFinal ? '$color10' : '$brandNavy';

  return (
    <Link to="/scoreboard" style={{ textDecoration: 'none', flexShrink: 0 }}>
      <XStack
        alignItems="center"
        gap="$2"
        paddingHorizontal="$3"
        paddingVertical="$1"
        marginHorizontal="$2"
        borderRadius="$3"
        hoverStyle={{ backgroundColor: '$color4' }}
        cursor="pointer"
        flexShrink={0}
      >
        {/* Away */}
        <Text fontSize="$2" fontWeight="600" color="$color12">
          {game.awayTeam.abbreviation}
        </Text>
        {!isPreview && (
          <Text fontSize="$2" fontWeight="700" color="$color12">
            {game.awayTeam.runs}
          </Text>
        )}

        {/* Divider */}
        <Text fontSize="$2" color="$color9">
          –
        </Text>

        {/* Home */}
        {!isPreview && (
          <Text fontSize="$2" fontWeight="700" color="$color12">
            {game.homeTeam.runs}
          </Text>
        )}
        <Text fontSize="$2" fontWeight="600" color="$color12">
          {game.homeTeam.abbreviation}
        </Text>

        {/* Status */}
        <Text fontSize="$1" color={statusColor} fontWeight="700">
          {gameStatusText(game)}
        </Text>
      </XStack>
    </Link>
  );
}

function Separator() {
  return (
    <Text fontSize="$2" color="$color7" flexShrink={0} paddingHorizontal="$1">
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

  // Inject keyframes once per document lifecycle (only needed for the animated
  // path; no-op when reduced motion is active since the animation is not used).
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
      @media (prefers-reduced-motion: reduce) {
        .scoreboard-ticker-inner {
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
        style={{ top: NAV_HEIGHT_PX } as React.CSSProperties}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        data-testid="scoreboard-ticker"
      >
        {/* "MLB" label */}
        <TickerLabel>MLB</TickerLabel>

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
                animation: `ticker-scroll ${SCROLL_DURATION_S}s linear infinite`,
                animationPlayState: paused ? 'paused' : 'running',
              }}
            >
              {/* Duplicate chips for seamless loop */}
              {chips}
              {games.map((game, idx) => (
                <React.Fragment key={`dup-${game.gamePk}`}>
                  <GameChip game={game} />
                  {idx < games.length - 1 && <Separator />}
                </React.Fragment>
              ))}
            </div>
          </ScrollOuter>
        )}
      </TickerStrip>
    </>
  );
}
