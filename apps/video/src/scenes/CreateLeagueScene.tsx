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
  GREEN,
  PANEL_BORDER,
  SURFACE_CARD,
  SURFACE_PANEL,
  SURFACE_SUBTLE,
  TEXT_MUTED,
  TEXT_PRIMARY,
} from '../theme';

// Each step occupies 110 frames (~3.7 s at 30 fps)
const STEP_DURATION = 110;

const STEPS = [
  {
    step: 1,
    title: 'Basic Settings',
    subtitle: 'Name your league and configure its roster',
  },
  {
    step: 2,
    title: 'Era & History',
    subtitle: 'Choose which slice of MLB history to draft from',
  },
  {
    step: 3,
    title: 'Draft Settings',
    subtitle: 'Configure how your draft will run',
  },
];

// ─── Reusable button-group — mirrors MockDraftPage / LeagueCreatePage pattern ──

const ButtonGroup: React.FC<{
  label: string;
  options: string[];
  selectedIndex: number;
  frame: number;
  delay?: number;
}> = ({ label, options, selectedIndex, frame, delay = 0 }) => {
  const opacity = interpolate(frame, [delay, delay + 15], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div style={{ opacity }}>
      <div
        style={{
          fontFamily: FONT_DISPLAY,
          fontWeight: 600,
          fontSize: 12,
          color: TEXT_MUTED,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          marginBottom: 10,
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {options.map((opt, i) => {
          const isSelected = i === selectedIndex;
          return (
            <div
              key={opt}
              style={{
                flex: 1,
                padding: '12px 0',
                textAlign: 'center',
                borderRadius: 10,
                border: `2px solid ${isSelected ? BRAND_GOLD : PANEL_BORDER}`,
                background: isSelected ? BRAND_GOLD + '22' : 'transparent',
                fontFamily: FONT_DISPLAY,
                fontWeight: isSelected ? 700 : 400,
                fontSize: 18,
                color: isSelected ? TEXT_PRIMARY : TEXT_MUTED,
                letterSpacing: '0.02em',
              }}
            >
              {opt}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── Step 1: Basic settings ──────────────────────────────────────────────────

const Step1: React.FC<{ frame: number }> = ({ frame }) => {
  const LEAGUE_NAME = 'The Timeless Classic League';
  const charsVisible = Math.floor(
    interpolate(frame, [15, 65], [0, LEAGUE_NAME.length], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }),
  );
  const caretBlink = Math.floor(frame / 15) % 2 === 0;

  const inputOpacity = interpolate(frame, [5, 20], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* League name input */}
      <div style={{ opacity: inputOpacity }}>
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 600,
            fontSize: 12,
            color: TEXT_MUTED,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            marginBottom: 10,
          }}
        >
          League Name
        </div>
        <div
          style={{
            background: SURFACE_SUBTLE,
            border: `1.5px solid ${BRAND_GOLD}66`,
            borderRadius: 10,
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            boxShadow: `0 0 20px ${BRAND_GOLD}11`,
          }}
        >
          <span
            style={{ fontFamily: FONT_BODY, fontSize: 22, color: TEXT_PRIMARY }}
          >
            {LEAGUE_NAME.slice(0, charsVisible)}
          </span>
          {charsVisible < LEAGUE_NAME.length && caretBlink && (
            <span
              style={{
                width: 2,
                height: 24,
                background: BRAND_GOLD,
                display: 'inline-block',
              }}
            />
          )}
        </div>
      </div>

      {/* Number of teams */}
      <ButtonGroup
        label="Number of Teams"
        options={['4', '6', '8', '10', '12']}
        selectedIndex={3}
        frame={frame}
        delay={20}
      />

      {/* Roster size */}
      <ButtonGroup
        label="Roster Size"
        options={['5', '10', '15', '23']}
        selectedIndex={3}
        frame={frame}
        delay={32}
      />

      {/* Visibility — Private / Public toggle */}
      <div
        style={{
          opacity: interpolate(frame, [44, 58], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
        }}
      >
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 600,
            fontSize: 12,
            color: TEXT_MUTED,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            marginBottom: 10,
          }}
        >
          Visibility
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { label: 'Private', icon: '⬛' },
            { label: 'Public', icon: '⬜' },
          ].map((opt, i) => {
            const isSelected = i === 0;
            return (
              <div
                key={opt.label}
                style={{
                  flex: 1,
                  padding: '12px 0',
                  textAlign: 'center',
                  borderRadius: 10,
                  border: `2px solid ${isSelected ? BRAND_NAVY + 'CC' : PANEL_BORDER}`,
                  background: isSelected ? BRAND_NAVY + '55' : 'transparent',
                  fontFamily: FONT_DISPLAY,
                  fontWeight: isSelected ? 700 : 400,
                  fontSize: 18,
                  color: isSelected ? TEXT_PRIMARY : TEXT_MUTED,
                }}
              >
                {opt.label}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ─── Step 2: Era & History ───────────────────────────────────────────────────

const ERA_OPTIONS = [
  {
    id: 'all',
    label: 'All MLB History',
    years: '1876–Present',
    desc: 'Every player season in the database',
    badge: null as string | null,
  },
  {
    id: 'classic',
    label: 'Classic Era',
    years: '1900–1969',
    desc: 'Pre-expansion legends',
    badge: null as string | null,
  },
  {
    id: 'modern',
    label: 'Modern Era',
    years: '1970–Present',
    desc: 'Free-agency era players',
    badge: 'FREE',
  },
  {
    id: 'hof',
    label: 'Hall of Fame Only',
    years: 'Any Era',
    desc: 'Only HOF inductees',
    badge: 'PREMIUM',
  },
];

const Step2: React.FC<{ frame: number }> = ({ frame }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    {ERA_OPTIONS.map((opt, i) => {
      const isSelected = opt.id === 'all';
      const itemOpacity = interpolate(
        frame,
        [5 + i * 10, 20 + i * 10],
        [0, 1],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
      );

      return (
        <div
          key={opt.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            padding: '16px 20px',
            background: isSelected ? BRAND_NAVY + '44' : SURFACE_SUBTLE,
            border: `1.5px solid ${isSelected ? BRAND_GOLD + '66' : PANEL_BORDER}`,
            borderRadius: 12,
            opacity: itemOpacity,
            boxShadow: isSelected ? `0 0 20px ${BRAND_GOLD}11` : 'none',
          }}
        >
          {/* Radio */}
          <div
            style={{
              width: 20,
              height: 20,
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
                  width: 9,
                  height: 9,
                  borderRadius: '50%',
                  background: BRAND_GOLD,
                }}
              />
            )}
          </div>

          {/* Label + meta */}
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontWeight: 700,
                  fontSize: 20,
                  color: isSelected ? TEXT_PRIMARY : TEXT_MUTED,
                }}
              >
                {opt.label}
              </div>
              <div
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: 12,
                  color: TEXT_MUTED,
                }}
              >
                {opt.years}
              </div>
              {opt.badge && (
                <div
                  style={{
                    fontFamily: FONT_MONO,
                    fontSize: 10,
                    fontWeight: 600,
                    color: opt.badge === 'FREE' ? GREEN : BRAND_GOLD,
                    background:
                      opt.badge === 'FREE' ? GREEN + '22' : BRAND_GOLD + '22',
                    border: `1px solid ${opt.badge === 'FREE' ? GREEN + '44' : BRAND_GOLD + '44'}`,
                    borderRadius: 4,
                    padding: '2px 7px',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                  }}
                >
                  {opt.badge}
                </div>
              )}
            </div>
            <div
              style={{
                fontFamily: FONT_BODY,
                fontSize: 14,
                color: TEXT_MUTED,
                marginTop: 3,
              }}
            >
              {opt.desc}
            </div>
          </div>
        </div>
      );
    })}
  </div>
);

// ─── Step 3: Draft settings ──────────────────────────────────────────────────

const Step3: React.FC<{ frame: number }> = ({ frame }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
    <ButtonGroup
      label="Draft Type"
      options={['Snake', 'Auction', 'Linear']}
      selectedIndex={0}
      frame={frame}
      delay={5}
    />
    <ButtonGroup
      label="Draft Order"
      options={['Random', 'Inv. Standings', 'Comm. Set']}
      selectedIndex={0}
      frame={frame}
      delay={18}
    />

    {/* Draft date */}
    <div
      style={{
        opacity: interpolate(frame, [28, 42], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        }),
      }}
    >
      <div
        style={{
          fontFamily: FONT_DISPLAY,
          fontWeight: 600,
          fontSize: 12,
          color: TEXT_MUTED,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          marginBottom: 10,
        }}
      >
        Draft Date
      </div>
      <div
        style={{
          background: SURFACE_SUBTLE,
          border: `1px solid ${PANEL_BORDER}`,
          borderRadius: 10,
          padding: '16px 20px',
          fontFamily: FONT_DISPLAY,
          fontWeight: 600,
          fontSize: 20,
          color: TEXT_PRIMARY,
        }}
      >
        Saturday, May 3rd · 7:00 PM EST
      </div>
    </div>
  </div>
);

// ─── Main scene ──────────────────────────────────────────────────────────────

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

  const currentStep = Math.min(
    Math.floor(frame / STEP_DURATION),
    STEPS.length - 1,
  );
  const stepFrame = frame - currentStep * STEP_DURATION;
  const stepData = STEPS[currentStep];

  // Card slides up on step transition
  const cardY = spring({
    frame: stepFrame,
    fps,
    from: 20,
    to: 0,
    config: { damping: 35, stiffness: 260 },
  });
  const contentOpacity = interpolate(stepFrame, [0, 15], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const showContinue = stepFrame > 75 && currentStep < STEPS.length - 1;
  const showCreate = currentStep === 2 && stepFrame > 75;
  const btnOpacity = interpolate(stepFrame, [75, 90], [0, 1], {
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
        padding: '60px 80px',
        gap: 28,
        opacity: sceneIn * exitOpacity,
      }}
    >
      {/* Page header — matches LeagueCreatePage title area */}
      <div
        style={{
          textAlign: 'center',
          opacity: interpolate(frame, [0, 18], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
        }}
      >
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 700,
            fontSize: 14,
            color: BRAND_GOLD,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            marginBottom: 8,
          }}
        >
          New League
        </div>
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 800,
            fontSize: 52,
            color: TEXT_PRIMARY,
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
            lineHeight: 1,
          }}
        >
          Create a League
        </div>
      </div>

      {/* Settings card — mirrors the LeagueCreatePage centered card */}
      <div
        style={{
          width: 820,
          background: SURFACE_PANEL,
          border: `1px solid ${PANEL_BORDER}`,
          borderRadius: 16,
          padding: '36px 44px',
          display: 'flex',
          flexDirection: 'column',
          gap: 28,
          transform: `translateY(${cardY}px)`,
          opacity: contentOpacity,
        }}
      >
        {/* Step progress indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {STEPS.map((s, i) => {
            const isActive = i === currentStep;
            const isDone = i < currentStep;
            return (
              <div
                key={s.step}
                style={{
                  width: isActive ? 32 : 8,
                  height: 8,
                  borderRadius: 4,
                  background: isDone
                    ? BRAND_GOLD + '66'
                    : isActive
                      ? BRAND_GOLD
                      : SURFACE_CARD,
                }}
              />
            );
          })}
          <div
            style={{
              marginLeft: 8,
              fontFamily: FONT_DISPLAY,
              fontWeight: 600,
              fontSize: 13,
              color: BRAND_GOLD,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
            }}
          >
            Step {stepData.step} of {STEPS.length} — {stepData.title}
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: PANEL_BORDER }} />

        {/* Step content */}
        {currentStep === 0 && <Step1 frame={stepFrame} />}
        {currentStep === 1 && <Step2 frame={stepFrame} />}
        {currentStep === 2 && <Step3 frame={stepFrame} />}

        {/* Action buttons — Cancel + Continue / Create League */}
        {(showContinue || showCreate) && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 12,
              borderTop: `1px solid ${PANEL_BORDER}`,
              paddingTop: 20,
              opacity: btnOpacity,
            }}
          >
            <div
              style={{
                padding: '12px 24px',
                borderRadius: 10,
                border: `1px solid ${PANEL_BORDER}`,
                background: 'transparent',
                fontFamily: FONT_DISPLAY,
                fontWeight: 600,
                fontSize: 16,
                color: TEXT_MUTED,
                letterSpacing: '0.04em',
              }}
            >
              Cancel
            </div>

            {showContinue && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '12px 28px',
                  borderRadius: 10,
                  background: BRAND_NAVY,
                  border: `1px solid ${BRAND_GOLD}44`,
                  fontFamily: FONT_DISPLAY,
                  fontWeight: 700,
                  fontSize: 16,
                  color: TEXT_PRIMARY,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                }}
              >
                Continue
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M3 8h10M9 4l4 4-4 4"
                    stroke={BRAND_GOLD}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            )}

            {showCreate && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '12px 32px',
                  borderRadius: 10,
                  background: `linear-gradient(135deg, ${BRAND_GOLD}, ${BRAND_GOLD_LIGHT})`,
                  fontFamily: FONT_DISPLAY,
                  fontWeight: 800,
                  fontSize: 18,
                  color: BG_DARK,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                }}
              >
                Create League
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M3 8h10M9 4l4 4-4 4"
                    stroke={BG_DARK}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            )}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
