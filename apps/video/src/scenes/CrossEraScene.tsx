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
  FONT_DISPLAY,
  FONT_BODY,
  FONT_MONO,
  GLASS_BORDER,
  OUTLINE_SUBTLE,
  POS_INFIELD,
  POS_OUTFIELD,
  POS_PITCHER,
  POS_UTILITY,
  SURFACE_CARD,
  TEXT_MUTED,
  TEXT_PRIMARY,
} from '../theme';

interface PlayerCardData {
  year: number;
  name: string;
  team: string;
  position: string;
  accent: string;
  stats: { value: string; key: string }[];
}

const PLAYERS: PlayerCardData[] = [
  {
    year: 1927,
    name: 'Babe Ruth',
    team: 'New York Yankees',
    position: 'OF · Outfield',
    accent: POS_OUTFIELD,
    stats: [
      { value: '.356', key: 'AVG' },
      { value: '60', key: 'HR' },
      { value: '165', key: 'RBI' },
    ],
  },
  {
    year: 1968,
    name: 'Bob Gibson',
    team: 'St. Louis Cardinals',
    position: 'P · Pitcher',
    accent: POS_PITCHER,
    stats: [
      { value: '1.12', key: 'ERA' },
      { value: '22', key: 'W' },
      { value: '268', key: 'K' },
    ],
  },
  {
    year: 2001,
    name: 'Barry Bonds',
    team: 'San Francisco Giants',
    position: 'OF · Outfield',
    accent: POS_UTILITY,
    stats: [
      { value: '.328', key: 'AVG' },
      { value: '73', key: 'HR' },
      { value: '137', key: 'RBI' },
    ],
  },
  {
    year: 2019,
    name: 'Mike Trout',
    team: 'Los Angeles Angels',
    position: 'CF · Outfield',
    accent: POS_INFIELD,
    stats: [
      { value: '.291', key: 'AVG' },
      { value: '45', key: 'HR' },
      { value: '104', key: 'RBI' },
    ],
  },
];

const TIMELINE_TICKS = [
  { year: '1927', pos: 8, accent: POS_OUTFIELD },
  { year: '1968', pos: 35, accent: POS_PITCHER },
  { year: '2001', pos: 65, accent: POS_UTILITY },
  { year: '2019', pos: 92, accent: POS_INFIELD },
];

const EraPlayerCard: React.FC<{ player: PlayerCardData; frame: number; delay: number; fps: number }> = ({
  player,
  frame,
  delay,
  fps,
}) => {
  const cardY = spring({
    frame: frame - delay,
    fps,
    from: 60,
    to: 0,
    config: { damping: 26, stiffness: 180 },
  });
  const cardOpacity = interpolate(frame, [delay, delay + 15], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        transform: `translateY(${cardY}px)`,
        opacity: cardOpacity,
        background: SURFACE_CARD,
        border: `1px solid ${GLASS_BORDER}`,
        borderRadius: 20,
        padding: '28px 26px',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
        flex: 1,
      }}
    >
      {/* Left accent stripe */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 6,
          background: player.accent,
        }}
      />

      {/* Year */}
      <div
        style={{
          fontFamily: FONT_DISPLAY,
          fontWeight: 800,
          fontSize: 64,
          color: player.accent,
          lineHeight: 1,
          letterSpacing: '0.02em',
        }}
      >
        {player.year}
      </div>

      {/* Name */}
      <div
        style={{
          fontFamily: FONT_DISPLAY,
          fontWeight: 800,
          fontSize: 38,
          color: TEXT_PRIMARY,
          marginTop: 14,
          lineHeight: 1.05,
          letterSpacing: '-0.01em',
        }}
      >
        {player.name}
      </div>

      {/* Team */}
      <div
        style={{
          fontFamily: FONT_BODY,
          color: TEXT_MUTED,
          fontSize: 24,
          marginTop: 6,
        }}
      >
        {player.team}
      </div>

      {/* Position */}
      <div
        style={{
          marginTop: 18,
          fontFamily: FONT_DISPLAY,
          fontWeight: 700,
          fontSize: 24,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: player.accent,
        }}
      >
        {player.position}
      </div>

      {/* Stats */}
      <div
        style={{
          marginTop: 'auto',
          paddingTop: 22,
          borderTop: `1px solid ${OUTLINE_SUBTLE}`,
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        {player.stats.map((stat) => (
          <div
            key={stat.key}
            style={{ display: 'flex', flexDirection: 'column', gap: 2 }}
          >
            <div
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: 800,
                fontSize: 36,
                color: TEXT_PRIMARY,
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1,
              }}
            >
              {stat.value}
            </div>
            <div
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: 700,
                fontSize: 24,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: '#6C80BA',
              }}
            >
              {stat.key}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

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

  const headerY = spring({
    frame,
    fps,
    from: -30,
    to: 0,
    config: { damping: 30, stiffness: 200 },
  });

  const timelineWidth = interpolate(frame, [20, 90], [0, 100], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const footerOpacity = interpolate(frame, [80, 110], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        background: `
          radial-gradient(ellipse at 18% 0%, rgba(27,58,92,0.55) 0%, transparent 55%),
          radial-gradient(ellipse at 82% 8%, rgba(196,30,58,0.18) 0%, transparent 45%),
          radial-gradient(ellipse at 50% 100%, rgba(197,165,90,0.14) 0%, transparent 55%),
          ${BG_DARK}
        `,
        display: 'flex',
        flexDirection: 'column',
        padding: '90px 100px 140px',
        opacity: sceneIn * exitOpacity,
        overflow: 'hidden',
      }}
    >
      {/* Vignette */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse at 50% 50%, transparent 55%, rgba(0,0,0,0.45) 100%)',
          pointerEvents: 'none',
        }}
      />

      {/* Header row: title left, sub right */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          marginBottom: 56,
          transform: `translateY(${headerY}px)`,
        }}
      >
        <h2
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 800,
            fontSize: 92,
            lineHeight: 0.95,
            color: TEXT_PRIMARY,
            letterSpacing: '-0.02em',
            margin: 0,
          }}
        >
          Ruth in &apos;27.
          <br />
          <span style={{ color: BRAND_GOLD }}>Trout in &apos;19.</span>
          <br />
          Same lineup card.
        </h2>
        <p
          style={{
            fontFamily: FONT_BODY,
            color: TEXT_MUTED,
            fontSize: 26,
            maxWidth: 480,
            textAlign: 'right',
            margin: 0,
          }}
        >
          Pick from over{' '}
          <b style={{ color: TEXT_PRIMARY }}>50,000 player-seasons</b> — every
          name in the history of the game, scored on the numbers they actually
          posted.
        </p>
      </div>

      {/* Player cards grid */}
      <div
        style={{
          display: 'flex',
          gap: 28,
          flex: 1,
          alignItems: 'stretch',
        }}
      >
        {PLAYERS.map((player, i) => (
          <EraPlayerCard
            key={player.name}
            player={player}
            frame={frame}
            delay={20 + i * 14}
            fps={fps}
          />
        ))}
      </div>

      {/* Timeline */}
      <div
        style={{
          marginTop: 32,
          marginBottom: 24,
          position: 'relative',
          height: 80,
        }}
      >
        {/* Bar */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 28,
            height: 2,
            background: `linear-gradient(90deg, #C41E3A 0%, #2C4A7C 50%, #C5A55A 100%)`,
            borderRadius: 2,
            clipPath: `inset(0 ${100 - timelineWidth}% 0 0)`,
          }}
        />
        {/* Tick marks and year labels */}
        {TIMELINE_TICKS.map((tick) => {
          const tickOpacity = interpolate(
            frame,
            [15 + (tick.pos / 100) * 75, 30 + (tick.pos / 100) * 75],
            [0, 1],
            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
          );
          return (
            <React.Fragment key={tick.year}>
              <div
                style={{
                  position: 'absolute',
                  top: 18,
                  left: `${tick.pos}%`,
                  transform: 'translateX(-50%)',
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: SURFACE_CARD,
                  border: `3px solid ${tick.accent}`,
                  opacity: tickOpacity,
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  top: 48,
                  left: `${tick.pos}%`,
                  transform: 'translateX(-50%)',
                  fontFamily: FONT_MONO,
                  fontSize: 24,
                  color: TEXT_MUTED,
                  opacity: tickOpacity,
                  whiteSpace: 'nowrap',
                }}
              >
                {tick.year}
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* Scene chrome */}
      <div
        style={{
          position: 'absolute',
          left: 56,
          bottom: 40,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          color: TEXT_MUTED,
          fontFamily: FONT_DISPLAY,
          fontWeight: 700,
          letterSpacing: '0.18em',
          fontSize: 24,
          textTransform: 'uppercase',
          opacity: footerOpacity,
        }}
      >
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: BRAND_GOLD,
            boxShadow: `0 0 12px ${BRAND_GOLD}`,
          }}
        />
        Scene 03<span style={{ color: '#6C80BA' }}>/</span>Cross-Era
      </div>
      <div
        style={{
          position: 'absolute',
          right: 56,
          bottom: 40,
          fontFamily: "'Roboto Mono', monospace",
          color: '#6C80BA',
          fontSize: 24,
          letterSpacing: '0.08em',
          opacity: footerOpacity,
        }}
      >
        00:12 — 00:20
      </div>
    </AbsoluteFill>
  );
};
