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
  TEXT_QUIETEST,
  TEXT_SECONDARY,
  FONT_DISPLAY,
  FONT_BODY,
  FONT_MONO,
  OUTLINE_SUBTLE,
  SURFACE_PANEL,
  SURFACE_CARD,
  TEXT_MUTED,
  TEXT_PRIMARY,
} from '../theme';

const NORMAL_POINTS = [
  { text: 'Draft pool capped to active rosters', bold: 'active rosters' },
  { text: "Scoring depends on tonight's game", bold: "tonight's game" },
  { text: 'Injuries, rainouts, lineup changes', bold: null },
  { text: 'Off-season? League goes dark.', bold: 'League goes dark.' },
];

const LEGACY_POINTS = [
  {
    text: 'Draft any player, any era — 1876 → today',
    bold: 'any player, any era',
  },
  {
    text: 'Scored on real archived box scores',
    bold: 'real archived box scores',
  },
  { text: 'No live-game dependency, no rainouts', bold: null },
  { text: 'Play year-round, at your own pace', bold: 'year-round' },
];

export const DifferentiatorScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const sceneOpacity = interpolate(frame, [0, 18], [0, 1], {
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

  const leftX = spring({
    frame: frame - 10,
    fps,
    from: -120,
    to: 0,
    config: { damping: 28, stiffness: 160 },
  });

  const rightX = spring({
    frame: frame - 18,
    fps,
    from: 120,
    to: 0,
    config: { damping: 28, stiffness: 160 },
  });

  const vsOpacity = interpolate(frame, [20, 40], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  function renderPoints(points: typeof NORMAL_POINTS, isLegacy: boolean) {
    return points.map((p, i) => {
      const delay = isLegacy ? 22 + i * 8 : 15 + i * 8;
      const itemOpacity = interpolate(frame, [delay, delay + 15], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
      const itemX = isLegacy
        ? interpolate(frame, [delay, delay + 15], [20, 0], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          })
        : 0;

      const parts = p.bold ? p.text.split(p.bold) : [p.text];

      return (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 0,
            opacity: itemOpacity,
            transform: `translateX(${itemX}px)`,
            paddingLeft: 36,
            position: 'relative',
          }}
        >
          {/* bullet */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 14,
              width: 18,
              height: isLegacy ? 3 : 2,
              background: isLegacy ? BRAND_GOLD : TEXT_QUIETEST,
            }}
          />
          <div
            style={{
              fontFamily: FONT_BODY,
              fontSize: 28,
              lineHeight: 1.4,
              color: TEXT_SECONDARY,
            }}
          >
            {p.bold && parts.length === 2 ? (
              <>
                {parts[0]}
                <b
                  style={{
                    color: TEXT_PRIMARY,
                    fontWeight: 600,
                  }}
                >
                  {p.bold}
                </b>
                {parts[1]}
              </>
            ) : (
              p.text
            )}
          </div>
        </div>
      );
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
        padding: '100px',
        opacity: sceneOpacity * exitOpacity,
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

      {/* Header */}
      <div
        style={{
          transform: `translateY(${headerY}px)`,
          marginBottom: 60,
        }}
      >
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.22em',
            color: BRAND_GOLD,
            fontSize: 22,
            marginBottom: 18,
          }}
        >
          What makes us different
        </div>
        <h2
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 800,
            fontSize: 88,
            lineHeight: 1,
            color: TEXT_PRIMARY,
            letterSpacing: '-0.02em',
            margin: '0 0 12px 0',
          }}
        >
          Not just another{' '}
          <em style={{ color: BRAND_GOLD, fontStyle: 'normal' }}>
            fantasy platform.
          </em>
        </h2>
        <p
          style={{
            fontFamily: FONT_BODY,
            fontSize: 30,
            color: TEXT_MUTED,
            margin: 0,
          }}
        >
          Today's apps lock you to today's season. Legacy opens 150 years of
          baseball.
        </p>
      </div>

      {/* Columns: Normal | VS | Legacy */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 80px 1fr',
          flex: 1,
          alignItems: 'stretch',
          gap: 0,
        }}
      >
        {/* Normal Fantasy */}
        <div
          style={{
            transform: `translateX(${leftX}px)`,
            borderRadius: 20,
            padding: 48,
            display: 'flex',
            flexDirection: 'column',
            border: `1px solid ${OUTLINE_SUBTLE}`,
            background: SURFACE_PANEL,
            opacity: 0.92,
          }}
        >
          <div
            style={{
              fontFamily: FONT_DISPLAY,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.20em',
              fontSize: 26,
              marginBottom: 14,
              color: TEXT_QUIETEST,
            }}
          >
            Normal Fantasy
          </div>
          <h3
            style={{
              fontFamily: FONT_DISPLAY,
              fontWeight: 800,
              fontSize: 56,
              color: TEXT_SECONDARY,
              lineHeight: 1.0,
              margin: '0 0 32px 0',
              letterSpacing: '-0.01em',
            }}
          >
            Live games only.
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            {renderPoints(NORMAL_POINTS, false)}
          </div>
        </div>

        {/* VS */}
        <div
          style={{
            alignSelf: 'center',
            fontFamily: FONT_DISPLAY,
            fontWeight: 800,
            color: TEXT_QUIETEST,
            fontSize: 56,
            textAlign: 'center',
            letterSpacing: '0.04em',
            opacity: vsOpacity,
          }}
        >
          VS
        </div>

        {/* Legacy Fantasy */}
        <div
          style={{
            transform: `translateX(${rightX}px)`,
            borderRadius: 20,
            padding: 48,
            display: 'flex',
            flexDirection: 'column',
            border: `1px solid rgba(197,165,90,0.45)`,
            background: `linear-gradient(135deg, rgba(197,165,90,0.16) 0%, rgba(27,58,92,0.20) 100%), ${SURFACE_CARD}`,
            boxShadow:
              '0 0 0 1px rgba(197,165,90,0.35), 0 6px 24px rgba(197,165,90,0.25)',
          }}
        >
          <div
            style={{
              fontFamily: FONT_DISPLAY,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.20em',
              fontSize: 26,
              marginBottom: 14,
              color: BRAND_GOLD,
            }}
          >
            Legacy Fantasy
          </div>
          <h3
            style={{
              fontFamily: FONT_DISPLAY,
              fontWeight: 800,
              fontSize: 56,
              color: TEXT_PRIMARY,
              lineHeight: 1.0,
              margin: '0 0 32px 0',
              letterSpacing: '-0.01em',
            }}
          >
            The whole archive.
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            {renderPoints(LEGACY_POINTS, true)}
          </div>
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
          opacity: vsOpacity,
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
        Scene 02<span style={{ color: TEXT_QUIETEST }}>/</span>Differentiator
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
          opacity: vsOpacity,
        }}
      >
        00:04 — 00:12
      </div>
    </AbsoluteFill>
  );
};
