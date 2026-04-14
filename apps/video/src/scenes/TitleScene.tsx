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
  BRAND_SEAM_RED,
  FONT_DISPLAY,
  FONT_BODY,
  PANEL_BORDER,
  TEXT_MUTED,
  TEXT_PRIMARY,
} from '../theme';

// Animated seam-stitch decoration
const BaseballSeam: React.FC<{
  x: number;
  y: number;
  size: number;
  opacity: number;
}> = ({ x, y, size, opacity }) => (
  <div
    style={{
      position: 'absolute',
      left: x,
      top: y,
      width: size,
      height: size,
      borderRadius: '50%',
      border: `2px solid ${BRAND_SEAM_RED}`,
      opacity,
      boxShadow: `0 0 ${size * 0.3}px ${BRAND_SEAM_RED}22`,
    }}
  />
);

export const TitleScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // "LEGACY" word entrance — spring from left
  const legacyX = spring({
    frame,
    fps,
    from: -300,
    to: 0,
    config: { damping: 28, mass: 1, stiffness: 180 },
  });

  // "FANTASY BASEBALL" — spring from right
  const fantasyX = spring({
    frame: frame - 8,
    fps,
    from: 300,
    to: 0,
    config: { damping: 28, mass: 1, stiffness: 180 },
  });

  // Tagline fade in
  const taglineOpacity = interpolate(frame, [25, 55], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Badge line
  const badgeOpacity = interpolate(frame, [40, 70], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Gold underline width
  const lineWidth = interpolate(frame, [18, 55], [0, 100], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Background circles (decorative)
  const circleScale = interpolate(frame, [0, 60], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Scene exit fade
  const exitOpacity = interpolate(frame, [100, 120], [1, 0], {
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
        overflow: 'hidden',
        opacity: exitOpacity,
      }}
    >
      {/* Decorative background circles */}
      <div
        style={{
          position: 'absolute',
          right: -200,
          top: -200,
          width: 800,
          height: 800,
          borderRadius: '50%',
          border: `1px solid ${PANEL_BORDER}`,
          transform: `scale(${circleScale})`,
          opacity: 0.4,
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: -100,
          top: -100,
          width: 500,
          height: 500,
          borderRadius: '50%',
          border: `1px solid ${BRAND_GOLD}22`,
          transform: `scale(${circleScale})`,
          opacity: 0.6,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: -200,
          bottom: -200,
          width: 700,
          height: 700,
          borderRadius: '50%',
          border: `1px solid ${PANEL_BORDER}`,
          transform: `scale(${circleScale})`,
          opacity: 0.3,
        }}
      />

      {/* Baseball seam decorations */}
      <BaseballSeam x={120} y={80} size={24} opacity={badgeOpacity * 0.5} />
      <BaseballSeam x={1750} y={900} size={18} opacity={badgeOpacity * 0.4} />
      <BaseballSeam x={80} y={920} size={14} opacity={badgeOpacity * 0.3} />
      <BaseballSeam x={1820} y={100} size={20} opacity={badgeOpacity * 0.35} />

      {/* Horizontal rule top */}
      <div
        style={{
          position: 'absolute',
          top: 100,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 120,
          height: 2,
          background: `linear-gradient(90deg, transparent, ${BRAND_GOLD}, transparent)`,
          opacity: badgeOpacity,
        }}
      />

      {/* Main title block */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 0,
          position: 'relative',
        }}
      >
        {/* "LEGACY" */}
        <div
          style={{
            transform: `translateX(${legacyX}px)`,
            fontFamily: FONT_DISPLAY,
            fontWeight: 800,
            fontSize: 196,
            color: BRAND_GOLD,
            letterSpacing: '0.04em',
            lineHeight: 1,
            textTransform: 'uppercase',
            WebkitTextStroke: `2px ${BRAND_GOLD_LIGHT}44`,
          }}
        >
          LEGACY
        </div>

        {/* Gold underline */}
        <div
          style={{
            width: `${lineWidth}%`,
            height: 4,
            background: `linear-gradient(90deg, transparent, ${BRAND_GOLD}, transparent)`,
            margin: '4px 0 8px',
            alignSelf: 'center',
          }}
        />

        {/* "FANTASY BASEBALL" */}
        <div
          style={{
            transform: `translateX(${fantasyX}px)`,
            fontFamily: FONT_DISPLAY,
            fontWeight: 700,
            fontSize: 96,
            color: TEXT_PRIMARY,
            letterSpacing: '0.12em',
            lineHeight: 1,
            textTransform: 'uppercase',
          }}
        >
          FANTASY BASEBALL
        </div>
      </div>

      {/* Tagline */}
      <div
        style={{
          marginTop: 48,
          opacity: taglineOpacity,
          fontFamily: FONT_BODY,
          fontSize: 32,
          color: TEXT_MUTED,
          letterSpacing: '0.06em',
          fontStyle: 'italic',
        }}
      >
        Draft legends. Compete on history.
      </div>

      {/* Badge row */}
      <div
        style={{
          marginTop: 64,
          opacity: badgeOpacity,
          display: 'flex',
          gap: 32,
          alignItems: 'center',
        }}
      >
        {[
          '150 YEARS OF MLB HISTORY',
          '50,000+ PLAYER SEASONS',
          'CROSS-ERA DRAFTS',
        ].map((label, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: i > 0 ? 32 : 0,
            }}
          >
            {i > 0 && (
              <div
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: '50%',
                  background: BRAND_GOLD,
                  marginRight: 0,
                }}
              />
            )}
            <div
              key={label}
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: 600,
                fontSize: 18,
                color: TEXT_MUTED,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            >
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom rule */}
      <div
        style={{
          position: 'absolute',
          bottom: 100,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 120,
          height: 2,
          background: `linear-gradient(90deg, transparent, ${BRAND_GOLD}, transparent)`,
          opacity: badgeOpacity,
        }}
      />
    </AbsoluteFill>
  );
};
