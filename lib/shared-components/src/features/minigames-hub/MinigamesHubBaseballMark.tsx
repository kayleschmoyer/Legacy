/**
 * MinigamesHubBaseballMark (web) — the Minigames Hub hero's decorative
 * baseball art, drawn as raw `<svg>`.
 *
 * The `.native.tsx` sibling renders the identical artwork (gradients,
 * seams, stitches) via `react-native-svg` — React Native has no view config
 * for lowercase host tags, so the two platforms cannot share one file (same
 * split as `GameRoomGlyphs.tsx` / `SportGlyph.tsx`). Split out of
 * `MinigamesHub.tsx` so the rest of the hub layout could be unified into one
 * breakpoint-driven component (LS-9058).
 */
import React from 'react';

export const MinigamesHubBaseballMark: React.FC = () => (
  <svg
    viewBox="0 0 240 240"
    fill="none"
    style={{
      width: '100%',
      maxWidth: 200,
      filter: 'drop-shadow(0 12px 32px rgba(0,0,0,0.5))',
      transform: 'rotate(-8deg)',
    }}
    aria-hidden="true"
  >
    <defs>
      <radialGradient id="mg-ballGrad" cx="36%" cy="30%" r="72%">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="45%" stopColor="#F4EEDA" />
        <stop offset="100%" stopColor="#A89A76" />
      </radialGradient>
      <radialGradient id="mg-ballShine" cx="32%" cy="26%" r="26%">
        <stop offset="0%" stopColor="rgba(255,255,255,0.85)" />
        <stop offset="100%" stopColor="rgba(255,255,255,0)" />
      </radialGradient>
      <radialGradient id="mg-ballShadow" cx="70%" cy="78%" r="50%">
        <stop offset="0%" stopColor="rgba(40,30,15,0.28)" />
        <stop offset="100%" stopColor="rgba(40,30,15,0)" />
      </radialGradient>
    </defs>
    <ellipse cx="120" cy="222" rx="82" ry="8" fill="rgba(0,0,0,0.35)" />
    <circle cx="120" cy="118" r="100" fill="url(#mg-ballGrad)" />
    <circle cx="120" cy="118" r="100" fill="url(#mg-ballShadow)" />
    <circle cx="120" cy="118" r="100" fill="url(#mg-ballShine)" />
    <circle
      cx="120"
      cy="118"
      r="100"
      fill="none"
      stroke="#6B5F47"
      strokeWidth="1"
      opacity="0.35"
    />
    {/* Left seam */}
    <path
      d="M60 38 C95 78 95 158 60 198"
      stroke="#B01E37"
      strokeWidth="1.6"
      fill="none"
      strokeLinecap="round"
      opacity="0.9"
    />
    {/* Right seam */}
    <path
      d="M180 38 C145 78 145 158 180 198"
      stroke="#B01E37"
      strokeWidth="1.6"
      fill="none"
      strokeLinecap="round"
      opacity="0.9"
    />
    {/* Left stitches */}
    {[0.09, 0.18, 0.27, 0.36, 0.45, 0.55, 0.64, 0.73, 0.82, 0.91].map(
      (t, i) => {
        const p0 = [60, 38];
        const p1 = [95, 78];
        const p2 = [95, 158];
        const p3 = [60, 198];
        const u = 1 - t;
        const x =
          u * u * u * p0[0] +
          3 * u * u * t * p1[0] +
          3 * u * t * t * p2[0] +
          t * t * t * p3[0];
        const y =
          u * u * u * p0[1] +
          3 * u * u * t * p1[1] +
          3 * u * t * t * p2[1] +
          t * t * t * p3[1];
        const dir = i % 2 === 0 ? 1 : -1;
        return (
          <line
            key={`ls-${i}`}
            x1={x - 5}
            y1={y - 3 * dir}
            x2={x + 5}
            y2={y + 3 * dir}
            stroke="#8B1A2B"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        );
      },
    )}
    {/* Right stitches */}
    {[0.09, 0.18, 0.27, 0.36, 0.45, 0.55, 0.64, 0.73, 0.82, 0.91].map(
      (t, i) => {
        const p0 = [180, 38];
        const p1 = [145, 78];
        const p2 = [145, 158];
        const p3 = [180, 198];
        const u = 1 - t;
        const x =
          u * u * u * p0[0] +
          3 * u * u * t * p1[0] +
          3 * u * t * t * p2[0] +
          t * t * t * p3[0];
        const y =
          u * u * u * p0[1] +
          3 * u * u * t * p1[1] +
          3 * u * t * t * p2[1] +
          t * t * t * p3[1];
        const dir = i % 2 === 0 ? 1 : -1;
        return (
          <line
            key={`rs-${i}`}
            x1={x - 5}
            y1={y - 3 * dir}
            x2={x + 5}
            y2={y + 3 * dir}
            stroke="#8B1A2B"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        );
      },
    )}
  </svg>
);

export default MinigamesHubBaseballMark;
