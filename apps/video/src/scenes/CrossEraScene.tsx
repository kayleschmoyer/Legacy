import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { PlayerCard, PlayerData } from '../components/PlayerCard';
import {
  BG_DARK,
  BRAND_GOLD,
  BRAND_NAVY,
  FONT_DISPLAY,
  FONT_BODY,
  PANEL_BORDER,
  TEXT_MUTED,
  TEXT_PRIMARY,
} from '../theme';

const PLAYERS: PlayerData[] = [
  {
    name: 'Babe Ruth',
    year: 1927,
    team: 'NYY',
    position: 'OF',
    stats: [
      { label: 'HR', value: '60' },
      { label: 'RBI', value: '164' },
      { label: 'AVG', value: '.356' },
    ],
    highlight: true,
  },
  {
    name: 'Mickey Mantle',
    year: 1956,
    team: 'NYY',
    position: 'CF',
    stats: [
      { label: 'HR', value: '52' },
      { label: 'RBI', value: '130' },
      { label: 'AVG', value: '.353' },
    ],
    highlight: false,
  },
  {
    name: 'Barry Bonds',
    year: 2001,
    team: 'SF',
    position: 'LF',
    stats: [
      { label: 'HR', value: '73' },
      { label: 'RBI', value: '137' },
      { label: 'OBP', value: '.515' },
    ],
    highlight: false,
  },
  {
    name: 'Mike Trout',
    year: 2019,
    team: 'LAA',
    position: 'CF',
    stats: [
      { label: 'HR', value: '45' },
      { label: 'RBI', value: '104' },
      { label: 'AVG', value: '.291' },
    ],
    highlight: false,
  },
];

// Timeline dots
const ERA_MARKERS = [
  { year: '1920s', label: 'Dead Ball Era Ends', pos: 8 },
  { year: '1950s', label: 'Golden Age', pos: 28 },
  { year: '1990s', label: 'Power Era', pos: 60 },
  { year: '2010s', label: 'Analytics Era', pos: 82 },
  { year: 'Today', label: 'Modern Game', pos: 98 },
];

export const CrossEraScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const sceneIn = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const exitOpacity = interpolate(frame, [210, 240], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Header
  const headerY = spring({
    frame,
    fps,
    from: -30,
    to: 0,
    config: { damping: 30, stiffness: 200 },
  });

  // Timeline line width
  const timelineWidth = interpolate(frame, [15, 80], [0, 100], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        background: BG_DARK,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 120px',
        opacity: sceneIn * exitOpacity,
        gap: 48,
      }}
    >
      {/* Header */}
      <div
        style={{ transform: `translateY(${headerY}px)`, textAlign: 'center' }}
      >
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 700,
            fontSize: 16,
            color: BRAND_GOLD,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            marginBottom: 12,
          }}
        >
          Cross-Era Drafting
        </div>
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 800,
            fontSize: 68,
            color: TEXT_PRIMARY,
            letterSpacing: '0.01em',
            textTransform: 'uppercase',
            lineHeight: 1,
          }}
        >
          DRAFT LEGENDS FROM <span style={{ color: BRAND_GOLD }}>ANY ERA</span>
        </div>
      </div>

      {/* Player cards row */}
      <div
        style={{
          display: 'flex',
          gap: 28,
          alignItems: 'stretch',
          justifyContent: 'center',
        }}
      >
        {PLAYERS.map((player, i) => {
          const cardDelay = 20 + i * 14;
          const cardY = spring({
            frame: frame - cardDelay,
            fps,
            from: 80,
            to: 0,
            config: { damping: 26, stiffness: 180 },
          });
          const cardOpacity = interpolate(
            frame,
            [cardDelay, cardDelay + 15],
            [0, 1],
            {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            },
          );

          return (
            <div
              key={player.name}
              style={{
                transform: `translateY(${cardY}px)`,
                opacity: cardOpacity,
              }}
            >
              <PlayerCard player={player} />
            </div>
          );
        })}
      </div>

      {/* Timeline */}
      <div style={{ width: '100%', maxWidth: 1400 }}>
        {/* Line */}
        <div
          style={{
            position: 'relative',
            height: 2,
            background: PANEL_BORDER,
            marginBottom: 16,
          }}
        >
          {/* Filled progress */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              height: '100%',
              width: `${timelineWidth}%`,
              background: `linear-gradient(90deg, ${BRAND_NAVY}, ${BRAND_GOLD})`,
            }}
          />

          {/* Era markers */}
          {ERA_MARKERS.map((m) => {
            const markerOpacity = interpolate(
              frame,
              [15 + (m.pos / 100) * 65, 30 + (m.pos / 100) * 65],
              [0, 1],
              { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
            );
            return (
              <div
                key={m.year}
                style={{
                  position: 'absolute',
                  top: -5,
                  left: `${m.pos}%`,
                  transform: 'translateX(-50%)',
                  opacity: markerOpacity,
                }}
              >
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    background:
                      m.pos <= timelineWidth ? BRAND_GOLD : PANEL_BORDER,
                    border: `2px solid ${BG_DARK}`,
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* Year labels */}
        <div style={{ position: 'relative', height: 40 }}>
          {ERA_MARKERS.map((m) => {
            const labelOpacity = interpolate(
              frame,
              [20 + (m.pos / 100) * 65, 38 + (m.pos / 100) * 65],
              [0, 1],
              { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
            );
            return (
              <div
                key={m.year}
                style={{
                  position: 'absolute',
                  left: `${m.pos}%`,
                  transform: 'translateX(-50%)',
                  textAlign: 'center',
                  opacity: labelOpacity,
                }}
              >
                <div
                  style={{
                    fontFamily: FONT_DISPLAY,
                    fontWeight: 700,
                    fontSize: 14,
                    color: m.pos <= timelineWidth ? BRAND_GOLD : TEXT_MUTED,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                  }}
                >
                  {m.year}
                </div>
                <div
                  style={{
                    fontFamily: FONT_BODY,
                    fontSize: 11,
                    color: TEXT_MUTED,
                    marginTop: 2,
                    opacity: 0.7,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {m.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footnote */}
      <div
        style={{
          opacity: interpolate(frame, [100, 130], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
          fontFamily: FONT_BODY,
          fontSize: 22,
          color: TEXT_MUTED,
          fontStyle: 'italic',
          textAlign: 'center',
        }}
      >
        Every player is assigned their actual statistics from their best seasons
        — not projections, not averages. Real history.
      </div>
    </AbsoluteFill>
  );
};
