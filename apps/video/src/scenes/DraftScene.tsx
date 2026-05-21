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
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED,
  BRAND_SEAM_RED_LIGHT,
  FONT_BODY,
  FONT_DISPLAY,
  FONT_MONO,
  GLASS_BORDER,
  OUTLINE_DEFAULT,
  OUTLINE_SUBTLE,
  PANEL_BORDER,
  POS_CATCHER,
  POS_INFIELD,
  POS_OUTFIELD,
  POS_PITCHER,
  POS_UTILITY,
  SURFACE_CARD,
  SURFACE_PANEL,
  TEXT_MUTED,
  TEXT_PRIMARY,
  TEXT_QUIETEST,
  TEXT_SECONDARY,
} from '../theme';

// Storyboard: Round 4 · Pick 41 — available player pool (top 8)
const AVAILABLE = [
  {
    pos: 'P',
    name: 'Pedro Martínez',
    sub: '2000 · Boston Red Sox',
    val: '98.4',
    posColor: POS_PITCHER,
  },
  {
    pos: 'OF',
    name: 'Ted Williams',
    sub: '1941 · Boston Red Sox',
    val: '96.2',
    posColor: POS_OUTFIELD,
  },
  {
    pos: 'SS',
    name: 'Honus Wagner',
    sub: '1908 · Pittsburgh Pirates',
    val: '94.7',
    posColor: POS_INFIELD,
  },
  {
    pos: 'C',
    name: 'Johnny Bench',
    sub: '1972 · Cincinnati Reds',
    val: '93.1',
    posColor: POS_CATCHER,
  },
  {
    pos: 'P',
    name: 'Sandy Koufax',
    sub: '1965 · LA Dodgers',
    val: '92.8',
    posColor: POS_PITCHER,
  },
  {
    pos: '2B',
    name: 'Joe Morgan',
    sub: '1976 · Cincinnati Reds',
    val: '91.3',
    posColor: POS_INFIELD,
  },
  {
    pos: 'CF',
    name: 'Willie Mays',
    sub: '1965 · SF Giants',
    val: '90.6',
    posColor: POS_OUTFIELD,
  },
  {
    pos: 'UT',
    name: 'Rickey Henderson',
    sub: "1990 · Oakland A's",
    val: '89.4',
    posColor: POS_UTILITY,
  },
];

// Storyboard: Recent picks (pick log, most recent first)
const PICK_LOG = [
  {
    pick: '4.40',
    pos: 'OF',
    posColor: POS_OUTFIELD,
    name: "Hank Aaron, '57",
    team: 'Bronx Bombers',
  },
  {
    pick: '4.39',
    pos: 'P',
    posColor: POS_PITCHER,
    name: "Greg Maddux, '95",
    team: 'Diamond Cutters',
  },
  {
    pick: '4.38',
    pos: '3B',
    posColor: POS_INFIELD,
    name: "Mike Schmidt, '80",
    team: 'Liberty Bells',
  },
  {
    pick: '4.37',
    pos: 'C',
    posColor: POS_CATCHER,
    name: "Yogi Berra, '54",
    team: 'River Avenue',
  },
  {
    pick: '4.36',
    pos: '1B',
    posColor: POS_INFIELD,
    name: "Lou Gehrig, '36",
    team: 'Iron Horsemen',
  },
];

const ACTIVE_TEAM = 'The Old Guard';

export const DraftScene: React.FC = () => {
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

  // Countdown timer ticks from 47 → 0
  const timerValue = Math.max(0, 47 - Math.floor(frame / 6));

  const gridOpacity = interpolate(frame, [12, 30], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const footerOpacity = interpolate(frame, [60, 80], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Rows animate in one by one
  function playerRowOpacity(i: number) {
    return interpolate(frame, [20 + i * 6, 35 + i * 6], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
  }

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
        padding: '60px 80px 90px',
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
          alignItems: 'center',
          marginBottom: 30,
          transform: `translateY(${headY}px)`,
        }}
      >
        <h2
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 800,
            fontSize: 64,
            color: TEXT_PRIMARY,
            margin: 0,
            letterSpacing: '-0.01em',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <span
            style={{
              color: BRAND_SEAM_RED_LIGHT,
              fontSize: 28,
              padding: '8px 14px',
              border: `1px solid ${BRAND_SEAM_RED}`,
              borderRadius: 9999,
              background: 'rgba(196,30,58,0.18)',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              verticalAlign: 'middle',
            }}
          >
            ▶ LIVE DRAFT
          </span>
          Round 4 · Pick 41
        </h2>

        {/* Timer card */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 22,
            padding: '14px 24px',
            borderRadius: 16,
            background: SURFACE_CARD,
            border: `1px solid ${BRAND_SEAM_RED}`,
            boxShadow:
              '0 0 0 1px rgba(196,30,58,0.45), 0 6px 20px rgba(196,30,58,0.3)',
          }}
        >
          <div>
            <div
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.16em',
                color: TEXT_MUTED,
                fontSize: 24,
              }}
            >
              On the clock
            </div>
            <div
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: 700,
                color: TEXT_PRIMARY,
                fontSize: 24,
                marginTop: 2,
              }}
            >
              {ACTIVE_TEAM}
            </div>
          </div>
          <div
            style={{
              fontFamily: FONT_DISPLAY,
              fontWeight: 800,
              fontSize: 56,
              color: BRAND_SEAM_RED_LIGHT,
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1,
              minWidth: 72,
              textAlign: 'right',
            }}
          >
            0:{timerValue.toString().padStart(2, '0')}
          </div>
        </div>
      </div>

      {/* Draft grid: player pool (1.7fr) | pick log (1fr) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.7fr 1fr',
          gap: 28,
          flex: 1,
          opacity: gridOpacity,
        }}
      >
        {/* Available player pool */}
        <div
          style={{
            background: SURFACE_PANEL,
            border: `1px solid ${PANEL_BORDER}`,
            borderRadius: 20,
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 18,
            }}
          >
            <div
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: 800,
                fontSize: 26,
                color: TEXT_SECONDARY,
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
              }}
            >
              Available · Top 8
            </div>
            {/* Position filters */}
            <div style={{ display: 'flex', gap: 8 }}>
              {['All', 'P', 'C', 'IF', 'OF'].map((f, i) => (
                <div
                  key={f}
                  style={{
                    fontFamily: FONT_DISPLAY,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.12em',
                    fontSize: 24,
                    padding: '10px 20px',
                    borderRadius: 9999,
                    border: `1px solid ${i === 0 ? BRAND_NAVY_LIGHT : OUTLINE_DEFAULT}`,
                    color: i === 0 ? TEXT_PRIMARY : TEXT_MUTED,
                    background: i === 0 ? BRAND_NAVY : 'transparent',
                  }}
                >
                  {f}
                </div>
              ))}
            </div>
          </div>

          {/* 2-column grid of player rows */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 14,
              flex: 1,
            }}
          >
            {AVAILABLE.map((p, i) => (
              <div
                key={p.name}
                style={{
                  background: SURFACE_CARD,
                  border: `1px solid ${GLASS_BORDER}`,
                  borderRadius: 12,
                  padding: '14px 18px',
                  display: 'grid',
                  gridTemplateColumns: '56px 1fr auto',
                  alignItems: 'center',
                  gap: 14,
                  position: 'relative',
                  overflow: 'hidden',
                  opacity: playerRowOpacity(i),
                }}
              >
                {/* Left accent */}
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: 4,
                    background: p.posColor,
                  }}
                />
                {/* Position tag */}
                <div
                  style={{
                    fontFamily: FONT_DISPLAY,
                    fontWeight: 800,
                    fontSize: 24,
                    color: '#fff',
                    background: p.posColor,
                    borderRadius: 6,
                    padding: '8px 0',
                    textAlign: 'center',
                    letterSpacing: '0.06em',
                  }}
                >
                  {p.pos}
                </div>
                <div>
                  <div
                    style={{
                      fontFamily: FONT_DISPLAY,
                      fontWeight: 700,
                      fontSize: 26,
                      color: TEXT_PRIMARY,
                      lineHeight: 1.1,
                    }}
                  >
                    {p.name}
                  </div>
                  <div
                    style={{
                      fontFamily: FONT_BODY,
                      fontSize: 24,
                      color: TEXT_MUTED,
                      marginTop: 4,
                    }}
                  >
                    {p.sub}
                  </div>
                </div>
                <div>
                  <div
                    style={{
                      fontFamily: FONT_DISPLAY,
                      fontWeight: 800,
                      fontSize: 26,
                      color: BRAND_GOLD,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {p.val}
                  </div>
                  <div
                    style={{
                      fontFamily: FONT_DISPLAY,
                      fontSize: 24,
                      letterSpacing: '0.18em',
                      color: TEXT_QUIETEST,
                      textTransform: 'uppercase',
                      display: 'block',
                    }}
                  >
                    VAL
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pick log */}
        <div
          style={{
            background: SURFACE_PANEL,
            border: `1px solid ${PANEL_BORDER}`,
            borderRadius: 20,
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              fontFamily: FONT_DISPLAY,
              fontWeight: 800,
              fontSize: 26,
              color: TEXT_SECONDARY,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              marginBottom: 16,
            }}
          >
            Recent Picks
          </div>

          {/* "On the clock" row */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '60px 40px 1fr',
              alignItems: 'center',
              gap: 14,
              padding: '12px 10px',
              background:
                'linear-gradient(90deg, rgba(196,30,58,0.18), transparent 80%)',
              borderRadius: 8,
              marginBottom: 4,
            }}
          >
            <div
              style={{
                fontFamily: FONT_MONO,
                fontSize: 24,
                color: BRAND_SEAM_RED_LIGHT,
              }}
            >
              4.41
            </div>
            <div
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: 800,
                fontSize: 24,
                textAlign: 'center',
                padding: '6px 0',
                borderRadius: 6,
                color: '#fff',
                background: BRAND_SEAM_RED,
              }}
            >
              —
            </div>
            <div>
              <div
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontWeight: 700,
                  fontSize: 26,
                  color: BRAND_SEAM_RED_LIGHT,
                }}
              >
                On the clock…
              </div>
              <div
                style={{
                  fontFamily: FONT_BODY,
                  fontSize: 24,
                  color: TEXT_MUTED,
                }}
              >
                {ACTIVE_TEAM}
              </div>
            </div>
          </div>

          {/* Past picks */}
          {PICK_LOG.map((pick, i) => {
            const pickOpacity = interpolate(
              frame,
              [18 + i * 8, 32 + i * 8],
              [0, 1],
              { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
            );
            return (
              <div
                key={pick.pick}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '60px 40px 1fr',
                  alignItems: 'center',
                  gap: 14,
                  padding: '12px 0',
                  borderBottom:
                    i < PICK_LOG.length - 1
                      ? `1px solid ${OUTLINE_SUBTLE}`
                      : 'none',
                  opacity: pickOpacity,
                }}
              >
                <div
                  style={{
                    fontFamily: FONT_MONO,
                    fontSize: 24,
                    color: TEXT_QUIETEST,
                  }}
                >
                  {pick.pick}
                </div>
                <div
                  style={{
                    fontFamily: FONT_DISPLAY,
                    fontWeight: 800,
                    fontSize: 24,
                    textAlign: 'center',
                    padding: '6px 0',
                    borderRadius: 6,
                    color: '#fff',
                    background: pick.posColor,
                  }}
                >
                  {pick.pos}
                </div>
                <div>
                  <div
                    style={{
                      fontFamily: FONT_DISPLAY,
                      fontWeight: 700,
                      fontSize: 26,
                      color: TEXT_PRIMARY,
                    }}
                  >
                    {pick.name}
                  </div>
                  <div
                    style={{
                      fontFamily: FONT_BODY,
                      fontSize: 24,
                      color: TEXT_MUTED,
                    }}
                  >
                    {pick.team}
                  </div>
                </div>
              </div>
            );
          })}
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
        Scene 05<span style={{ color: TEXT_QUIETEST }}>/</span>Live Draft
      </div>
      <div
        style={{
          position: 'absolute',
          right: 56,
          bottom: 40,
          fontFamily: FONT_MONO,
          color: TEXT_QUIETEST,
          fontSize: 24,
          letterSpacing: '0.08em',
          opacity: footerOpacity,
        }}
      >
        00:31 — 00:41
      </div>
    </AbsoluteFill>
  );
};
