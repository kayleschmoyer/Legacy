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
  FONT_BODY,
  FONT_DISPLAY,
  FONT_MONO,
  TEXT_MUTED,
  TEXT_PRIMARY,
} from '../theme';

const STATS = [
  { value: '150', label: 'Years of Baseball' },
  { value: '50K+', label: 'Player-Seasons' },
  { value: '12', label: 'Team Leagues' },
  { value: '$0', label: 'To Start' },
];

export const CTAScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const sceneIn = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Background glow pulse
  const glowOpacity = interpolate(frame % 60, [0, 30, 60], [0.08, 0.18, 0.08], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Stats row entrance
  const statsOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const statsY = spring({
    frame,
    fps,
    from: -30,
    to: 0,
    config: { damping: 30, stiffness: 200 },
  });

  // Headline entrance
  const headlineY = spring({
    frame: frame - 14,
    fps,
    from: 40,
    to: 0,
    config: { damping: 28, stiffness: 180 },
  });
  const headlineOpacity = interpolate(frame, [14, 32], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Lede
  const ledeOpacity = interpolate(frame, [28, 46], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // CTA button entrance
  const buttonScale = spring({
    frame: frame - 46,
    fps,
    from: 0.8,
    to: 1,
    config: { damping: 20, stiffness: 200 },
  });
  const buttonOpacity = interpolate(frame, [46, 66], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // URL
  const urlOpacity = interpolate(frame, [80, 100], [0, 1], {
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
          opacity: statsOpacity,
          transform: `translateY(${statsY}px)`,
        }}
      >
        {STATS.map((s) => (
          <div
            key={s.label}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
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
        ))}
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
          opacity: headlineOpacity,
          transform: `translateY(${headlineY}px)`,
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
          opacity: ledeOpacity,
        }}
      >
        Free to play · No credit card · Year-round play
      </p>

      {/* CTA Button */}
      <div
        style={{
          transform: `scale(${buttonScale})`,
          opacity: buttonOpacity,
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 18,
            padding: '26px 52px',
            borderRadius: 20,
            background: `linear-gradient(135deg, ${BRAND_GOLD}, ${BRAND_GOLD_LIGHT})`,
            color: '#14223A',
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
          opacity: urlOpacity,
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
          opacity: urlOpacity,
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
        Scene 07<span style={{ color: '#6C80BA' }}>/</span>Call to Action
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
          opacity: urlOpacity,
        }}
      >
        00:51 — 01:00
      </div>
    </AbsoluteFill>
  );
};
