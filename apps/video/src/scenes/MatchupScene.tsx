import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {
  BG_DARK,
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  FONT_BODY,
  FONT_DISPLAY,
  FONT_MONO,
  GREEN,
  OUTLINE_SUBTLE,
  PANEL_BORDER,
  POS_INFIELD,
  POS_OUTFIELD,
  POS_PITCHER,
  POS_CATCHER,
  SURFACE_CARD,
  SURFACE_PANEL,
  SURFACE_SUBTLE,
  TEXT_MUTED,
  TEXT_PRIMARY,
} from '../theme';

const HOME_TEAM = {
  name: 'The Ruthless Yankees',
  record: '6-2',
  players: [
    {
      name: 'Babe Ruth',
      year: 1927,
      pos: 'OF',
      pts: 38.5,
      gp: 3,
      pos_color: POS_OUTFIELD,
    },
    {
      name: 'Lou Gehrig',
      year: 1936,
      pos: '1B',
      pts: 29.0,
      gp: 3,
      pos_color: POS_INFIELD,
    },
    {
      name: 'Walter Johnson',
      year: 1913,
      pos: 'SP',
      pts: 22.5,
      gp: 1,
      pos_color: POS_PITCHER,
    },
    {
      name: 'Mickey Mantle',
      year: 1956,
      pos: 'CF',
      pts: 18.0,
      gp: 2,
      pos_color: POS_OUTFIELD,
    },
    {
      name: 'Johnny Bench',
      year: 1972,
      pos: 'C',
      pts: 14.5,
      gp: 3,
      pos_color: POS_CATCHER,
    },
  ],
  total: 122.5,
};

const AWAY_TEAM = {
  name: 'Brooklyn Bruisers',
  record: '5-3',
  players: [
    {
      name: 'Hank Aaron',
      year: 1959,
      pos: 'OF',
      pts: 31.0,
      gp: 3,
      pos_color: POS_OUTFIELD,
    },
    {
      name: 'Willie Mays',
      year: 1954,
      pos: 'CF',
      pts: 27.5,
      gp: 3,
      pos_color: POS_OUTFIELD,
    },
    {
      name: 'Sandy Koufax',
      year: 1963,
      pos: 'SP',
      pts: 19.0,
      gp: 1,
      pos_color: POS_PITCHER,
    },
    {
      name: 'Mike Schmidt',
      year: 1980,
      pos: '3B',
      pts: 16.5,
      gp: 2,
      pos_color: POS_INFIELD,
    },
    {
      name: 'Roy Campanella',
      year: 1953,
      pos: 'C',
      pts: 11.0,
      gp: 3,
      pos_color: POS_CATCHER,
    },
  ],
  total: 105.0,
};

const ScoreboardCard: React.FC<{ frame: number; fps: number }> = ({
  frame,
}) => {
  const cardOpacity = interpolate(frame, [0, 18], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const homeScore = interpolate(frame, [15, 75], [0, HOME_TEAM.total], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const awayScore = interpolate(frame, [15, 75], [0, AWAY_TEAM.total], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const gamesCompleted = Math.floor(
    interpolate(frame, [0, 200], [0, 4], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }),
  );

  return (
    <div
      style={{
        background: SURFACE_PANEL,
        border: `1px solid ${PANEL_BORDER}`,
        borderRadius: 14,
        overflow: 'hidden',
        opacity: cardOpacity,
        flexShrink: 0,
      }}
    >
      {/* Top bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '14px 28px',
          borderBottom: `1px solid ${PANEL_BORDER}`,
          background: SURFACE_SUBTLE,
        }}
      >
        {/* Swords icon */}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M3 3l10 10M13 3L3 13"
            stroke={BRAND_GOLD}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <circle cx="8" cy="8" r="1.5" fill={BRAND_GOLD} fillOpacity="0.6" />
        </svg>
        <span
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 700,
            fontSize: 14,
            color: BRAND_GOLD,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}
        >
          Week 7
        </span>
        <div style={{ width: 1, height: 16, background: PANEL_BORDER }} />
        <span
          style={{
            fontFamily: FONT_BODY,
            fontSize: 13,
            color: TEXT_MUTED,
          }}
        >
          {gamesCompleted} of 8 games completed
        </span>

        {/* IN PROGRESS badge */}
        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            background: GREEN + '1A',
            border: `1px solid ${GREEN}44`,
            borderRadius: 999,
            padding: '5px 14px',
          }}
        >
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: GREEN,
            }}
          />
          <span
            style={{
              fontFamily: FONT_DISPLAY,
              fontWeight: 700,
              fontSize: 12,
              color: GREEN,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}
          >
            In Progress
          </span>
        </div>
      </div>

      {/* Score panels */}
      <div style={{ display: 'flex' }}>
        {/* Home team — leading */}
        <div
          style={{
            flex: 1,
            padding: '24px 48px',
            textAlign: 'center',
            background: BRAND_NAVY + '22',
          }}
        >
          <div
            style={{
              fontFamily: FONT_DISPLAY,
              fontWeight: 700,
              fontSize: 18,
              color: BRAND_GOLD,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              marginBottom: 8,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {HOME_TEAM.name}
          </div>
          <div
            style={{
              fontFamily: FONT_DISPLAY,
              fontWeight: 800,
              fontSize: 56,
              color: BRAND_GOLD_LIGHT,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '-1px',
              lineHeight: 1,
            }}
          >
            {homeScore.toFixed(2)}
          </div>
          <div
            style={{
              fontFamily: FONT_BODY,
              fontSize: 13,
              color: BRAND_GOLD + 'AA',
              marginTop: 8,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            Leading · {HOME_TEAM.record}
          </div>
        </div>

        {/* VS divider */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 32px',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <div style={{ width: 1, height: 32, background: PANEL_BORDER }} />
            <span
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: 900,
                fontSize: 16,
                color: TEXT_MUTED,
                letterSpacing: '0.1em',
              }}
            >
              VS
            </span>
            <div style={{ width: 1, height: 32, background: PANEL_BORDER }} />
          </div>
        </div>

        {/* Away team */}
        <div
          style={{
            flex: 1,
            padding: '24px 48px',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontFamily: FONT_DISPLAY,
              fontWeight: 700,
              fontSize: 18,
              color: TEXT_MUTED,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              marginBottom: 8,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {AWAY_TEAM.name}
          </div>
          <div
            style={{
              fontFamily: FONT_DISPLAY,
              fontWeight: 800,
              fontSize: 56,
              color: TEXT_PRIMARY,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '-1px',
              lineHeight: 1,
            }}
          >
            {awayScore.toFixed(2)}
          </div>
          <div
            style={{
              fontFamily: FONT_BODY,
              fontSize: 13,
              color: TEXT_MUTED,
              marginTop: 8,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            {AWAY_TEAM.record}
          </div>
        </div>
      </div>
    </div>
  );
};

const TeamColumn: React.FC<{
  team: typeof HOME_TEAM;
  isHome: boolean;
  frame: number;
  fps: number;
  showAll: boolean;
}> = ({ team, isHome, frame, fps, showAll }) => {
  const slideX = spring({
    frame,
    fps,
    from: isHome ? -80 : 80,
    to: 0,
    config: { damping: 28, stiffness: 180 },
  });

  return (
    <div
      style={{
        flex: 1,
        transform: `translateX(${slideX}px)`,
        opacity: interpolate(frame, [0, 15], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        }),
      }}
    >
      {/* Team header */}
      <div
        style={{
          padding: '28px 32px',
          background: `linear-gradient(135deg, ${SURFACE_PANEL} 0%, ${isHome ? BRAND_NAVY + '44' : SURFACE_CARD} 100%)`,
          border: `1px solid ${isHome ? BRAND_GOLD + '44' : PANEL_BORDER}`,
          borderRadius: '14px 14px 0 0',
          borderBottom: `3px solid ${isHome ? BRAND_GOLD : PANEL_BORDER}`,
        }}
      >
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 800,
            fontSize: 26,
            color: TEXT_PRIMARY,
            textTransform: 'uppercase',
            letterSpacing: '0.02em',
            marginBottom: 6,
          }}
        >
          {team.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              fontFamily: FONT_BODY,
              fontSize: 15,
              color: TEXT_MUTED,
            }}
          >
            Record:{' '}
            <span style={{ color: TEXT_PRIMARY, fontWeight: 600 }}>
              {team.record}
            </span>
          </div>
        </div>
      </div>

      {/* Player rows */}
      <div
        style={{
          background: SURFACE_PANEL,
          border: `1px solid ${PANEL_BORDER}`,
          borderTop: 'none',
          borderRadius: '0 0 14px 14px',
          overflow: 'hidden',
        }}
      >
        {team.players.map((p, i) => {
          const rowDelay = 12 + i * 10;
          const rowOpacity = showAll
            ? interpolate(frame, [rowDelay, rowDelay + 12], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              })
            : 0;

          // Animated score counter
          const displayedPts = interpolate(
            frame,
            [rowDelay + 8, rowDelay + 35],
            [0, p.pts],
            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
          );

          return (
            <div
              key={p.name}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '14px 32px',
                borderBottom:
                  i < team.players.length - 1
                    ? `1px solid ${OUTLINE_SUBTLE}`
                    : 'none',
                gap: 14,
                opacity: rowOpacity,
              }}
            >
              {/* Position */}
              <div
                style={{
                  width: 40,
                  height: 28,
                  borderRadius: 5,
                  background: p.pos_color + '22',
                  border: `1px solid ${p.pos_color}44`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: FONT_DISPLAY,
                  fontWeight: 700,
                  fontSize: 12,
                  color: p.pos_color,
                  flexShrink: 0,
                }}
              >
                {p.pos}
              </div>

              {/* Name + year */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: FONT_DISPLAY,
                    fontWeight: 700,
                    fontSize: 18,
                    color: TEXT_PRIMARY,
                    textTransform: 'uppercase',
                    letterSpacing: '0.01em',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {p.name}
                </div>
                <div
                  style={{
                    fontFamily: FONT_BODY,
                    fontSize: 12,
                    color: TEXT_MUTED,
                  }}
                >
                  {p.year} · {p.gp} GP
                </div>
              </div>

              {/* Points */}
              <div
                style={{
                  fontFamily: FONT_MONO,
                  fontWeight: 700,
                  fontSize: 22,
                  color: isHome ? BRAND_GOLD : TEXT_PRIMARY,
                  fontVariantNumeric: 'tabular-nums',
                  textAlign: 'right',
                  minWidth: 64,
                }}
              >
                {displayedPts.toFixed(1)}
              </div>
            </div>
          );
        })}

        {/* Total row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '16px 32px',
            background: isHome ? BRAND_NAVY + '55' : SURFACE_CARD,
            borderTop: `2px solid ${isHome ? BRAND_GOLD + '55' : PANEL_BORDER}`,
            opacity: showAll
              ? interpolate(frame, [80, 95], [0, 1], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                })
              : 0,
          }}
        >
          <div
            style={{
              flex: 1,
              fontFamily: FONT_DISPLAY,
              fontWeight: 700,
              fontSize: 16,
              color: TEXT_MUTED,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
            }}
          >
            Total Points
          </div>
          <div
            style={{
              fontFamily: FONT_MONO,
              fontWeight: 700,
              fontSize: 32,
              color: isHome ? BRAND_GOLD : TEXT_PRIMARY,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {interpolate(frame, [80, 130], [0, team.total], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }).toFixed(1)}
          </div>
        </div>
      </div>
    </div>
  );
};

export const MatchupScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const sceneIn = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const exitOpacity = interpolate(frame, [270, 300], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const showAll = frame > 8;

  return (
    <AbsoluteFill
      style={{
        background: BG_DARK,
        display: 'flex',
        flexDirection: 'column',
        padding: '40px 80px',
        gap: 24,
        opacity: sceneIn * exitOpacity,
      }}
    >
      {/* Scoreboard — mirrors the real MatchupScoreboard component */}
      <ScoreboardCard frame={frame} fps={fps} />

      {/* Matchup columns */}
      <div
        style={{ flex: 1, display: 'flex', gap: 28, alignItems: 'flex-start' }}
      >
        <TeamColumn
          team={HOME_TEAM}
          isHome={true}
          frame={frame}
          fps={fps}
          showAll={showAll}
        />

        {/* VS divider */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            paddingTop: 80,
            gap: 8,
            flexShrink: 0,
            opacity: interpolate(frame, [15, 30], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
          }}
        >
          <div
            style={{
              fontFamily: FONT_DISPLAY,
              fontWeight: 800,
              fontSize: 24,
              color: TEXT_MUTED,
              letterSpacing: '0.1em',
            }}
          >
            VS
          </div>
          <div
            style={{
              width: 1,
              height: 40,
              background: PANEL_BORDER,
            }}
          />
        </div>

        <TeamColumn
          team={AWAY_TEAM}
          isHome={false}
          frame={frame}
          fps={fps}
          showAll={showAll}
        />
      </div>

      {/* Bottom: archived stats note */}
      <div
        style={{
          opacity: interpolate(frame, [150, 175], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 24px',
          background: SURFACE_PANEL,
          border: `1px solid ${PANEL_BORDER}`,
          borderRadius: 10,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <circle cx="9" cy="9" r="8" stroke={BRAND_GOLD} strokeWidth="1.5" />
          <path
            d="M9 5v5l3 2"
            stroke={BRAND_GOLD}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
        <div
          style={{
            fontFamily: FONT_BODY,
            fontSize: 16,
            color: TEXT_MUTED,
            fontStyle: 'italic',
          }}
        >
          All points are calculated from real, archived MLB box scores — every
          stat is final before the week begins.
        </div>
      </div>
    </AbsoluteFill>
  );
};
