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
  BRAND_NAVY_LIGHT,
  FONT_BODY,
  FONT_DISPLAY,
  FONT_MONO,
  GREEN,
  PANEL_BORDER,
  SURFACE_CARD,
  SURFACE_PANEL,
  SURFACE_SUBTLE,
  TEXT_MUTED,
  TEXT_PRIMARY,
} from '../theme';

// Steps shown one at a time, each for ~110 frames
const STEP_DURATION = 110;
const STEPS = [
  {
    step: 1,
    title: 'Name Your League',
    subtitle: 'Give your league an identity',
  },
  {
    step: 2,
    title: 'Choose Your Era',
    subtitle: 'Which slice of history will you draft from?',
  },
  {
    step: 3,
    title: 'Configure Your Draft',
    subtitle: 'Set up how teams will be built',
  },
];

// Step 1 UI: League name input
const Step1: React.FC<{ frame: number }> = ({ frame }) => {
  const inputOpacity = interpolate(frame, [10, 25], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const caretBlink = Math.floor(frame / 15) % 2 === 0;

  const LEAGUE_NAME = 'The Timeless Classic League';
  const charsVisible = Math.floor(
    interpolate(frame, [20, 65], [0, LEAGUE_NAME.length], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }),
  );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 28,
        opacity: inputOpacity,
      }}
    >
      <div>
        <label
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 600,
            fontSize: 15,
            color: TEXT_MUTED,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            display: 'block',
            marginBottom: 10,
          }}
        >
          League Name
        </label>
        <div
          style={{
            background: SURFACE_SUBTLE,
            border: `1.5px solid ${BRAND_GOLD}66`,
            borderRadius: 10,
            padding: '18px 22px',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            boxShadow: `0 0 20px ${BRAND_GOLD}11`,
          }}
        >
          <span
            style={{ fontFamily: FONT_BODY, fontSize: 26, color: TEXT_PRIMARY }}
          >
            {LEAGUE_NAME.slice(0, charsVisible)}
          </span>
          {charsVisible < LEAGUE_NAME.length && caretBlink && (
            <span
              style={{
                width: 2,
                height: 28,
                background: BRAND_GOLD,
                display: 'inline-block',
              }}
            />
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20 }}>
        {[
          { label: 'Number of Teams', value: '10' },
          { label: 'Roster Size', value: '23 players' },
        ].map((field) => (
          <div key={field.label} style={{ flex: 1 }}>
            <label
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: 600,
                fontSize: 15,
                color: TEXT_MUTED,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                display: 'block',
                marginBottom: 10,
              }}
            >
              {field.label}
            </label>
            <div
              style={{
                background: SURFACE_SUBTLE,
                border: `1px solid ${PANEL_BORDER}`,
                borderRadius: 10,
                padding: '16px 22px',
                fontFamily: FONT_DISPLAY,
                fontWeight: 700,
                fontSize: 24,
                color: TEXT_PRIMARY,
              }}
            >
              {field.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Step 2 UI: Era filter selection
const ERA_OPTIONS = [
  {
    id: 'all',
    label: 'All Eras',
    years: '1876–Present',
    desc: 'Full MLB history',
    badge: null,
  },
  {
    id: 'classic',
    label: 'Classic Era',
    years: '1900–1969',
    desc: 'Pre-expansion legends',
    badge: null,
  },
  {
    id: 'modern',
    label: 'Modern Era',
    years: '1970–Present',
    desc: 'Free agency era',
    badge: 'FREE',
  },
  {
    id: 'hof',
    label: 'Hall of Fame Only',
    years: 'Any Era',
    desc: 'HOF inductees only',
    badge: 'PREMIUM',
  },
];

const Step2: React.FC<{ frame: number }> = ({ frame }) => {
  const selected = 'all';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {ERA_OPTIONS.map((opt, i) => {
        const itemOpacity = interpolate(
          frame,
          [5 + i * 8, 20 + i * 8],
          [0, 1],
          {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          },
        );
        const isSelected = opt.id === selected;

        return (
          <div
            key={opt.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 20,
              padding: '18px 24px',
              background: isSelected ? `${BRAND_NAVY}55` : SURFACE_SUBTLE,
              border: `1.5px solid ${isSelected ? BRAND_GOLD + '55' : PANEL_BORDER}`,
              borderRadius: 12,
              opacity: itemOpacity,
              boxShadow: isSelected ? `0 0 24px ${BRAND_GOLD}11` : 'none',
            }}
          >
            {/* Radio */}
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                border: `2px solid ${isSelected ? BRAND_GOLD : PANEL_BORDER}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {isSelected && (
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: BRAND_GOLD,
                  }}
                />
              )}
            </div>

            {/* Label */}
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    fontFamily: FONT_DISPLAY,
                    fontWeight: 700,
                    fontSize: 22,
                    color: isSelected ? TEXT_PRIMARY : TEXT_MUTED,
                    letterSpacing: '0.02em',
                  }}
                >
                  {opt.label}
                </div>
                {opt.badge && (
                  <div
                    style={{
                      fontFamily: FONT_MONO,
                      fontSize: 11,
                      fontWeight: 600,
                      color: opt.badge === 'FREE' ? GREEN : BRAND_GOLD,
                      background:
                        opt.badge === 'FREE' ? GREEN + '22' : BRAND_GOLD + '22',
                      border: `1px solid ${opt.badge === 'FREE' ? GREEN + '44' : BRAND_GOLD + '44'}`,
                      borderRadius: 4,
                      padding: '2px 8px',
                      letterSpacing: '0.08em',
                    }}
                  >
                    {opt.badge}
                  </div>
                )}
              </div>
              <div
                style={{
                  fontFamily: FONT_BODY,
                  fontSize: 15,
                  color: TEXT_MUTED,
                  marginTop: 3,
                }}
              >
                {opt.years} · {opt.desc}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// Step 3 UI: Draft configuration
const Step3: React.FC<{ frame: number }> = ({ frame }) => {
  const configOpacity = interpolate(frame, [5, 25], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const DRAFT_TYPES = ['Snake', 'Auction', 'Linear'];
  const DRAFT_ORDERS = ['Random', 'Inverse Standings', 'Commissioner Set'];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 28,
        opacity: configOpacity,
      }}
    >
      <div>
        <label
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 600,
            fontSize: 15,
            color: TEXT_MUTED,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            display: 'block',
            marginBottom: 12,
          }}
        >
          Draft Type
        </label>
        <div style={{ display: 'flex', gap: 12 }}>
          {DRAFT_TYPES.map((type, i) => {
            const isSelected = i === 0;
            return (
              <div
                key={type}
                style={{
                  flex: 1,
                  padding: '16px 0',
                  textAlign: 'center',
                  background: isSelected ? BRAND_NAVY : SURFACE_SUBTLE,
                  border: `1.5px solid ${isSelected ? BRAND_GOLD + '55' : PANEL_BORDER}`,
                  borderRadius: 10,
                  fontFamily: FONT_DISPLAY,
                  fontWeight: 700,
                  fontSize: 20,
                  color: isSelected ? BRAND_GOLD_LIGHT : TEXT_MUTED,
                  letterSpacing: '0.04em',
                }}
              >
                {type}
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <label
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 600,
            fontSize: 15,
            color: TEXT_MUTED,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            display: 'block',
            marginBottom: 12,
          }}
        >
          Draft Order
        </label>
        <div style={{ display: 'flex', gap: 12 }}>
          {DRAFT_ORDERS.map((order, i) => {
            const isSelected = i === 0;
            return (
              <div
                key={order}
                style={{
                  flex: 1,
                  padding: '14px 16px',
                  textAlign: 'center',
                  background: isSelected ? BRAND_NAVY : SURFACE_SUBTLE,
                  border: `1.5px solid ${isSelected ? BRAND_GOLD + '55' : PANEL_BORDER}`,
                  borderRadius: 10,
                  fontFamily: FONT_BODY,
                  fontSize: 16,
                  color: isSelected ? TEXT_PRIMARY : TEXT_MUTED,
                }}
              >
                {order}
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <label
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 600,
            fontSize: 15,
            color: TEXT_MUTED,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            display: 'block',
            marginBottom: 12,
          }}
        >
          Draft Date
        </label>
        <div
          style={{
            background: SURFACE_SUBTLE,
            border: `1px solid ${PANEL_BORDER}`,
            borderRadius: 10,
            padding: '16px 22px',
            fontFamily: FONT_DISPLAY,
            fontWeight: 700,
            fontSize: 22,
            color: TEXT_PRIMARY,
          }}
        >
          Saturday, May 3rd · 7:00 PM EST
        </div>
      </div>
    </div>
  );
};

export const CreateLeagueScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const sceneIn = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const exitOpacity = interpolate(frame, [300, 330], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Which step is active? Step changes every STEP_DURATION frames
  const currentStep = Math.min(
    Math.floor(frame / STEP_DURATION),
    STEPS.length - 1,
  );
  const stepFrame = frame - currentStep * STEP_DURATION;

  const stepData = STEPS[currentStep];

  // Step indicator transitions
  const headerY = spring({
    frame: stepFrame,
    fps,
    from: -20,
    to: 0,
    config: { damping: 35, stiffness: 260 },
  });

  const contentY = spring({
    frame: stepFrame - 5,
    fps,
    from: 30,
    to: 0,
    config: { damping: 32, stiffness: 220 },
  });

  const contentOpacity = interpolate(stepFrame, [0, 18], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        background: BG_DARK,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: sceneIn * exitOpacity,
      }}
    >
      {/* Left sidebar: section context */}
      <div
        style={{
          width: 380,
          height: '100%',
          background: SURFACE_SUBTLE,
          borderRight: `1px solid ${PANEL_BORDER}`,
          display: 'flex',
          flexDirection: 'column',
          padding: '80px 48px',
          gap: 12,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 700,
            fontSize: 13,
            color: BRAND_GOLD,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            marginBottom: 32,
          }}
        >
          Create League
        </div>

        {STEPS.map((s, i) => {
          const isActive = i === currentStep;
          const isDone = i < currentStep;
          const stepOpacity = interpolate(frame, [i * 8, i * 8 + 15], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });

          return (
            <div
              key={s.step}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                padding: '16px 20px',
                borderRadius: 10,
                background: isActive ? `${BRAND_NAVY}55` : 'transparent',
                border: isActive
                  ? `1px solid ${BRAND_GOLD}33`
                  : '1px solid transparent',
                opacity: stepOpacity,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: isDone
                    ? BRAND_GOLD + '33'
                    : isActive
                      ? BRAND_NAVY
                      : SURFACE_CARD,
                  border: `2px solid ${isDone ? BRAND_GOLD : isActive ? BRAND_GOLD + '55' : PANEL_BORDER}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {isDone ? (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M3 8l4 4 6-7"
                      stroke={BRAND_GOLD}
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  <span
                    style={{
                      fontFamily: FONT_DISPLAY,
                      fontWeight: 700,
                      fontSize: 15,
                      color: isActive ? BRAND_GOLD_LIGHT : TEXT_MUTED,
                    }}
                  >
                    {s.step}
                  </span>
                )}
              </div>
              <div>
                <div
                  style={{
                    fontFamily: FONT_DISPLAY,
                    fontWeight: 700,
                    fontSize: 17,
                    color: isActive ? TEXT_PRIMARY : TEXT_MUTED,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  {s.title}
                </div>
                <div
                  style={{
                    fontFamily: FONT_BODY,
                    fontSize: 13,
                    color: TEXT_MUTED,
                    marginTop: 2,
                  }}
                >
                  {s.subtitle}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main content area */}
      <div
        style={{
          flex: 1,
          padding: '80px 80px',
          display: 'flex',
          flexDirection: 'column',
          gap: 40,
          overflow: 'hidden',
        }}
      >
        {/* Step header */}
        <div style={{ transform: `translateY(${headerY}px)` }}>
          <div
            style={{
              fontFamily: FONT_DISPLAY,
              fontWeight: 600,
              fontSize: 13,
              color: BRAND_GOLD,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              marginBottom: 8,
            }}
          >
            Step {stepData.step} of {STEPS.length}
          </div>
          <div
            style={{
              fontFamily: FONT_DISPLAY,
              fontWeight: 800,
              fontSize: 52,
              color: TEXT_PRIMARY,
              textTransform: 'uppercase',
              letterSpacing: '0.02em',
              lineHeight: 1,
            }}
          >
            {stepData.title}
          </div>
          <div
            style={{
              fontFamily: FONT_BODY,
              fontSize: 20,
              color: TEXT_MUTED,
              marginTop: 10,
            }}
          >
            {stepData.subtitle}
          </div>
        </div>

        {/* Step content */}
        <div
          style={{
            transform: `translateY(${contentY}px)`,
            opacity: contentOpacity,
            flex: 1,
          }}
        >
          {currentStep === 0 && <Step1 frame={stepFrame} />}
          {currentStep === 1 && <Step2 frame={stepFrame} />}
          {currentStep === 2 && <Step3 frame={stepFrame} />}
        </div>

        {/* Next button (appears near end of each step) */}
        {stepFrame > 75 && currentStep < STEPS.length - 1 && (
          <div
            style={{
              opacity: interpolate(stepFrame, [75, 90], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              }),
              alignSelf: 'flex-end',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                background: `linear-gradient(135deg, ${BRAND_NAVY}, ${BRAND_NAVY_LIGHT})`,
                border: `1px solid ${BRAND_GOLD}44`,
                borderRadius: 10,
                padding: '14px 28px',
                cursor: 'pointer',
              }}
            >
              <span
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontWeight: 700,
                  fontSize: 18,
                  color: TEXT_PRIMARY,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                }}
              >
                Continue
              </span>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path
                  d="M4 9h10M10 5l4 4-4 4"
                  stroke={BRAND_GOLD}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
        )}

        {/* Final: Create League button */}
        {currentStep === 2 && stepFrame > 75 && (
          <div
            style={{
              opacity: interpolate(stepFrame, [75, 90], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              }),
              alignSelf: 'flex-end',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                background: `linear-gradient(135deg, ${BRAND_GOLD}, ${BRAND_GOLD_LIGHT})`,
                borderRadius: 10,
                padding: '16px 36px',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path
                  d="M10 2l2.4 6.4H18l-5 3.6 1.9 6L10 14.4 5.1 18l1.9-6L2 8.4h5.6L10 2z"
                  fill={BG_DARK}
                />
              </svg>
              <span
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontWeight: 800,
                  fontSize: 20,
                  color: BG_DARK,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                }}
              >
                Create League
              </span>
            </div>
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
