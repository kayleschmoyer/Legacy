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
  BRAND_NAVY,
  BRAND_SEAM_RED_DARK,
  FONT_BODY,
  FONT_DISPLAY,
  FONT_MONO,
  GLASS_BORDER,
  OUTLINE_SUBTLE,
  PANEL_BORDER,
  SURFACE_CARD,
  SURFACE_PANEL,
  TEXT_MUTED,
  TEXT_PRIMARY,
} from '../theme';

// Storyboard: Week 14 Matchup data
const TEAM_A = {
  initials: 'OG',
  name: 'The Old Guard',
  record: '9-4-0 · 1st place · East',
  score: '142.7',
  win: true,
  gradient: 'linear-gradient(135deg, #1B3A5C 0%, #C5A55A 100%)',
};
const TEAM_B = {
  initials: 'DC',
  name: 'Diamond Cutters',
  record: '8-5-0 · 2nd place · East',
  score: '128.3',
  win: false,
  gradient: `linear-gradient(135deg, ${BRAND_SEAM_RED_DARK} 0%, ${BRAND_NAVY} 100%)`,
};

const ROSTER_A = [
  { pos: 'C', name: 'Yogi Berra', year: "'54", score: '14.2', live: true },
  { pos: '1B', name: 'Lou Gehrig', year: "'36", score: '22.8', live: true },
  { pos: '2B', name: 'Joe Morgan', year: "'76", score: '11.4', live: false },
  { pos: 'SS', name: 'Honus Wagner', year: "'08", score: '18.6', live: true },
  { pos: '3B', name: 'Mike Schmidt', year: "'80", score: '15.0', live: false },
  { pos: 'OF', name: 'Babe Ruth', year: "'27", score: '28.4', live: true },
  { pos: 'OF', name: 'Hank Aaron', year: "'57", score: '19.7', live: false },
  { pos: 'P', name: 'Bob Gibson', year: "'68", score: '12.6', live: false },
];

const ROSTER_B = [
  { pos: 'C', name: 'Johnny Bench', year: "'72", score: '13.1', live: false },
  { pos: '1B', name: 'Albert Pujols', year: "'09", score: '21.4', live: true },
  { pos: '2B', name: 'Rogers Hornsby', year: "'24", score: '17.2', live: false },
  { pos: 'SS', name: 'Cal Ripken Jr.', year: "'91", score: '12.8', live: false },
  { pos: '3B', name: 'George Brett', year: "'80", score: '14.5', live: false },
  { pos: 'OF', name: 'Ted Williams', year: "'41", score: '23.6', live: true },
  { pos: 'OF', name: 'Mike Trout', year: "'19", score: '16.3', live: false },
  { pos: 'P', name: 'Pedro Martínez', year: "'00", score: '9.4', live: false },
];

const RosterRow: React.FC<{
  pos: string;
  name: string;
  year: string;
  score: string;
  live: boolean;
  index: number;
  last: boolean;
  frame: number;
}> = ({ pos, name, year, score, live, index, last, frame }) => {
  const rowOpacity = interpolate(frame, [20 + index * 5, 34 + index * 5], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '56px 1fr 80px',
        alignItems: 'center',
        padding: '7px 0',
        borderBottom: last ? 'none' : `1px solid ${OUTLINE_SUBTLE}`,
        gap: 14,
        opacity: rowOpacity,
      }}
    >
      <div
        style={{
          fontFamily: FONT_DISPLAY,
          fontWeight: 800,
          color: TEXT_MUTED,
          fontSize: 24,
          letterSpacing: '0.14em',
        }}
      >
        {pos}
      </div>
      <div
        style={{
          fontFamily: FONT_BODY,
          color: TEXT_PRIMARY,
          fontSize: 24,
        }}
      >
        {name}{' '}
        <i style={{ color: TEXT_MUTED }}>{year}</i>
      </div>
      <div
        style={{
          fontFamily: FONT_DISPLAY,
          fontWeight: 800,
          fontSize: 26,
          color: live ? BRAND_GOLD : TEXT_PRIMARY,
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {score}
      </div>
    </div>
  );
};

export const MatchupScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const sceneIn = interpolate(frame, [0, 18], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const exitOpacity = interpolate(frame, [270, 300], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const headY = spring({
    frame,
    fps,
    from: -30,
    to: 0,
    config: { damping: 30, stiffness: 200 },
  });

  const scoreboardOpacity = interpolate(frame, [8, 24], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const scoreboardY = spring({
    frame: frame - 8,
    fps,
    from: 30,
    to: 0,
    config: { damping: 28, stiffness: 200 },
  });

  const rostersOpacity = interpolate(frame, [20, 36], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const rostersY = spring({
    frame: frame - 20,
    fps,
    from: 30,
    to: 0,
    config: { damping: 28, stiffness: 200 },
  });

  const footerOpacity = interpolate(frame, [60, 80], [0, 1], {
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
        padding: '70px 100px 140px',
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

      {/* Header row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          marginBottom: 36,
          transform: `translateY(${headY}px)`,
        }}
      >
        <h2
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 800,
            fontSize: 72,
            color: TEXT_PRIMARY,
            margin: 0,
            letterSpacing: '-0.01em',
          }}
        >
          Week 14 Matchup
        </h2>
        <div
          style={{
            fontFamily: FONT_MONO,
            color: TEXT_MUTED,
            fontSize: 24,
          }}
        >
          Week 14 / 22 · Sep 8 — Sep 14
        </div>
      </div>

      {/* Scoreboard */}
      <div
        style={{
          background: SURFACE_CARD,
          border: `1px solid ${GLASS_BORDER}`,
          borderRadius: 24,
          padding: '44px 56px',
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center',
          marginBottom: 28,
          boxShadow: '0 4px 14px rgba(8,12,20,0.55)',
          opacity: scoreboardOpacity,
          transform: `translateY(${scoreboardY}px)`,
        }}
      >
        {/* Team A */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <div
            style={{
              width: 96,
              height: 96,
              borderRadius: 16,
              background: TEAM_A.gradient,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: FONT_DISPLAY,
              fontWeight: 800,
              fontSize: 36,
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.15)',
              flexShrink: 0,
            }}
          >
            {TEAM_A.initials}
          </div>
          <div>
            <div
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: 800,
                fontSize: 38,
                color: TEXT_PRIMARY,
                lineHeight: 1,
              }}
            >
              {TEAM_A.name}
            </div>
            <div
              style={{
                fontFamily: FONT_BODY,
                color: TEXT_MUTED,
                fontSize: 26,
                marginTop: 4,
              }}
            >
              {TEAM_A.record}
            </div>
          </div>
        </div>

        {/* Scores */}
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 26,
            padding: '0 30px',
          }}
        >
          <div
            style={{
              fontFamily: FONT_DISPLAY,
              fontWeight: 800,
              fontSize: 132,
              lineHeight: 1,
              color: BRAND_GOLD,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '-0.02em',
            }}
          >
            {TEAM_A.score}
          </div>
          <div
            style={{
              fontFamily: FONT_DISPLAY,
              color: '#6C80BA',
              fontSize: 64,
            }}
          >
            –
          </div>
          <div
            style={{
              fontFamily: FONT_DISPLAY,
              fontWeight: 800,
              fontSize: 132,
              lineHeight: 1,
              color: TEXT_PRIMARY,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '-0.02em',
            }}
          >
            {TEAM_B.score}
          </div>
        </div>

        {/* Team B */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 28,
            flexDirection: 'row-reverse',
          }}
        >
          <div
            style={{
              width: 96,
              height: 96,
              borderRadius: 16,
              background: TEAM_B.gradient,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: FONT_DISPLAY,
              fontWeight: 800,
              fontSize: 36,
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.15)',
              flexShrink: 0,
            }}
          >
            {TEAM_B.initials}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: 800,
                fontSize: 38,
                color: TEXT_PRIMARY,
                lineHeight: 1,
              }}
            >
              {TEAM_B.name}
            </div>
            <div
              style={{
                fontFamily: FONT_BODY,
                color: TEXT_MUTED,
                fontSize: 26,
                marginTop: 4,
              }}
            >
              {TEAM_B.record}
            </div>
          </div>
        </div>
      </div>

      {/* Roster comparison */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 24,
          flex: 1,
          opacity: rostersOpacity,
          transform: `translateY(${rostersY}px)`,
        }}
      >
        {/* Team A roster */}
        <div
          style={{
            background: SURFACE_PANEL,
            border: `1px solid ${PANEL_BORDER}`,
            borderRadius: 20,
            padding: '22px 24px',
          }}
        >
          <div
            style={{
              fontFamily: FONT_DISPLAY,
              fontWeight: 800,
              fontSize: 26,
              color: TEXT_MUTED,
              textTransform: 'uppercase',
              letterSpacing: '0.14em',
              marginBottom: 12,
            }}
          >
            {TEAM_A.name} · Starters
          </div>
          {ROSTER_A.map((row, i) => (
            <RosterRow
              key={row.name}
              {...row}
              index={i}
              last={i === ROSTER_A.length - 1}
              frame={frame}
            />
          ))}
        </div>

        {/* Team B roster */}
        <div
          style={{
            background: SURFACE_PANEL,
            border: `1px solid ${PANEL_BORDER}`,
            borderRadius: 20,
            padding: '22px 24px',
          }}
        >
          <div
            style={{
              fontFamily: FONT_DISPLAY,
              fontWeight: 800,
              fontSize: 26,
              color: TEXT_MUTED,
              textTransform: 'uppercase',
              letterSpacing: '0.14em',
              marginBottom: 12,
            }}
          >
            {TEAM_B.name} · Starters
          </div>
          {ROSTER_B.map((row, i) => (
            <RosterRow
              key={row.name}
              {...row}
              index={i}
              last={i === ROSTER_B.length - 1}
              frame={frame}
            />
          ))}
        </div>
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
        Scene 06<span style={{ color: '#6C80BA' }}>/</span>Weekly Matchup
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
        00:41 — 00:51
      </div>
    </AbsoluteFill>
  );
};
