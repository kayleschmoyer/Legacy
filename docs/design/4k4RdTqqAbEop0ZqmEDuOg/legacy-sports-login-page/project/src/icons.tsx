// Icon components used by the login route.
import * as React from 'react';

export const GoogleG: React.FC = () => (
  <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
    <path
      fill="#FFC107"
      d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"
    />
    <path
      fill="#FF3D00"
      d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
    />
    <path
      fill="#4CAF50"
      d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
    />
    <path
      fill="#1976D2"
      d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.2 5.2C41 35 44 30 44 24c0-1.3-.1-2.3-.4-3.5z"
    />
  </svg>
);

export const DiscordMark: React.FC = () => (
  <svg width="20" height="16" viewBox="0 0 71 55" aria-hidden="true">
    <path
      fill="#fff"
      d="M60.1 4.9A58.5 58.5 0 0 0 45.4.4a.2.2 0 0 0-.2.1 40.8 40.8 0 0 0-1.8 3.7 54 54 0 0 0-16.2 0A37.5 37.5 0 0 0 25.4.5a.2.2 0 0 0-.2-.1 58.4 58.4 0 0 0-14.7 4.5.2.2 0 0 0-.1.1C1.2 18.7-1.4 32.1.1 45.3a.2.2 0 0 0 .1.2 58.9 58.9 0 0 0 17.7 9 .2.2 0 0 0 .3-.1 42 42 0 0 0 3.6-5.9.2.2 0 0 0-.1-.3 38.8 38.8 0 0 1-5.5-2.6.2.2 0 0 1 0-.4l1.1-.8a.2.2 0 0 1 .2 0 42 42 0 0 0 35.6 0 .2.2 0 0 1 .2 0l1.1.8a.2.2 0 0 1 0 .4 36.4 36.4 0 0 1-5.5 2.6.2.2 0 0 0-.1.3 47 47 0 0 0 3.6 5.9.2.2 0 0 0 .3.1 58.7 58.7 0 0 0 17.7-9 .2.2 0 0 0 .1-.2c1.8-15.3-2.3-28.6-9.8-40.3a.2.2 0 0 0-.1-.1zM23.7 37.3c-3.5 0-6.4-3.2-6.4-7.1 0-4 2.8-7.2 6.4-7.2 3.6 0 6.5 3.2 6.4 7.2 0 3.9-2.8 7.1-6.4 7.1zm23.6 0c-3.5 0-6.4-3.2-6.4-7.1 0-4 2.8-7.2 6.4-7.2 3.6 0 6.5 3.2 6.4 7.2 0 3.9-2.8 7.1-6.4 7.1z"
    />
  </svg>
);

export const SecureIcon: React.FC = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 32 32"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M16 3 6 7v9c0 6.1 4.3 11.5 10 13 5.7-1.5 10-6.9 10-13V7l-10-4z" />
    <path d="m11 16 3.5 3.5L21 13" stroke="#C5A55A" />
  </svg>
);

interface StadiumArcsProps {
  style?: React.CSSProperties;
}

// Abstract stadium-arc backdrop: concentric navy arcs evoking the outfield
// wall under stadium lights, with a single seam-red accent. Meant to be
// placed large behind the CTA copy — reads as atmosphere, not illustration.
export const StadiumArcs: React.FC<StadiumArcsProps> = ({ style }) => (
  <svg
    viewBox="0 0 800 600"
    preserveAspectRatio="xMidYMid slice"
    style={style}
    aria-hidden="true"
  >
    <defs>
      <radialGradient id="ll-lamp" cx="50%" cy="110%" r="75%">
        <stop offset="0%" stopColor="#C5A55A" stopOpacity="0.16" />
        <stop offset="40%" stopColor="#1B3A5C" stopOpacity="0.10" />
        <stop offset="100%" stopColor="#0A0F1A" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="ll-arc-stroke" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#2C4A7C" stopOpacity="0.35" />
        <stop offset="100%" stopColor="#2C4A7C" stopOpacity="0.05" />
      </linearGradient>
    </defs>
    {/* Ambient stadium-light wash from below */}
    <rect width="800" height="600" fill="url(#ll-lamp)" />
    {/* Concentric outfield arcs — centered well below the viewBox so
        they pass through as gentle curves without terminating on any edge. */}
    <g fill="none" stroke="url(#ll-arc-stroke)" strokeWidth="1">
      <path d="M -200 900 A 760 760 0 0 1 1000 900" />
      <path d="M -140 900 A 680 680 0 0 1 940 900" />
      <path d="M -80 900 A 600 600 0 0 1 880 900" />
      <path d="M -20 900 A 520 520 0 0 1 820 900" />
      <path d="M 40 900 A 440 440 0 0 1 760 900" />
    </g>
    {/* Seam-red pennant accent — a single confident stroke */}
    <path
      d="M -80 860 A 600 600 0 0 1 880 860"
      fill="none"
      stroke="#C41E3A"
      strokeOpacity="0.45"
      strokeWidth="1.5"
      strokeDasharray="2 10"
      strokeLinecap="round"
    />
  </svg>
);
