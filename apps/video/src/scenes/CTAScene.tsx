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
  FONT_BODY,
  FONT_DISPLAY,
  FONT_MONO,
  PANEL_BORDER,
  SURFACE_CARD,
  SURFACE_PANEL,
  TEXT_MUTED,
  TEXT_PRIMARY,
} from '../theme';

const STATS = [
  { value: '1,200+', label: 'Commissioners' },
  { value: '150', label: 'Years of MLB History' },
  { value: '50,000+', label: 'Player Seasons' },
];

const STEPS_SUMMARY = [
  { num: '01', label: 'Create a League', detail: 'Choose your era and rules' },
  {
    num: '02',
    label: 'Draft Your Legends',
    detail: 'Snake or auction — across any era',
  },
  {
    num: '03',
    label: 'Compete Weekly',
    detail: 'Archived stats — no luck of the schedule',
  },
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

  // Logo entrance
  const logoY = spring({
    frame,
    fps,
    from: -40,
    to: 0,
    config: { damping: 30, stiffness: 200 },
  });
  const logoOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Headline entrance
  const headlineY = spring({
    frame: frame - 10,
    fps,
    from: 40,
    to: 0,
    config: { damping: 28, stiffness: 180 },
  });
  const headlineOpacity = interpolate(frame, [10, 28], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Steps entrance (staggered)
  // Stats entrance (staggered)

  // CTA button pulse
  const buttonScale = spring({
    frame: frame - 100,
    fps,
    from: 0.8,
    to: 1,
    config: { damping: 20, stiffness: 200 },
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
        opacity: sceneIn,
      }}
    >
      {/* Background glow */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse 900px 600px at 50% 50%, ${BRAND_NAVY}${Math.round(
            glowOpacity * 255,
          )
            .toString(16)
            .padStart(2, '0')}, transparent)`,
        }}
      />

      {/* Gold line top */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: '20%',
          right: '20%',
          height: 3,
          background: `linear-gradient(90deg, transparent, ${BRAND_GOLD}, transparent)`,
        }}
      />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 48,
          maxWidth: 1200,
          width: '100%',
          padding: '0 80px',
          position: 'relative',
        }}
      >
        {/* Logo / brand mark */}
        <div
          style={{
            transform: `translateY(${logoY}px)`,
            opacity: logoOpacity,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 12,
              background: BRAND_NAVY + '55',
              border: `1px solid ${BRAND_GOLD}44`,
              borderRadius: 12,
              padding: '10px 24px',
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <circle
                cx="12"
                cy="12"
                r="10"
                stroke={BRAND_GOLD}
                strokeWidth="1.5"
              />
              <path
                d="M7 12c2-2.5 3-4 5-4s3 1.5 5 4c-2 2.5-3 4-5 4s-3-1.5-5-4z"
                stroke={BRAND_GOLD}
                strokeWidth="1.5"
              />
              <circle cx="12" cy="12" r="2" fill={BRAND_GOLD} />
            </svg>
            <div
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: 700,
                fontSize: 18,
                color: BRAND_GOLD,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
              }}
            >
              Legacy Sports
            </div>
          </div>
        </div>

        {/* Main headline */}
        <div
          style={{
            transform: `translateY(${headlineY}px)`,
            opacity: headlineOpacity,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontFamily: FONT_DISPLAY,
              fontWeight: 800,
              fontSize: 88,
              color: TEXT_PRIMARY,
              textTransform: 'uppercase',
              letterSpacing: '0.02em',
              lineHeight: 1,
            }}
          >
            START YOUR
          </div>
          <div
            style={{
              fontFamily: FONT_DISPLAY,
              fontWeight: 800,
              fontSize: 88,
              color: BRAND_GOLD,
              textTransform: 'uppercase',
              letterSpacing: '0.02em',
              lineHeight: 1,
            }}
          >
            LEGACY
          </div>
          <div
            style={{
              fontFamily: FONT_BODY,
              fontSize: 26,
              color: TEXT_MUTED,
              marginTop: 20,
              fontStyle: 'italic',
            }}
          >
            The only fantasy league powered by 150 years of MLB history.
          </div>
        </div>

        {/* How it works — quick steps */}
        <div
          style={{
            display: 'flex',
            gap: 24,
            width: '100%',
            opacity: interpolate(frame, [40, 60], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
          }}
        >
          {STEPS_SUMMARY.map((s, i) => {
            const stepOpacity = interpolate(
              frame,
              [40 + i * 12, 58 + i * 12],
              [0, 1],
              {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              },
            );
            const stepY = spring({
              frame: frame - (40 + i * 12),
              fps,
              from: 24,
              to: 0,
              config: { damping: 30, stiffness: 220 },
            });

            return (
              <div
                key={s.num}
                style={{
                  flex: 1,
                  background: SURFACE_PANEL,
                  border: `1px solid ${PANEL_BORDER}`,
                  borderRadius: 12,
                  padding: '24px 28px',
                  display: 'flex',
                  gap: 18,
                  alignItems: 'flex-start',
                  opacity: stepOpacity,
                  transform: `translateY(${stepY}px)`,
                }}
              >
                <div
                  style={{
                    fontFamily: FONT_MONO,
                    fontWeight: 700,
                    fontSize: 32,
                    color: BRAND_GOLD + '66',
                    lineHeight: 1,
                    flexShrink: 0,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {s.num}
                </div>
                <div>
                  <div
                    style={{
                      fontFamily: FONT_DISPLAY,
                      fontWeight: 700,
                      fontSize: 22,
                      color: TEXT_PRIMARY,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      marginBottom: 6,
                    }}
                  >
                    {s.label}
                  </div>
                  <div
                    style={{
                      fontFamily: FONT_BODY,
                      fontSize: 16,
                      color: TEXT_MUTED,
                      lineHeight: 1.4,
                    }}
                  >
                    {s.detail}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Stats row */}
        <div
          style={{
            display: 'flex',
            gap: 0,
            borderRadius: 12,
            overflow: 'hidden',
            border: `1px solid ${PANEL_BORDER}`,
            opacity: interpolate(frame, [70, 90], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
          }}
        >
          {STATS.map((s, i) => (
            <div
              key={s.label}
              style={{
                padding: '20px 40px',
                textAlign: 'center',
                background: i % 2 === 0 ? SURFACE_PANEL : SURFACE_CARD,
                borderRight:
                  i < STATS.length - 1 ? `1px solid ${PANEL_BORDER}` : 'none',
              }}
            >
              <div
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontWeight: 800,
                  fontSize: 36,
                  color: BRAND_GOLD,
                  letterSpacing: '0.02em',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {s.value}
              </div>
              <div
                style={{
                  fontFamily: FONT_BODY,
                  fontSize: 14,
                  color: TEXT_MUTED,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  marginTop: 4,
                }}
              >
                {s.label}
              </div>
            </div>
          ))}
        </div>

        {/* CTA Button */}
        <div
          style={{
            transform: `scale(${buttonScale})`,
            opacity: interpolate(frame, [100, 120], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 16,
              background: `linear-gradient(135deg, ${BRAND_GOLD}, ${BRAND_GOLD_LIGHT})`,
              borderRadius: 14,
              padding: '20px 52px',
              boxShadow: `0 12px 48px ${BRAND_GOLD}44`,
            }}
          >
            <div
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: 800,
                fontSize: 26,
                color: BG_DARK,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              Create Your League — It's Free
            </div>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path
                d="M5 12h14M14 7l5 5-5 5"
                stroke={BG_DARK}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>

        {/* URL */}
        <div
          style={{
            opacity: interpolate(frame, [130, 155], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
            fontFamily: FONT_MONO,
            fontSize: 18,
            color: TEXT_MUTED,
            letterSpacing: '0.06em',
          }}
        >
          legacy.sports
        </div>
      </div>

      {/* Gold line bottom */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: '20%',
          right: '20%',
          height: 3,
          background: `linear-gradient(90deg, transparent, ${BRAND_GOLD}, transparent)`,
          opacity: interpolate(frame, [20, 40], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
        }}
      />
    </AbsoluteFill>
  );
};
