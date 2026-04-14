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
  BRAND_SEAM_RED,
  FONT_DISPLAY,
  FONT_BODY,
  OUTLINE_SUBTLE,
  PANEL_BORDER,
  SURFACE_PANEL,
  TEXT_MUTED,
  TEXT_PRIMARY,
} from '../theme';

const NORMAL_POINTS = [
  "Waiting for today's live games",
  'Only current-season players',
  'Same pool of active stars every year',
  'Injuries ruin your season',
  'Schedule luck matters too much',
];

const LEGACY_POINTS = [
  'Scored on archived MLB history',
  'Any player, any era, any season',
  'Your 1927 Ruth vs. their 2019 Trout',
  'No live game dependency',
  'Pure baseball knowledge wins',
];

const CheckIcon: React.FC = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <circle
      cx="10"
      cy="10"
      r="9"
      fill={BRAND_GOLD}
      fillOpacity={0.15}
      stroke={BRAND_GOLD}
      strokeWidth="1.5"
    />
    <path
      d="M6 10l3 3 5-6"
      stroke={BRAND_GOLD}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const XIcon: React.FC = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <circle
      cx="10"
      cy="10"
      r="9"
      fill={BRAND_SEAM_RED}
      fillOpacity={0.1}
      stroke={BRAND_SEAM_RED}
      strokeWidth="1.5"
      strokeOpacity={0.5}
    />
    <path
      d="M7 7l6 6M13 7l-6 6"
      stroke={BRAND_SEAM_RED}
      strokeWidth="2"
      strokeLinecap="round"
      strokeOpacity={0.7}
    />
  </svg>
);

export const DifferentiatorScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Scene fade in
  const sceneOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Header entrance
  const headerY = spring({
    frame,
    fps,
    from: -40,
    to: 0,
    config: { damping: 30, stiffness: 200 },
  });

  // Left panel slide in
  const leftX = spring({
    frame: frame - 10,
    fps,
    from: -120,
    to: 0,
    config: { damping: 28, stiffness: 160 },
  });

  // Right panel slide in
  const rightX = spring({
    frame: frame - 18,
    fps,
    from: 120,
    to: 0,
    config: { damping: 28, stiffness: 160 },
  });

  // Scene exit
  const exitOpacity = interpolate(frame, [210, 240], [1, 0], {
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
        padding: '80px 120px',
        opacity: sceneOpacity * exitOpacity,
        gap: 56,
      }}
    >
      {/* Header */}
      <div
        style={{
          transform: `translateY(${headerY}px)`,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 700,
            fontSize: 16,
            color: BRAND_GOLD,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            marginBottom: 16,
          }}
        >
          What Makes Legacy Different
        </div>
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 800,
            fontSize: 72,
            color: TEXT_PRIMARY,
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
            lineHeight: 1,
          }}
        >
          NOT YOUR TYPICAL
          <br />
          <span style={{ color: BRAND_GOLD }}>FANTASY LEAGUE</span>
        </div>
      </div>

      {/* Two-column comparison */}
      <div
        style={{
          display: 'flex',
          gap: 40,
          width: '100%',
          maxWidth: 1400,
        }}
      >
        {/* Normal Fantasy - LEFT */}
        <div
          style={{
            transform: `translateX(${leftX}px)`,
            flex: 1,
            background: SURFACE_PANEL,
            border: `1px solid ${OUTLINE_SUBTLE}`,
            borderRadius: 16,
            padding: '40px 48px',
            opacity: 0.65,
          }}
        >
          <div
            style={{
              fontFamily: FONT_DISPLAY,
              fontWeight: 700,
              fontSize: 28,
              color: TEXT_MUTED,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: 32,
              paddingBottom: 20,
              borderBottom: `1px solid ${OUTLINE_SUBTLE}`,
            }}
          >
            Normal Fantasy Baseball
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {NORMAL_POINTS.map((point, i) => {
              const itemOpacity = interpolate(
                frame,
                [15 + i * 8, 30 + i * 8],
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
                    gap: 16,
                    opacity: itemOpacity,
                  }}
                >
                  <XIcon />
                  <div
                    style={{
                      fontFamily: FONT_BODY,
                      fontSize: 22,
                      color: TEXT_MUTED,
                      lineHeight: 1.4,
                    }}
                  >
                    {point}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* VS divider */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            flexShrink: 0,
            opacity: interpolate(frame, [20, 40], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
          }}
        >
          <div style={{ width: 1, flex: 1, background: PANEL_BORDER }} />
          <div
            style={{
              fontFamily: FONT_DISPLAY,
              fontWeight: 800,
              fontSize: 28,
              color: TEXT_MUTED,
              letterSpacing: '0.1em',
            }}
          >
            VS
          </div>
          <div style={{ width: 1, flex: 1, background: PANEL_BORDER }} />
        </div>

        {/* Legacy Fantasy - RIGHT */}
        <div
          style={{
            transform: `translateX(${rightX}px)`,
            flex: 1,
            position: 'relative',
            background: `linear-gradient(135deg, ${SURFACE_PANEL} 0%, ${BRAND_NAVY}44 100%)`,
            border: `1px solid ${BRAND_GOLD}44`,
            borderRadius: 16,
            padding: '40px 48px',
            boxShadow: `0 0 60px ${BRAND_GOLD}11`,
          }}
        >
          {/* Gold accent top bar */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 40,
              right: 40,
              height: 3,
              background: `linear-gradient(90deg, transparent, ${BRAND_GOLD}, transparent)`,
              borderRadius: '0 0 4px 4px',
            }}
          />

          <div
            style={{
              fontFamily: FONT_DISPLAY,
              fontWeight: 700,
              fontSize: 28,
              color: BRAND_GOLD,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: 32,
              paddingBottom: 20,
              borderBottom: `1px solid ${BRAND_GOLD}33`,
            }}
          >
            Legacy Fantasy Baseball
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {LEGACY_POINTS.map((point, i) => {
              const itemOpacity = interpolate(
                frame,
                [22 + i * 8, 38 + i * 8],
                [0, 1],
                {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                },
              );
              const itemX = interpolate(
                frame,
                [22 + i * 8, 38 + i * 8],
                [20, 0],
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
                    gap: 16,
                    opacity: itemOpacity,
                    transform: `translateX(${itemX}px)`,
                  }}
                >
                  <CheckIcon />
                  <div
                    style={{
                      fontFamily: FONT_BODY,
                      fontSize: 22,
                      color: TEXT_PRIMARY,
                      lineHeight: 1.4,
                    }}
                  >
                    {point}
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
