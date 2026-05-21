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
  BRAND_GOLD_DARK,
  BRAND_GOLD_LIGHT,
  FONT_BODY,
  FONT_DISPLAY,
  FONT_MONO,
  TEXT_MUTED,
  TEXT_PRIMARY,
  easeOutQuart,
} from '../theme';

const STATS = [
  { value: '150', label: 'Years of Baseball' },
  { value: '50K+', label: 'Player-Seasons' },
  { value: '12', label: 'Team Leagues' },
  { value: '$0', label: 'To Start' },
] as const;

// Quietest foreground tone from the design system (`--fg4`). Used for
// scene chrome and the timestamp; matches the literal value other scenes
// in this app use so the storyboard chrome reads identically across cuts.
const TEXT_QUIET = '#6C80BA';
// Storyboard `.s-cta .button` text color — a deep navy specific to the CTA
// pill that's distinct from the brand-navy anchor.
const BUTTON_TEXT = '#14223A';

// Stagger choreography (in frames @ 30fps) — matches the storyboard's
// `.rise` cascade: each block opacity 0→1 + translateY 14→0 over ~600ms.
const RISE_FRAMES = 18;
const STATS_START = 0;
const STAT_STAGGER = 4;
const HEADLINE_START = STATS_START + STAT_STAGGER * STATS.length + 2; // ~20
const LEDE_START = HEADLINE_START + 14; // ~34
const BUTTON_START = LEDE_START + 14; // ~48
const URL_START = BUTTON_START + 14; // ~62

function rise(frame: number, start: number) {
  const t = interpolate(frame, [start, start + RISE_FRAMES], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const eased = easeOutQuart(t);
  return { opacity: eased, translateY: (1 - eased) * 14 };
}

export const CTAScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const sceneIn = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Background glow pulse — 2s breathing cadence
  const glowOpacity = interpolate(frame % 60, [0, 30, 60], [0.08, 0.18, 0.08], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // CTA button: enters via spring, then a continuous gentle breathe so the
  // call-to-action keeps drawing the eye in the final seconds of the spot.
  const buttonRise = rise(frame, BUTTON_START);
  const buttonSpringScale = spring({
    frame: frame - BUTTON_START,
    fps,
    from: 0.9,
    to: 1,
    config: { damping: 18, stiffness: 180 },
  });
  const breathePhase = Math.max(0, frame - (BUTTON_START + 24));
  const breathe = 1 + Math.sin((breathePhase / fps) * Math.PI * 0.9) * 0.012;

  const headline = rise(frame, HEADLINE_START);
  const lede = rise(frame, LEDE_START);
  const url = rise(frame, URL_START);

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
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: 80,
        opacity: sceneIn,
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

      {/* Background glow */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse 900px 600px at 50% 50%, rgba(27,58,92,${glowOpacity.toFixed(
            2,
          )}), transparent)`,
          pointerEvents: 'none',
        }}
      />

      {/* Stats row */}
      <div
        style={{
          display: 'flex',
          gap: 80,
          marginBottom: 52,
        }}
      >
        {STATS.map((s, i) => {
          const r = rise(frame, STATS_START + i * STAT_STAGGER);
          return (
            <div
              key={s.label}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                opacity: r.opacity,
                transform: `translateY(${r.translateY}px)`,
              }}
            >
              <div
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontWeight: 800,
                  fontSize: 96,
                  color: BRAND_GOLD,
                  lineHeight: 1,
                  fontVariantNumeric: 'tabular-nums',
                  letterSpacing: '-0.01em',
                }}
              >
                {s.value}
              </div>
              <div
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.20em',
                  fontSize: 24,
                  color: TEXT_MUTED,
                  marginTop: 10,
                }}
              >
                {s.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Main headline */}
      <h2
        style={{
          fontFamily: FONT_DISPLAY,
          fontWeight: 800,
          fontSize: 144,
          lineHeight: 0.92,
          color: TEXT_PRIMARY,
          letterSpacing: '-0.025em',
          margin: '0 0 22px 0',
          maxWidth: 1500,
          opacity: headline.opacity,
          transform: `translateY(${headline.translateY}px)`,
        }}
      >
        Build your dynasty.
        <br />
        <span style={{ color: BRAND_GOLD }}>Dominate your league.</span>
      </h2>

      {/* Lede */}
      <p
        style={{
          fontFamily: FONT_BODY,
          fontStyle: 'italic',
          fontSize: 32,
          color: TEXT_MUTED,
          maxWidth: 1100,
          margin: '0 0 56px 0',
          opacity: lede.opacity,
          transform: `translateY(${lede.translateY}px)`,
        }}
      >
        Free to play · No credit card · Year-round play
      </p>

      {/* CTA Button — storyboard `--grad-gold` (gold → gold-dark) */}
      <div
        style={{
          transform: `scale(${buttonSpringScale * breathe}) translateY(${buttonRise.translateY}px)`,
          opacity: buttonRise.opacity,
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 18,
            padding: '26px 52px',
            borderRadius: 20,
            background: `linear-gradient(135deg, ${BRAND_GOLD} 0%, ${BRAND_GOLD_DARK} 100%)`,
            color: BUTTON_TEXT,
            fontFamily: FONT_DISPLAY,
            fontWeight: 800,
            fontSize: 38,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            boxShadow:
              '0 0 0 1px rgba(197,165,90,0.35), 0 6px 24px rgba(197,165,90,0.25)',
          }}
        >
          Create Your League — It&apos;s Free
          <span style={{ fontSize: 32 }}>→</span>
        </div>
      </div>

      {/* URL */}
      <div
        style={{
          marginTop: 36,
          fontFamily: FONT_MONO,
          color: BRAND_GOLD_LIGHT,
          fontSize: 26,
          letterSpacing: '0.12em',
          opacity: url.opacity,
          transform: `translateY(${url.translateY}px)`,
        }}
      >
        legacy.sports
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
          opacity: url.opacity,
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
        Scene 07<span style={{ color: TEXT_QUIET }}>/</span>Call to Action
      </div>
      <div
        style={{
          position: 'absolute',
          right: 56,
          bottom: 40,
          fontFamily: FONT_MONO,
          color: TEXT_QUIET,
          fontSize: 24,
          letterSpacing: '0.08em',
          opacity: url.opacity,
        }}
      >
        00:51 — 01:00
      </div>
    </AbsoluteFill>
  );
};
