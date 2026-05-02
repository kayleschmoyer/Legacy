import React from 'react';
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {
  BG_DARK,
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  FONT_BODY,
  FONT_DISPLAY,
  TEXT_MUTED,
  TEXT_PRIMARY,
} from '../theme';

export const TitleScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Logo circle entrance
  const logoScale = spring({
    frame,
    fps,
    from: 0.6,
    to: 1,
    config: { damping: 28, stiffness: 200 },
  });
  const logoOpacity = interpolate(frame, [0, 18], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // "LEGACY" entrance — slide from left
  const legacyX = spring({
    frame: frame - 6,
    fps,
    from: -200,
    to: 0,
    config: { damping: 28, mass: 1, stiffness: 180 },
  });

  // "FANTASY BASEBALL" entrance — slide from right
  const fantasyX = spring({
    frame: frame - 14,
    fps,
    from: 200,
    to: 0,
    config: { damping: 28, mass: 1, stiffness: 180 },
  });

  // Tagline fade
  const taglineOpacity = interpolate(frame, [28, 52], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const taglineY = spring({
    frame: frame - 28,
    fps,
    from: 20,
    to: 0,
    config: { damping: 30, stiffness: 200 },
  });

  // Badges stagger
  const badgesOpacity = interpolate(frame, [48, 72], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const badgesY = spring({
    frame: frame - 48,
    fps,
    from: 20,
    to: 0,
    config: { damping: 30, stiffness: 200 },
  });

  // Scene exit
  const exitOpacity = interpolate(frame, [100, 120], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const BADGES = [
    { label: 'Cross-Era Drafting', style: 'gold' as const },
    { label: 'Historical Stats', style: 'red' as const },
    { label: 'Free to Play', style: 'navy' as const },
  ];

  const BADGE_STYLES = {
    gold: {
      color: BRAND_GOLD_LIGHT,
      borderColor: 'rgba(197,165,90,0.45)',
      background: 'rgba(197,165,90,0.08)',
    },
    red: {
      color: '#F2A6B2',
      borderColor: 'rgba(196,30,58,0.55)',
      background: 'rgba(196,30,58,0.10)',
    },
    navy: {
      color: '#B7C8E6',
      borderColor: 'rgba(91,132,196,0.55)',
      background: 'rgba(91,132,196,0.12)',
    },
  };

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
        overflow: 'hidden',
        opacity: exitOpacity,
      }}
    >
      {/* Vignette overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse at 50% 50%, transparent 55%, rgba(0,0,0,0.45) 100%)',
          pointerEvents: 'none',
        }}
      />

      {/* Logo circle */}
      <div
        style={{
          width: 200,
          height: 200,
          borderRadius: '50%',
          background:
            'radial-gradient(circle at 50% 40%, rgba(197,165,90,0.35) 0%, transparent 70%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 36,
          filter: 'drop-shadow(0 14px 40px rgba(8,12,20,0.7))',
          transform: `scale(${logoScale})`,
          opacity: logoOpacity,
        }}
      >
        <Img src={staticFile('logo.png')} style={{ width: 168, height: 168 }} />
      </div>

      {/* Title block */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 0,
          overflow: 'hidden',
        }}
      >
        {/* LEGACY */}
        <div
          style={{
            transform: `translateX(${legacyX}px)`,
            fontFamily: FONT_DISPLAY,
            fontWeight: 800,
            fontSize: 168,
            lineHeight: 0.92,
            color: TEXT_PRIMARY,
            letterSpacing: '-0.025em',
            textTransform: 'uppercase',
          }}
        >
          LEGACY
        </div>
        {/* FANTASY BASEBALL — gold */}
        <div
          style={{
            transform: `translateX(${fantasyX}px)`,
            fontFamily: FONT_DISPLAY,
            fontWeight: 800,
            fontSize: 168,
            lineHeight: 0.92,
            color: BRAND_GOLD,
            letterSpacing: '-0.025em',
            textTransform: 'uppercase',
          }}
        >
          FANTASY BASEBALL
        </div>
      </div>

      {/* Tagline */}
      <div
        style={{
          marginTop: 28,
          opacity: taglineOpacity,
          transform: `translateY(${taglineY}px)`,
          fontFamily: FONT_BODY,
          fontStyle: 'italic',
          fontSize: 38,
          color: TEXT_MUTED,
          textAlign: 'center',
          maxWidth: 1100,
        }}
      >
        Year-round fantasy baseball, powered by 150 years of history.
      </div>

      {/* Badges */}
      <div
        style={{
          marginTop: 56,
          opacity: badgesOpacity,
          transform: `translateY(${badgesY}px)`,
          display: 'flex',
          gap: 18,
        }}
      >
        {BADGES.map((badge) => {
          const s = BADGE_STYLES[badge.style];
          return (
            <div
              key={badge.label}
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.16em',
                fontSize: 24,
                padding: '14px 28px',
                borderRadius: 9999,
                border: `1px solid ${s.borderColor}`,
                color: s.color,
                background: s.background,
              }}
            >
              {badge.label}
            </div>
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
          opacity: badgesOpacity,
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
        Scene 01
        <span style={{ color: '#6C80BA' }}>/</span>
        Title
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
          opacity: badgesOpacity,
        }}
      >
        00:00 — 00:04
      </div>
    </AbsoluteFill>
  );
};
