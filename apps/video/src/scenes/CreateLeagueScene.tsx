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
  GLASS_BORDER,
  OUTLINE_DEFAULT,
  OUTLINE_SUBTLE,
  SURFACE_CARD,
  SURFACE_RAISED,
  TEXT_MUTED,
  TEXT_PRIMARY,
} from '../theme';

// ─── Small field components ──────────────────────────────────────────────────

const FieldInput: React.FC<{ label: string; value: string }> = ({
  label,
  value,
}) => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      marginBottom: 22,
    }}
  >
    <div
      style={{
        fontFamily: FONT_DISPLAY,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.14em',
        fontSize: 24,
        color: TEXT_MUTED,
      }}
    >
      {label}
    </div>
    <div
      style={{
        background: BG_DARK,
        border: `1px solid ${OUTLINE_DEFAULT}`,
        borderRadius: 6,
        padding: '14px 16px',
        fontFamily: FONT_BODY,
        color: TEXT_PRIMARY,
        fontSize: 26,
      }}
    >
      {value}
    </div>
  </div>
);

const Chip: React.FC<{ label: string; on?: boolean }> = ({
  label,
  on = false,
}) => (
  <div
    style={{
      fontFamily: FONT_DISPLAY,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.14em',
      fontSize: 24,
      padding: '12px 22px',
      borderRadius: 9999,
      border: `1px solid ${on ? 'rgba(197,165,90,0.55)' : OUTLINE_DEFAULT}`,
      color: on ? BRAND_GOLD_LIGHT : TEXT_MUTED,
      background: on ? 'rgba(197,165,90,0.18)' : SURFACE_RAISED,
    }}
  >
    {label}
  </div>
);

const ToggleRow: React.FC<{ label: string; on?: boolean; last?: boolean }> = ({
  label,
  on = false,
  last = false,
}) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 0',
      borderBottom: last ? 'none' : `1px solid ${OUTLINE_SUBTLE}`,
    }}
  >
    <div
      style={{
        fontFamily: FONT_BODY,
        color: TEXT_MUTED,
        fontSize: 24,
      }}
    >
      {label}
    </div>
    {/* Toggle switch */}
    <div
      style={{
        width: 52,
        height: 28,
        borderRadius: 14,
        background: on ? BRAND_GOLD : SURFACE_RAISED,
        border: `1px solid ${on ? '#A68B3E' : OUTLINE_DEFAULT}`,
        position: 'relative',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 3,
          left: on ? 27 : 3,
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: '#fff',
        }}
      />
    </div>
  </div>
);

// ─── Step cards ───────────────────────────────────────────────────────────────

const Step1: React.FC = () => (
  <>
    <FieldInput label="League Name" value="The Old Guard" />
    <FieldInput label="Teams" value="12 teams · Head-to-head" />
    <FieldInput label="Season Length" value="22 weeks · Playoffs in W19" />
  </>
);

const Step2: React.FC = () => (
  <>
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        marginBottom: 22,
      }}
    >
      <div
        style={{
          fontFamily: FONT_DISPLAY,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.14em',
          fontSize: 24,
          color: TEXT_MUTED,
        }}
      >
        Eras Included
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {[
          'Dead-ball',
          'Live-ball',
          'Integration',
          'Expansion',
          'Steroid',
          'Modern',
        ].map((era) => (
          <Chip key={era} label={era} on />
        ))}
      </div>
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div
        style={{
          fontFamily: FONT_DISPLAY,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.14em',
          fontSize: 24,
          color: TEXT_MUTED,
          marginBottom: 4,
        }}
      >
        Filters
      </div>
      <ToggleRow label="Hall of Fame only" on={false} />
      <ToggleRow label="All-Star seasons only" on />
      <ToggleRow label="Pre-1947 included" on last />
    </div>
  </>
);

const Step3: React.FC = () => (
  <>
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        marginBottom: 22,
      }}
    >
      <div
        style={{
          fontFamily: FONT_DISPLAY,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.14em',
          fontSize: 24,
          color: TEXT_MUTED,
        }}
      >
        Draft Type
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <Chip label="Snake" on />
        <Chip label="Auction" />
        <Chip label="Linear" />
      </div>
    </div>
    <FieldInput label="Pick Timer" value="90 seconds per pick" />
    <FieldInput label="Date" value="Fri, Apr 12 · 8:00 PM ET" />
  </>
);

// ─── Main scene ───────────────────────────────────────────────────────────────

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

  const headerY = spring({
    frame,
    fps,
    from: -30,
    to: 0,
    config: { damping: 30, stiffness: 200 },
  });

  const STEPS = [
    {
      num: 'STEP 01',
      title: 'Basic Settings',
      active: true,
      delay: 15,
      content: <Step1 />,
    },
    {
      num: 'STEP 02',
      title: 'Era & History',
      active: false,
      delay: 25,
      content: <Step2 />,
    },
    {
      num: 'STEP 03',
      title: 'Draft Settings',
      active: false,
      delay: 35,
      content: <Step3 />,
    },
  ];

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
        padding: '80px 100px',
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

      {/* Header */}
      <div
        style={{
          transform: `translateY(${headerY}px)`,
          marginBottom: 52,
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
            marginBottom: 14,
          }}
        >
          Set up a league in three steps
        </div>
        <h2
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 800,
            fontSize: 84,
            color: TEXT_PRIMARY,
            lineHeight: 0.95,
            letterSpacing: '-0.02em',
            margin: 0,
          }}
        >
          Your league. <span style={{ color: BRAND_GOLD }}>Your rules.</span>
        </h2>
      </div>

      {/* 3-step grid — all steps visible simultaneously */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 28,
          flex: 1,
        }}
      >
        {STEPS.map((step) => {
          const cardOpacity = interpolate(
            frame,
            [step.delay, step.delay + 16],
            [0, 1],
            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
          );
          const cardY = spring({
            frame: frame - step.delay,
            fps,
            from: 30,
            to: 0,
            config: { damping: 28, stiffness: 200 },
          });

          return (
            <div
              key={step.num}
              style={{
                background: step.active
                  ? `linear-gradient(180deg, rgba(197,165,90,0.08), transparent 50%), ${SURFACE_CARD}`
                  : SURFACE_CARD,
                border: `1px solid ${step.active ? 'rgba(197,165,90,0.55)' : GLASS_BORDER}`,
                borderRadius: 20,
                padding: 36,
                display: 'flex',
                flexDirection: 'column',
                boxShadow: step.active
                  ? '0 0 0 1px rgba(197,165,90,0.35), 0 6px 24px rgba(197,165,90,0.25)'
                  : 'none',
                opacity: cardOpacity,
                transform: `translateY(${cardY}px)`,
              }}
            >
              {/* Step number */}
              <div
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontWeight: 800,
                  fontSize: 28,
                  color: BRAND_GOLD,
                  letterSpacing: '0.14em',
                  marginBottom: 0,
                }}
              >
                {step.num} <span style={{ color: '#6C80BA' }}>/ 03</span>
              </div>

              {/* Title */}
              <h3
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontWeight: 800,
                  fontSize: 40,
                  color: TEXT_PRIMARY,
                  margin: '8px 0 28px 0',
                  lineHeight: 1.05,
                  letterSpacing: '-0.01em',
                }}
              >
                {step.title}
              </h3>

              {/* Content */}
              {step.content}
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
          opacity: interpolate(frame, [60, 80], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
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
        Scene 04<span style={{ color: '#6C80BA' }}>/</span>Create League
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
          opacity: interpolate(frame, [60, 80], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
        }}
      >
        00:20 — 00:31
      </div>
    </AbsoluteFill>
  );
};
