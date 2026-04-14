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
  BRAND_SEAM_RED,
  FONT_BODY,
  FONT_DISPLAY,
  FONT_MONO,
  OUTLINE_SUBTLE,
  PANEL_BORDER,
  POS_CATCHER,
  POS_INFIELD,
  POS_OUTFIELD,
  POS_PITCHER,
  SURFACE_CARD,
  SURFACE_PANEL,
  SURFACE_SUBTLE,
  TEXT_MUTED,
  TEXT_PRIMARY,
} from '../theme';

// Draft picks that happen during the scene (one per ~40 frames)
const DRAFT_PICKS = [
  {
    team: 'The Ruthless Yankees',
    player: 'Babe Ruth',
    year: 1927,
    pos: 'OF',
    round: 1,
    pick: 1,
    pos_color: POS_OUTFIELD,
  },
  {
    team: 'Brooklyn Bruisers',
    player: 'Hank Aaron',
    year: 1959,
    pos: 'OF',
    round: 1,
    pick: 2,
    pos_color: POS_OUTFIELD,
  },
  {
    team: 'Chicago Lumber Co.',
    player: 'Walter Johnson',
    year: 1913,
    pos: 'SP',
    round: 1,
    pick: 3,
    pos_color: POS_PITCHER,
  },
  {
    team: "The Joltin' Joes",
    player: 'Ted Williams',
    year: 1941,
    pos: 'LF',
    round: 1,
    pick: 4,
    pos_color: POS_OUTFIELD,
  },
  {
    team: 'Steel City Stars',
    player: 'Mike Schmidt',
    year: 1980,
    pos: '3B',
    round: 1,
    pick: 5,
    pos_color: POS_INFIELD,
  },
  {
    team: 'Mudville Nine',
    player: 'Johnny Bench',
    year: 1972,
    pos: 'C',
    round: 1,
    pick: 6,
    pos_color: POS_CATCHER,
  },
];

const YOUR_TEAM = 'The Ruthless Yankees';

// Available players on the board (not yet drafted)
const AVAILABLE = [
  {
    name: 'Willie Mays',
    year: 1954,
    pos: 'CF',
    team: 'NYG',
    adp: 7,
    pos_color: POS_OUTFIELD,
  },
  {
    name: 'Lou Gehrig',
    year: 1936,
    pos: '1B',
    team: 'NYY',
    adp: 8,
    pos_color: POS_INFIELD,
  },
  {
    name: 'Sandy Koufax',
    year: 1963,
    pos: 'SP',
    team: 'LAD',
    adp: 9,
    pos_color: POS_PITCHER,
  },
  {
    name: 'Ty Cobb',
    year: 1911,
    pos: 'CF',
    team: 'DET',
    adp: 10,
    pos_color: POS_OUTFIELD,
  },
  {
    name: 'Cy Young',
    year: 1901,
    pos: 'SP',
    team: 'BOS',
    adp: 11,
    pos_color: POS_PITCHER,
  },
];

export const DraftScene: React.FC = () => {
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

  // Which picks have happened?
  const PICK_INTERVAL = 42;
  const picksVisible = Math.min(
    Math.floor(frame / PICK_INTERVAL) + 1,
    DRAFT_PICKS.length,
  );

  // Timer — counts down each pick
  const frameInCurrentPick = frame % PICK_INTERVAL;
  const timerValue = Math.round(
    interpolate(frameInCurrentPick, [0, PICK_INTERVAL], [90, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }),
  );

  // Active pick (the current one being made — highlighted)
  const activePick = Math.min(
    Math.floor(frame / PICK_INTERVAL),
    DRAFT_PICKS.length - 1,
  );

  // "ON THE CLOCK" pulse
  const pulseOpacity = interpolate(
    frameInCurrentPick % 20,
    [0, 10, 20],
    [0.6, 1, 0.6],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    },
  );

  return (
    <AbsoluteFill
      style={{
        background: BG_DARK,
        display: 'flex',
        flexDirection: 'column',
        opacity: sceneIn * exitOpacity,
      }}
    >
      {/* Top bar: draft status */}
      <div
        style={{
          height: 72,
          background: SURFACE_SUBTLE,
          borderBottom: `1px solid ${PANEL_BORDER}`,
          display: 'flex',
          alignItems: 'center',
          padding: '0 48px',
          gap: 32,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 800,
            fontSize: 22,
            color: BRAND_GOLD,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          Live Draft
        </div>
        <div style={{ width: 1, height: 32, background: PANEL_BORDER }} />
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 600,
            fontSize: 16,
            color: TEXT_MUTED,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          Round 1 · Pick {activePick + 1} of {DRAFT_PICKS.length}
        </div>

        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 24,
          }}
        >
          {/* On the clock indicator */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: BRAND_NAVY + '44',
              border: `1px solid ${BRAND_GOLD}44`,
              borderRadius: 8,
              padding: '8px 18px',
              opacity:
                DRAFT_PICKS[activePick]?.team === YOUR_TEAM
                  ? pulseOpacity
                  : 0.3,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: BRAND_GOLD,
              }}
            />
            <div
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: 700,
                fontSize: 14,
                color: BRAND_GOLD_LIGHT,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            >
              {DRAFT_PICKS[activePick]?.team === YOUR_TEAM
                ? 'YOUR PICK'
                : 'On the Clock'}
            </div>
          </div>

          {/* Timer */}
          <div
            style={{
              fontFamily: FONT_MONO,
              fontWeight: 700,
              fontSize: 36,
              color: timerValue < 15 ? BRAND_SEAM_RED : TEXT_PRIMARY,
              fontVariantNumeric: 'tabular-nums',
              minWidth: 60,
              textAlign: 'right',
            }}
          >
            {timerValue}s
          </div>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Draft log: left side */}
        <div
          style={{
            width: 440,
            background: SURFACE_PANEL,
            borderRight: `1px solid ${PANEL_BORDER}`,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              padding: '20px 28px',
              borderBottom: `1px solid ${PANEL_BORDER}`,
              fontFamily: FONT_DISPLAY,
              fontWeight: 600,
              fontSize: 13,
              color: TEXT_MUTED,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
            }}
          >
            Draft Board
          </div>

          <div
            style={{
              padding: '16px 0',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            {DRAFT_PICKS.slice(0, picksVisible).map((pick, i) => {
              const isYours = pick.team === YOUR_TEAM;
              const pickEntrance = spring({
                frame: frame - i * PICK_INTERVAL,
                fps,
                from: -20,
                to: 0,
                config: { damping: 30, stiffness: 280 },
              });
              const pickOpacity = interpolate(
                frame,
                [i * PICK_INTERVAL, i * PICK_INTERVAL + 12],
                [0, 1],
                {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                },
              );

              return (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    padding: '12px 28px',
                    background: isYours ? BRAND_NAVY + '44' : 'transparent',
                    borderLeft: `3px solid ${isYours ? BRAND_GOLD : 'transparent'}`,
                    transform: `translateX(${pickEntrance}px)`,
                    opacity: pickOpacity,
                  }}
                >
                  {/* Pick number */}
                  <div
                    style={{
                      fontFamily: FONT_MONO,
                      fontSize: 12,
                      color: TEXT_MUTED,
                      minWidth: 28,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {pick.pick}.
                  </div>

                  {/* Position badge */}
                  <div
                    style={{
                      width: 36,
                      height: 26,
                      borderRadius: 5,
                      background: pick.pos_color + '33',
                      border: `1px solid ${pick.pos_color}55`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: FONT_DISPLAY,
                      fontWeight: 700,
                      fontSize: 11,
                      color: pick.pos_color,
                      letterSpacing: '0.04em',
                      flexShrink: 0,
                    }}
                  >
                    {pick.pos}
                  </div>

                  {/* Name + year */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: FONT_DISPLAY,
                        fontWeight: 700,
                        fontSize: 18,
                        color: isYours ? TEXT_PRIMARY : TEXT_MUTED,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        textTransform: 'uppercase',
                        letterSpacing: '0.02em',
                      }}
                    >
                      {pick.player}
                    </div>
                    <div
                      style={{
                        fontFamily: FONT_BODY,
                        fontSize: 12,
                        color: TEXT_MUTED,
                        marginTop: 1,
                      }}
                    >
                      {pick.year} · {pick.team}
                    </div>
                  </div>

                  {isYours && (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path
                        d="M7 1l1.7 4.5H13l-3.6 2.6 1.4 4.4L7 10.1 3.2 12.5l1.4-4.4L1 5.5h4.3L7 1z"
                        fill={BRAND_GOLD}
                      />
                    </svg>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Player pool: right side */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '20px 32px',
              borderBottom: `1px solid ${PANEL_BORDER}`,
              display: 'flex',
              alignItems: 'center',
              gap: 20,
            }}
          >
            <div
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: 600,
                fontSize: 13,
                color: TEXT_MUTED,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
              }}
            >
              Available Players
            </div>
            <div
              style={{
                fontFamily: FONT_MONO,
                fontSize: 12,
                color: TEXT_MUTED,
                background: SURFACE_CARD,
                border: `1px solid ${PANEL_BORDER}`,
                borderRadius: 6,
                padding: '3px 10px',
              }}
            >
              2,847 players
            </div>
          </div>

          {/* Column headers */}
          <div
            style={{
              display: 'flex',
              padding: '10px 32px',
              borderBottom: `1px solid ${OUTLINE_SUBTLE}`,
            }}
          >
            {['#', 'Player', 'Year', 'Pos', 'Team', 'ADP'].map((col, i) => (
              <div
                key={col}
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontWeight: 600,
                  fontSize: 11,
                  color: TEXT_MUTED,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  flex: i === 1 ? 3 : 1,
                  textAlign: i > 2 ? 'center' : 'left',
                }}
              >
                {col}
              </div>
            ))}
          </div>

          {/* Player rows */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {AVAILABLE.map((p, i) => {
              const rowOpacity = interpolate(
                frame,
                [10 + i * 6, 25 + i * 6],
                [0, 1],
                {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                },
              );
              const isHighlighted = i === 0;

              return (
                <div
                  key={p.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '14px 32px',
                    borderBottom: `1px solid ${OUTLINE_SUBTLE}`,
                    background: isHighlighted
                      ? BRAND_NAVY + '22'
                      : 'transparent',
                    opacity: rowOpacity,
                  }}
                >
                  <div
                    style={{
                      flex: 1,
                      fontFamily: FONT_MONO,
                      fontSize: 13,
                      color: TEXT_MUTED,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {p.adp}
                  </div>
                  <div
                    style={{
                      flex: 3,
                      fontFamily: FONT_DISPLAY,
                      fontWeight: 700,
                      fontSize: 20,
                      color: TEXT_PRIMARY,
                      textTransform: 'uppercase',
                      letterSpacing: '0.01em',
                    }}
                  >
                    {p.name}
                  </div>
                  <div
                    style={{
                      flex: 1,
                      fontFamily: FONT_MONO,
                      fontSize: 13,
                      color: TEXT_MUTED,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {p.year}
                  </div>
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <span
                      style={{
                        fontFamily: FONT_DISPLAY,
                        fontWeight: 700,
                        fontSize: 13,
                        color: p.pos_color,
                        background: p.pos_color + '22',
                        borderRadius: 5,
                        padding: '3px 8px',
                        letterSpacing: '0.04em',
                      }}
                    >
                      {p.pos}
                    </span>
                  </div>
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <span
                      style={{
                        fontFamily: FONT_MONO,
                        fontSize: 12,
                        color: BRAND_GOLD,
                        background: BRAND_GOLD + '18',
                        borderRadius: 4,
                        padding: '2px 8px',
                      }}
                    >
                      {p.team}
                    </span>
                  </div>
                  <div
                    style={{
                      flex: 1,
                      textAlign: 'center',
                      fontFamily: FONT_MONO,
                      fontSize: 13,
                      color: TEXT_MUTED,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {p.adp}.0
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
