import React from 'react';
import {
  BG_DARK,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED,
  WHITE,
  withAlpha,
} from '../../utils/colors';

// ─── Public types ────────────────────────────────────────────────────────────

export type BrandIconName =
  // Sport & Domain
  | 'baseball'
  | 'football'
  | 'stats'
  | 'draft'
  | 'live'
  | 'trophy'
  | 'matchup'
  | 'roster'
  | 'trade'
  | 'standings'
  | 'league'
  | 'commissioner'
  | 'announcement'
  | 'secure'
  | 'scoreboard'
  | 'award'
  // Navigation
  | 'home'
  | 'search'
  | 'menu'
  | 'back'
  | 'forward'
  | 'chevron-up'
  | 'chevron-down'
  | 'chevron-left'
  | 'chevron-right'
  | 'close'
  | 'more'
  // Actions
  | 'add'
  | 'edit'
  | 'delete'
  | 'save'
  | 'copy'
  | 'share'
  | 'send'
  | 'refresh'
  | 'undo'
  | 'filter'
  | 'sort'
  | 'shuffle'
  | 'grip'
  | 'link'
  // Status & Feedback
  | 'check'
  | 'check-circle'
  | 'alert'
  | 'info'
  | 'help'
  | 'warning'
  | 'clock'
  | 'timer'
  | 'hourglass'
  | 'zap'
  // People & Social
  | 'user'
  | 'users'
  | 'user-add'
  | 'user-remove'
  | 'bell'
  | 'bell-active'
  | 'message'
  // Content & Data
  | 'calendar'
  | 'book'
  | 'file'
  | 'image'
  | 'tag'
  | 'chart'
  | 'target'
  | 'bar-chart'
  // Security & System
  | 'lock'
  | 'unlock'
  | 'settings'
  | 'eye'
  | 'eye-off'
  | 'globe'
  | 'qr-code'
  // Third-party
  | 'google';

export type BrandIconProps = {
  name: BrandIconName;
  size?: number;
  color?: string;
  accentColor?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
} & (
  | { decorative?: true; title?: string }
  | { decorative: false; title: string }
);

export type BrandIconBadgeProps = {
  name: BrandIconName;
  size?: number;
  iconSize?: number;
  color?: string;
  accentColor?: string;
  background?: string;
  borderColor?: string;
  rounded?: 'circle' | 'square';
  style?: React.CSSProperties;
} & (
  | { decorative?: true; title?: string }
  | { decorative: false; title: string }
);

// ─── Glyph helpers ───────────────────────────────────────────────────────────

type GlyphProps = {
  c: string; // primary color
  a: string; // accent color
  sw: number; // stroke width
};

/** Thinner stroke for internal details */
const thin = (sw: number) => Math.max(sw - 0.4, 1);
/** Slightly thinner stroke */
const mid = (sw: number) => Math.max(sw - 0.2, 1);

// ─── Sport & Domain glyphs ───────────────────────────────────────────────────

function BaseballGlyph({ c, a, sw }: GlyphProps) {
  return (
    <>
      <circle
        cx="16"
        cy="16"
        r="10.5"
        stroke={c}
        strokeWidth={sw}
        fill={withAlpha(c, 0.04)}
      />
      {/* S-curve seams */}
      <path
        d="M11.5 6.5Q7 12 9 16.5Q11 21 11.5 26"
        stroke={a}
        strokeWidth={sw}
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M20.5 6Q25 11 23 15.5Q21 20 20.5 25.5"
        stroke={a}
        strokeWidth={sw}
        strokeLinecap="round"
        fill="none"
      />
      {/* Even stitches — 3 per seam */}
      <path
        d="M8.5 11l1.8 0.8"
        stroke={a}
        strokeWidth={thin(sw)}
        strokeLinecap="round"
      />
      <path
        d="M8.8 16l1.8 0.2"
        stroke={a}
        strokeWidth={thin(sw)}
        strokeLinecap="round"
      />
      <path
        d="M9.5 21l1.6-0.5"
        stroke={a}
        strokeWidth={thin(sw)}
        strokeLinecap="round"
      />
      <path
        d="M21.5 10.5l1.5 0.8"
        stroke={a}
        strokeWidth={thin(sw)}
        strokeLinecap="round"
      />
      <path
        d="M22 15.5l1.5 0.2"
        stroke={a}
        strokeWidth={thin(sw)}
        strokeLinecap="round"
      />
      <path
        d="M21 20.5l1.5-0.5"
        stroke={a}
        strokeWidth={thin(sw)}
        strokeLinecap="round"
      />
    </>
  );
}

function FootballGlyph({ c, a, sw }: GlyphProps) {
  return (
    <>
      <path
        d="M10.3 21.8C7.8 19.25 7.8 14.75 10.3 12.2L13.15 9.35C15.7 6.8 20.3 6.8 22.85 9.35C25.4 11.9 25.4 16.5 22.85 19.05L20 21.9C17.45 24.45 12.85 24.45 10.3 21.8Z"
        fill={withAlpha(c, 0.07)}
        stroke={c}
        strokeWidth={sw}
        strokeLinejoin="round"
      />
      <path
        d="M13.2 18.8L18.8 13.2"
        stroke={c}
        strokeWidth={sw}
        strokeLinecap="round"
      />
      <path
        d="M14.6 17.4H17.4"
        stroke={a}
        strokeWidth={mid(sw)}
        strokeLinecap="round"
      />
      <path
        d="M13.4 16.2H16.2"
        stroke={a}
        strokeWidth={mid(sw)}
        strokeLinecap="round"
      />
      <path
        d="M15.8 14.6H18.6"
        stroke={a}
        strokeWidth={mid(sw)}
        strokeLinecap="round"
      />
    </>
  );
}

function StatsGlyph({ c, a, sw }: GlyphProps) {
  return (
    <>
      <rect
        x="7"
        y="20"
        width="3.5"
        height="5"
        rx="1"
        stroke={c}
        strokeWidth={sw}
        fill={withAlpha(c, 0.06)}
      />
      <rect
        x="12"
        y="16"
        width="3.5"
        height="9"
        rx="1"
        stroke={c}
        strokeWidth={sw}
        fill={withAlpha(c, 0.06)}
      />
      <rect
        x="17"
        y="12"
        width="3.5"
        height="13"
        rx="1"
        stroke={c}
        strokeWidth={sw}
        fill={withAlpha(c, 0.06)}
      />
      <rect
        x="22"
        y="8"
        width="3.5"
        height="17"
        rx="1"
        stroke={a}
        strokeWidth={sw}
        fill={withAlpha(a, 0.1)}
      />
      <path d="M6 25h21" stroke={c} strokeWidth={sw} strokeLinecap="round" />
    </>
  );
}

function DraftGlyph({ c, a, sw }: GlyphProps) {
  return (
    <>
      <path
        d="M16 6.8L22.7 10.2V17.6C22.7 21.4 19.8 24.2 16 25.3C12.2 24.2 9.3 21.4 9.3 17.6V10.2L16 6.8Z"
        fill={withAlpha(BRAND_NAVY_LIGHT, 0.12)}
        stroke={c}
        strokeWidth={sw}
        strokeLinejoin="round"
      />
      <path
        d="M16 11l1.5 3h3.2l-2.5 1.8 1 3.1L16 17.2l-3.2 1.7 1-3.1-2.5-1.8h3.2z"
        fill={a}
      />
    </>
  );
}

function LiveGlyph({ c, a, sw }: GlyphProps) {
  return (
    <>
      <path
        d="M20.2 11.8C22.1 13.7 23.2 16.3 23.2 19.0"
        stroke={a}
        strokeWidth={sw}
        strokeLinecap="round"
      />
      <path
        d="M11.8 11.8C9.9 13.7 8.8 16.3 8.8 19.0"
        stroke={a}
        strokeWidth={sw}
        strokeLinecap="round"
        opacity="0.4"
      />
      <path
        d="M18.3 13.7C19.6 15.0 20.4 16.8 20.4 18.8"
        stroke={c}
        strokeWidth={sw}
        strokeLinecap="round"
      />
      <path
        d="M13.7 13.7C12.4 15.0 11.6 16.8 11.6 18.8"
        stroke={c}
        strokeWidth={sw}
        strokeLinecap="round"
        opacity="0.4"
      />
      <path d="M16 8v2.5" stroke={c} strokeWidth={sw} strokeLinecap="round" />
      <circle cx="16" cy="19.5" r="2.5" fill={a} />
    </>
  );
}

function TrophyGlyph({ c, a, sw }: GlyphProps) {
  return (
    <>
      <path
        d="M11 8h10v7c0 3.5-2 6-5 6s-5-2.5-5-6V8z"
        stroke={c}
        strokeWidth={sw}
        strokeLinejoin="round"
        fill={withAlpha(c, 0.06)}
      />
      <path
        d="M11 10.5C9 10.5 7.5 12.5 7.5 14.5S9 17 11 16.5"
        stroke={c}
        strokeWidth={mid(sw)}
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M21 10.5C23 10.5 24.5 12.5 24.5 14.5S23 17 21 16.5"
        stroke={c}
        strokeWidth={mid(sw)}
        strokeLinecap="round"
        fill="none"
      />
      <path d="M16 21v2.5" stroke={c} strokeWidth={sw} strokeLinecap="round" />
      <path d="M12 24.5h8" stroke={c} strokeWidth={sw} strokeLinecap="round" />
      <path
        d="M16 11l1 2.2h2.3l-1.8 1.3.7 2.2L16 15.5l-2.2 1.2.7-2.2-1.8-1.3H15z"
        fill={a}
      />
    </>
  );
}

function MatchupGlyph({ c, a, sw }: GlyphProps) {
  return (
    <>
      <path
        d="M8.5 24.5Q12 20 16 16Q20 12 23.5 7.5"
        stroke={c}
        strokeWidth={sw + 0.2}
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M23.5 24.5Q20 20 16 16Q12 12 8.5 7.5"
        stroke={c}
        strokeWidth={sw + 0.2}
        strokeLinecap="round"
        fill="none"
      />
      <circle
        cx="8"
        cy="25"
        r="1.4"
        fill={withAlpha(c, 0.4)}
        stroke={c}
        strokeWidth={thin(sw)}
      />
      <circle
        cx="24"
        cy="25"
        r="1.4"
        fill={withAlpha(c, 0.4)}
        stroke={c}
        strokeWidth={thin(sw)}
      />
      <circle
        cx="16"
        cy="16"
        r="2.5"
        stroke={a}
        strokeWidth={mid(sw)}
        fill={withAlpha(a, 0.15)}
      />
    </>
  );
}

function RosterGlyph({ c, sw }: GlyphProps) {
  return (
    <>
      <rect
        x="8"
        y="6"
        width="16"
        height="20"
        rx="2.5"
        stroke={c}
        strokeWidth={sw}
        fill={withAlpha(c, 0.04)}
      />
      <path
        d="M12 12h8"
        stroke={c}
        strokeWidth={thin(sw)}
        strokeLinecap="round"
      />
      <path
        d="M12 16h8"
        stroke={c}
        strokeWidth={thin(sw)}
        strokeLinecap="round"
      />
      <path
        d="M12 20h5"
        stroke={c}
        strokeWidth={thin(sw)}
        strokeLinecap="round"
      />
    </>
  );
}

function TradeGlyph({ c, sw }: GlyphProps) {
  return (
    <>
      <path d="M8 12h12" stroke={c} strokeWidth={sw} strokeLinecap="round" />
      <path
        d="M17 8.5l3.5 3.5-3.5 3.5"
        stroke={c}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M24 20H12" stroke={c} strokeWidth={sw} strokeLinecap="round" />
      <path
        d="M15 16.5L11.5 20l3.5 3.5"
        stroke={c}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </>
  );
}

function StandingsGlyph({ c, a, sw }: GlyphProps) {
  return (
    <>
      <rect
        x="7"
        y="16"
        width="5"
        height="9"
        rx="1"
        stroke={c}
        strokeWidth={sw}
        fill={withAlpha(c, 0.08)}
      />
      <rect
        x="13.5"
        y="10"
        width="5"
        height="15"
        rx="1"
        stroke={c}
        strokeWidth={sw}
        fill={withAlpha(c, 0.08)}
      />
      <rect
        x="20"
        y="13"
        width="5"
        height="12"
        rx="1"
        stroke={c}
        strokeWidth={sw}
        fill={withAlpha(c, 0.08)}
      />
      <circle cx="16" cy="7.5" r="1.5" fill={a} />
      <path d="M7 25h18" stroke={c} strokeWidth={sw} strokeLinecap="round" />
    </>
  );
}

function LeagueGlyph({ c, sw }: GlyphProps) {
  return (
    <>
      <path
        d="M16 5L25 10v8c0 5-4 8.5-9 9.5-5-1-9-4.5-9-9.5V10L16 5z"
        stroke={c}
        strokeWidth={sw}
        strokeLinejoin="round"
        fill={withAlpha(BRAND_NAVY_LIGHT, 0.08)}
      />
      <path
        d="M16 11l4 5-4 5-4-5z"
        stroke={c}
        strokeWidth={thin(sw)}
        strokeLinejoin="round"
        fill="none"
      />
    </>
  );
}

function CommissionerGlyph({ c, a, sw }: GlyphProps) {
  return (
    <>
      <rect
        x="8.5"
        y="7"
        width="13"
        height="5.5"
        rx="2.5"
        stroke={c}
        strokeWidth={sw}
        fill={withAlpha(c, 0.06)}
        transform="rotate(-25 15 9.75)"
      />
      <path
        d="M16.5 14.5l3 9"
        stroke={c}
        strokeWidth={sw + 0.2}
        strokeLinecap="round"
      />
      <path d="M9 25.5h14" stroke={c} strokeWidth={sw} strokeLinecap="round" />
      <circle cx="13.5" cy="23" r="1.5" fill={a} />
    </>
  );
}

function AnnouncementGlyph({ c, a, sw }: GlyphProps) {
  return (
    <>
      <path
        d="M20 8v16l-7-3H9a2 2 0 01-2-2v-6a2 2 0 012-2h4l7-3z"
        stroke={c}
        strokeWidth={sw}
        strokeLinejoin="round"
        fill={withAlpha(c, 0.06)}
      />
      <path d="M10 21v3.5" stroke={c} strokeWidth={sw} strokeLinecap="round" />
      <path
        d="M23 13.5Q25.5 16 23 18.5"
        stroke={a}
        strokeWidth={mid(sw)}
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M25.5 11Q29.5 16 25.5 21"
        stroke={a}
        strokeWidth={thin(sw)}
        strokeLinecap="round"
        fill="none"
        opacity="0.5"
      />
    </>
  );
}

function SecureGlyph({ c, a, sw }: GlyphProps) {
  return (
    <>
      <path
        d="M16 6.9L23 10.2V16.7C23 21.1 19.95 24.15 16 25.35C12.05 24.15 9 21.1 9 16.7V10.2L16 6.9Z"
        fill={withAlpha(BRAND_NAVY_LIGHT, 0.12)}
        stroke={c}
        strokeWidth={sw}
        strokeLinejoin="round"
      />
      <path
        d="M12.2 15.8L15.0 18.6L20.0 13.0"
        stroke={a}
        strokeWidth={sw + 0.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}

function ScoreboardGlyph({ c, a, sw }: GlyphProps) {
  return (
    <>
      <rect
        x="6"
        y="8"
        width="20"
        height="14"
        rx="2"
        stroke={c}
        strokeWidth={sw}
        fill={withAlpha(c, 0.04)}
      />
      <path d="M16 8v14" stroke={c} strokeWidth={thin(sw)} />
      <path d="M6 15h20" stroke={c} strokeWidth={thin(sw)} />
      <path
        d="M11 12h2"
        stroke={c}
        strokeWidth={mid(sw)}
        strokeLinecap="round"
      />
      <path
        d="M19 12h2"
        stroke={a}
        strokeWidth={mid(sw)}
        strokeLinecap="round"
      />
      <path d="M6 24h20" stroke={c} strokeWidth={sw} strokeLinecap="round" />
    </>
  );
}

function AwardGlyph({ c, a, sw }: GlyphProps) {
  return (
    <>
      <circle cx="16" cy="13" r="7" stroke={c} strokeWidth={sw} />
      <path
        d="M12 19l-2 8 6-3 6 3-2-8"
        stroke={c}
        strokeWidth={sw}
        strokeLinejoin="round"
      />
      <path
        d="M16 9.5l1.3 2.6 2.9.4-2.1 2 .5 2.9L16 15.8l-2.6 1.6.5-2.9-2.1-2 2.9-.4z"
        fill={a}
        opacity="0.8"
      />
    </>
  );
}

// ─── Navigation glyphs ───────────────────────────────────────────────────────

function HomeGlyph({ c, sw }: GlyphProps) {
  return (
    <>
      <path
        d="M6 16L16 7l10 9"
        stroke={c}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 14v10a1.5 1.5 0 001.5 1.5h3.5v-5h4v5h3.5A1.5 1.5 0 0023 24V14"
        stroke={c}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={withAlpha(c, 0.05)}
      />
    </>
  );
}

function SearchGlyph({ c, sw }: GlyphProps) {
  return (
    <>
      <circle cx="14.5" cy="14.5" r="6.5" stroke={c} strokeWidth={sw} />
      <path
        d="M19.5 19.5L25 25"
        stroke={c}
        strokeWidth={sw + 0.2}
        strokeLinecap="round"
      />
    </>
  );
}

function MenuGlyph({ c, sw }: GlyphProps) {
  return (
    <>
      <path d="M7 10h18" stroke={c} strokeWidth={sw} strokeLinecap="round" />
      <path d="M7 16h18" stroke={c} strokeWidth={sw} strokeLinecap="round" />
      <path d="M7 22h14" stroke={c} strokeWidth={sw} strokeLinecap="round" />
    </>
  );
}

function BackGlyph({ c, sw }: GlyphProps) {
  return (
    <path
      d="M20 7L11 16l9 9"
      stroke={c}
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

function ForwardGlyph({ c, sw }: GlyphProps) {
  return (
    <path
      d="M12 7l9 9-9 9"
      stroke={c}
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

function ChevronUpGlyph({ c, sw }: GlyphProps) {
  return (
    <path
      d="M9 20l7-8 7 8"
      stroke={c}
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

function ChevronDownGlyph({ c, sw }: GlyphProps) {
  return (
    <path
      d="M9 12l7 8 7-8"
      stroke={c}
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

function ChevronLeftGlyph({ c, sw }: GlyphProps) {
  return (
    <path
      d="M20 9l-8 7 8 7"
      stroke={c}
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

function ChevronRightGlyph({ c, sw }: GlyphProps) {
  return (
    <path
      d="M12 9l8 7-8 7"
      stroke={c}
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

function CloseGlyph({ c, sw }: GlyphProps) {
  return (
    <>
      <path d="M9 9l14 14" stroke={c} strokeWidth={sw} strokeLinecap="round" />
      <path d="M23 9L9 23" stroke={c} strokeWidth={sw} strokeLinecap="round" />
    </>
  );
}

function MoreGlyph({ c }: GlyphProps) {
  return (
    <>
      <circle cx="9" cy="16" r="1.8" fill={c} />
      <circle cx="16" cy="16" r="1.8" fill={c} />
      <circle cx="23" cy="16" r="1.8" fill={c} />
    </>
  );
}

// ─── Action glyphs ───────────────────────────────────────────────────────────

function AddGlyph({ c, sw }: GlyphProps) {
  return (
    <>
      <circle cx="16" cy="16" r="10" stroke={c} strokeWidth={sw} />
      <path d="M16 11v10" stroke={c} strokeWidth={sw} strokeLinecap="round" />
      <path d="M11 16h10" stroke={c} strokeWidth={sw} strokeLinecap="round" />
    </>
  );
}

function EditGlyph({ c, sw }: GlyphProps) {
  return (
    <>
      <path
        d="M19.5 7.5l5 5L12 25H7v-5L19.5 7.5z"
        stroke={c}
        strokeWidth={sw}
        strokeLinejoin="round"
        fill={withAlpha(c, 0.05)}
      />
      <path
        d="M17 10l5 5"
        stroke={c}
        strokeWidth={thin(sw)}
        strokeLinecap="round"
      />
    </>
  );
}

function DeleteGlyph({ a, sw }: GlyphProps) {
  return (
    <>
      <path
        d="M10 10h12l-1 15a1 1 0 01-1 1H12a1 1 0 01-1-1L10 10z"
        stroke={a}
        strokeWidth={sw}
        strokeLinejoin="round"
        fill={withAlpha(a, 0.06)}
      />
      <path d="M7 10h18" stroke={a} strokeWidth={sw} strokeLinecap="round" />
      <path d="M13 7h6" stroke={a} strokeWidth={sw} strokeLinecap="round" />
      <path
        d="M14 14v6"
        stroke={a}
        strokeWidth={thin(sw)}
        strokeLinecap="round"
        opacity="0.6"
      />
      <path
        d="M18 14v6"
        stroke={a}
        strokeWidth={thin(sw)}
        strokeLinecap="round"
        opacity="0.6"
      />
    </>
  );
}

function SaveGlyph({ c, sw }: GlyphProps) {
  return (
    <>
      <path
        d="M8 7h12l5 5v13a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 017 25V8.5A1.5 1.5 0 018.5 7z"
        stroke={c}
        strokeWidth={sw}
        strokeLinejoin="round"
        fill={withAlpha(c, 0.04)}
      />
      <rect
        x="11"
        y="7"
        width="8"
        height="5.5"
        rx="0.8"
        stroke={c}
        strokeWidth={thin(sw)}
      />
      <path
        d="M11 18h10"
        stroke={c}
        strokeWidth={thin(sw)}
        strokeLinecap="round"
        opacity="0.5"
      />
      <path
        d="M11 21h7"
        stroke={c}
        strokeWidth={thin(sw)}
        strokeLinecap="round"
        opacity="0.5"
      />
    </>
  );
}

function CopyGlyph({ c, sw }: GlyphProps) {
  return (
    <>
      <rect
        x="11"
        y="11"
        width="13"
        height="14"
        rx="2"
        stroke={c}
        strokeWidth={sw}
        fill={withAlpha(c, 0.04)}
      />
      <path
        d="M21 11V9a2 2 0 00-2-2H9a2 2 0 00-2 2v10a2 2 0 002 2h2"
        stroke={c}
        strokeWidth={sw}
        strokeLinecap="round"
      />
    </>
  );
}

function ShareGlyph({ c, sw }: GlyphProps) {
  return (
    <>
      <circle cx="22" cy="10" r="3" stroke={c} strokeWidth={sw} />
      <circle cx="10" cy="16" r="3" stroke={c} strokeWidth={sw} />
      <circle cx="22" cy="22" r="3" stroke={c} strokeWidth={sw} />
      <path
        d="M12.8 14.8l6.4-3.6"
        stroke={c}
        strokeWidth={thin(sw)}
        strokeLinecap="round"
      />
      <path
        d="M12.8 17.2l6.4 3.6"
        stroke={c}
        strokeWidth={thin(sw)}
        strokeLinecap="round"
      />
    </>
  );
}

function SendGlyph({ c, sw }: GlyphProps) {
  return (
    <path
      d="M7 8l18 8-18 8V17l12-1-12-1V8z"
      stroke={c}
      strokeWidth={sw}
      strokeLinejoin="round"
      fill={withAlpha(c, 0.05)}
    />
  );
}

function RefreshGlyph({ c, sw }: GlyphProps) {
  return (
    <>
      <path
        d="M24 14a8 8 0 01-14 6"
        stroke={c}
        strokeWidth={sw}
        strokeLinecap="round"
      />
      <path
        d="M8 18a8 8 0 0114-6"
        stroke={c}
        strokeWidth={sw}
        strokeLinecap="round"
      />
      <path
        d="M24 10v4h-4"
        stroke={c}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 22v-4h4"
        stroke={c}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}

function UndoGlyph({ c, sw }: GlyphProps) {
  return (
    <>
      <path
        d="M10 14a8 8 0 0114 5"
        stroke={c}
        strokeWidth={sw}
        strokeLinecap="round"
      />
      <path
        d="M10 8v6h6"
        stroke={c}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}

function FilterGlyph({ c, sw }: GlyphProps) {
  return (
    <path
      d="M7 8h18l-6.5 8.5V23l-5 3V16.5L7 8z"
      stroke={c}
      strokeWidth={sw}
      strokeLinejoin="round"
      fill={withAlpha(c, 0.05)}
    />
  );
}

function SortGlyph({ c, sw }: GlyphProps) {
  return (
    <>
      <path d="M10 8v16" stroke={c} strokeWidth={sw} strokeLinecap="round" />
      <path
        d="M7 20l3 4 3-4"
        stroke={c}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M22 24V8" stroke={c} strokeWidth={sw} strokeLinecap="round" />
      <path
        d="M19 12l3-4 3 4"
        stroke={c}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}

function ShuffleGlyph({ c, sw }: GlyphProps) {
  return (
    <>
      <path
        d="M7 10h4l10 12h4"
        stroke={c}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7 22h4l3.5-4.2"
        stroke={c}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M17.5 14.2L21 10h4"
        stroke={c}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M23 7l2 3-2 3"
        stroke={c}
        strokeWidth={mid(sw)}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M23 19l2 3-2 3"
        stroke={c}
        strokeWidth={mid(sw)}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}

function GripGlyph({ c }: GlyphProps) {
  return (
    <>
      <circle cx="12" cy="10" r="1.5" fill={c} />
      <circle cx="20" cy="10" r="1.5" fill={c} />
      <circle cx="12" cy="16" r="1.5" fill={c} />
      <circle cx="20" cy="16" r="1.5" fill={c} />
      <circle cx="12" cy="22" r="1.5" fill={c} />
      <circle cx="20" cy="22" r="1.5" fill={c} />
    </>
  );
}

function LinkGlyph({ c, sw }: GlyphProps) {
  return (
    <>
      <path
        d="M13 19l-2 2a3.5 3.5 0 01-5-5l4-4a3.5 3.5 0 015 0"
        stroke={c}
        strokeWidth={sw}
        strokeLinecap="round"
      />
      <path
        d="M19 13l2-2a3.5 3.5 0 015 5l-4 4a3.5 3.5 0 01-5 0"
        stroke={c}
        strokeWidth={sw}
        strokeLinecap="round"
      />
    </>
  );
}

// ─── Status & Feedback glyphs ────────────────────────────────────────────────

function CheckGlyph({ c, sw }: GlyphProps) {
  return (
    <path
      d="M8 17l5.5 5.5L24 10"
      stroke={c}
      strokeWidth={sw + 0.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

function CheckCircleGlyph({ c, sw }: GlyphProps) {
  return (
    <>
      <circle cx="16" cy="16" r="10" stroke={c} strokeWidth={sw} />
      <path
        d="M11 16.5l3.5 3.5L21 13"
        stroke={c}
        strokeWidth={sw + 0.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}

function AlertGlyph({ a, sw }: GlyphProps) {
  return (
    <>
      <path
        d="M16 6L27 25H5L16 6z"
        stroke={a}
        strokeWidth={sw}
        strokeLinejoin="round"
        fill={withAlpha(a, 0.06)}
      />
      <path
        d="M16 13v5"
        stroke={a}
        strokeWidth={sw + 0.2}
        strokeLinecap="round"
      />
      <circle cx="16" cy="21" r="1.2" fill={a} />
    </>
  );
}

function InfoGlyph({ c, sw }: GlyphProps) {
  return (
    <>
      <circle cx="16" cy="16" r="10" stroke={c} strokeWidth={sw} />
      <path d="M16 15v6" stroke={c} strokeWidth={sw} strokeLinecap="round" />
      <circle cx="16" cy="11.5" r="1.3" fill={c} />
    </>
  );
}

function HelpGlyph({ c, sw }: GlyphProps) {
  return (
    <>
      <circle cx="16" cy="16" r="10" stroke={c} strokeWidth={sw} />
      <path
        d="M12.5 12a4 4 0 014.5-2c2 0 3.5 1.5 3.5 3s-1.5 2.5-3.5 3v1.5"
        stroke={c}
        strokeWidth={sw}
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="16" cy="22" r="1.2" fill={c} />
    </>
  );
}

function WarningGlyph({ a, sw }: GlyphProps) {
  return (
    <>
      <path
        d="M16 6L27 25H5L16 6z"
        stroke={a}
        strokeWidth={sw}
        strokeLinejoin="round"
        fill={withAlpha(a, 0.06)}
      />
      <path
        d="M16 13v5"
        stroke={a}
        strokeWidth={sw + 0.2}
        strokeLinecap="round"
      />
      <circle cx="16" cy="21" r="1.2" fill={a} />
    </>
  );
}

function ClockGlyph({ c, sw }: GlyphProps) {
  return (
    <>
      <circle cx="16" cy="16" r="10" stroke={c} strokeWidth={sw} />
      <path d="M16 10v6" stroke={c} strokeWidth={sw} strokeLinecap="round" />
      <path
        d="M16 16l4.5 2"
        stroke={c}
        strokeWidth={mid(sw)}
        strokeLinecap="round"
      />
      <circle cx="16" cy="16" r="0.8" fill={c} />
    </>
  );
}

function TimerGlyph({ c, sw }: GlyphProps) {
  return (
    <>
      <circle cx="16" cy="17" r="9" stroke={c} strokeWidth={sw} />
      <path
        d="M16 11v6l3 3"
        stroke={c}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M14 5h4" stroke={c} strokeWidth={sw} strokeLinecap="round" />
      <path
        d="M16 5v3"
        stroke={c}
        strokeWidth={mid(sw)}
        strokeLinecap="round"
      />
    </>
  );
}

function HourglassGlyph({ c, sw }: GlyphProps) {
  return (
    <>
      <path d="M10 6h12" stroke={c} strokeWidth={sw} strokeLinecap="round" />
      <path d="M10 26h12" stroke={c} strokeWidth={sw} strokeLinecap="round" />
      <path
        d="M11 6c0 5 5 8 5 10s-5 5-5 10"
        stroke={c}
        strokeWidth={sw}
        strokeLinecap="round"
      />
      <path
        d="M21 6c0 5-5 8-5 10s5 5 5 10"
        stroke={c}
        strokeWidth={sw}
        strokeLinecap="round"
      />
    </>
  );
}

function ZapGlyph({ c, sw }: GlyphProps) {
  return (
    <path
      d="M18 5L10 17h6l-2 10 8-12h-6l2-10z"
      stroke={c}
      strokeWidth={sw}
      strokeLinejoin="round"
      fill={withAlpha(c, 0.08)}
    />
  );
}

// ─── People & Social glyphs ─────────────────────────────────────────────────

function UserGlyph({ c, sw }: GlyphProps) {
  return (
    <>
      <circle cx="16" cy="12" r="5" stroke={c} strokeWidth={sw} />
      <path
        d="M7 26c0-5 4-9 9-9s9 4 9 9"
        stroke={c}
        strokeWidth={sw}
        strokeLinecap="round"
      />
    </>
  );
}

function UsersGlyph({ c, sw }: GlyphProps) {
  return (
    <>
      <circle cx="13" cy="12" r="4.5" stroke={c} strokeWidth={sw} />
      <path
        d="M5 26c0-4.5 3.5-8 8-8s8 3.5 8 8"
        stroke={c}
        strokeWidth={sw}
        strokeLinecap="round"
      />
      <circle
        cx="21"
        cy="11"
        r="3.5"
        stroke={c}
        strokeWidth={thin(sw)}
        opacity="0.45"
      />
      <path
        d="M24 25c0-3.5-2.5-6-5.5-6"
        stroke={c}
        strokeWidth={thin(sw)}
        strokeLinecap="round"
        opacity="0.45"
      />
    </>
  );
}

function UserAddGlyph({ c, sw }: GlyphProps) {
  return (
    <>
      <circle cx="14" cy="12" r="5" stroke={c} strokeWidth={sw} />
      <path
        d="M5 26c0-5 4-9 9-9s9 4 9 9"
        stroke={c}
        strokeWidth={sw}
        strokeLinecap="round"
      />
      <path d="M24 10v6" stroke={c} strokeWidth={sw} strokeLinecap="round" />
      <path d="M21 13h6" stroke={c} strokeWidth={sw} strokeLinecap="round" />
    </>
  );
}

function UserRemoveGlyph({ c, sw }: GlyphProps) {
  return (
    <>
      <circle cx="14" cy="12" r="5" stroke={c} strokeWidth={sw} />
      <path
        d="M5 26c0-5 4-9 9-9s9 4 9 9"
        stroke={c}
        strokeWidth={sw}
        strokeLinecap="round"
      />
      <path d="M21 13h6" stroke={c} strokeWidth={sw} strokeLinecap="round" />
    </>
  );
}

function BellGlyph({ c, sw }: GlyphProps) {
  return (
    <>
      <path
        d="M16 6c-4 0-7 3-7 7v5l-2 3h18l-2-3v-5c0-4-3-7-7-7z"
        stroke={c}
        strokeWidth={sw}
        strokeLinejoin="round"
        fill={withAlpha(c, 0.05)}
      />
      <path
        d="M13.5 24a2.5 2.5 0 005 0"
        stroke={c}
        strokeWidth={mid(sw)}
        strokeLinecap="round"
      />
    </>
  );
}

function BellActiveGlyph({ c, a, sw }: GlyphProps) {
  return (
    <>
      <path
        d="M16 6c-4 0-7 3-7 7v5l-2 3h18l-2-3v-5c0-4-3-7-7-7z"
        stroke={c}
        strokeWidth={sw}
        strokeLinejoin="round"
        fill={withAlpha(c, 0.05)}
      />
      <path
        d="M13.5 24a2.5 2.5 0 005 0"
        stroke={c}
        strokeWidth={mid(sw)}
        strokeLinecap="round"
      />
      <circle cx="22" cy="8" r="3" fill={a} />
    </>
  );
}

function MessageGlyph({ c, sw }: GlyphProps) {
  return (
    <>
      <path
        d="M6 8h20a1.5 1.5 0 011.5 1.5v12a1.5 1.5 0 01-1.5 1.5H12l-4 4v-4H6a1.5 1.5 0 01-1.5-1.5v-12A1.5 1.5 0 016 8z"
        stroke={c}
        strokeWidth={sw}
        strokeLinejoin="round"
        fill={withAlpha(c, 0.04)}
      />
      <path
        d="M11 13h10"
        stroke={c}
        strokeWidth={thin(sw)}
        strokeLinecap="round"
      />
      <path
        d="M11 17h6"
        stroke={c}
        strokeWidth={thin(sw)}
        strokeLinecap="round"
      />
    </>
  );
}

// ─── Content & Data glyphs ───────────────────────────────────────────────────

function CalendarGlyph({ c, sw }: GlyphProps) {
  return (
    <>
      <rect
        x="7"
        y="9"
        width="18"
        height="17"
        rx="2.5"
        stroke={c}
        strokeWidth={sw}
        fill={withAlpha(c, 0.04)}
      />
      <path d="M7 14h18" stroke={c} strokeWidth={thin(sw)} />
      <path d="M12 6v5" stroke={c} strokeWidth={sw} strokeLinecap="round" />
      <path d="M20 6v5" stroke={c} strokeWidth={sw} strokeLinecap="round" />
      <circle cx="12" cy="18.5" r="1" fill={c} opacity="0.5" />
      <circle cx="16" cy="18.5" r="1" fill={c} opacity="0.5" />
      <circle cx="20" cy="18.5" r="1" fill={c} opacity="0.5" />
      <circle cx="12" cy="22" r="1" fill={c} opacity="0.5" />
      <circle cx="16" cy="22" r="1" fill={c} opacity="0.5" />
    </>
  );
}

function BookGlyph({ c, a, sw }: GlyphProps) {
  return (
    <>
      <path
        d="M16 22.5C16 22.5 12.5 21.2 9.0 21.5V8.5C12.5 8.2 16 9.5 16 9.5V22.5Z"
        fill={withAlpha(c, 0.12)}
        stroke={c}
        strokeWidth={sw}
        strokeLinejoin="round"
      />
      <path
        d="M16 22.5C16 22.5 19.5 21.2 23.0 21.5V8.5C19.5 8.2 16 9.5 16 9.5V22.5Z"
        fill={withAlpha(a, 0.08)}
        stroke={c}
        strokeWidth={sw}
        strokeLinejoin="round"
      />
      <path
        d="M16 9.5V22.5"
        stroke={c}
        strokeWidth={mid(sw)}
        strokeLinecap="round"
      />
      <path
        d="M10.5 12.5H14.2"
        stroke={a}
        strokeWidth={thin(sw)}
        strokeLinecap="round"
      />
      <path
        d="M10.5 14.8H14.2"
        stroke={a}
        strokeWidth={thin(sw)}
        strokeLinecap="round"
      />
      <path
        d="M10.5 17.1H13.0"
        stroke={a}
        strokeWidth={thin(sw)}
        strokeLinecap="round"
      />
      <path
        d="M9.0 21.5 Q16 24.0 23.0 21.5"
        stroke={c}
        strokeWidth={mid(sw)}
        strokeLinecap="round"
      />
    </>
  );
}

function FileGlyph({ c, sw }: GlyphProps) {
  return (
    <>
      <path
        d="M9 7h10l5 5v13a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 018 25V8.5A1.5 1.5 0 019 7z"
        stroke={c}
        strokeWidth={sw}
        strokeLinejoin="round"
        fill={withAlpha(c, 0.04)}
      />
      <path
        d="M19 7v5h5"
        stroke={c}
        strokeWidth={mid(sw)}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 16h8"
        stroke={c}
        strokeWidth={thin(sw)}
        strokeLinecap="round"
      />
      <path
        d="M12 20h5"
        stroke={c}
        strokeWidth={thin(sw)}
        strokeLinecap="round"
      />
    </>
  );
}

function ImageGlyph({ c, sw }: GlyphProps) {
  return (
    <>
      <rect
        x="7"
        y="8"
        width="18"
        height="16"
        rx="2"
        stroke={c}
        strokeWidth={sw}
        fill={withAlpha(c, 0.04)}
      />
      <path
        d="M7 20l5-5 4 4 3-3 6 6"
        stroke={c}
        strokeWidth={mid(sw)}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="14" r="2" stroke={c} strokeWidth={mid(sw)} />
    </>
  );
}

function TagGlyph({ c, sw }: GlyphProps) {
  return (
    <>
      <path
        d="M7 7h10l9 9-10 10-9-9V7z"
        stroke={c}
        strokeWidth={sw}
        strokeLinejoin="round"
        fill={withAlpha(c, 0.04)}
      />
      <circle cx="12" cy="12" r="1.5" fill={c} />
    </>
  );
}

function ChartGlyph({ c, sw }: GlyphProps) {
  return (
    <>
      <path
        d="M7 7v17h18"
        stroke={c}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 21Q12 18 15 16Q18 14 20 10Q22 7 25 8"
        stroke={c}
        strokeWidth={sw}
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="9" cy="21" r="1.3" fill={c} />
      <circle cx="15" cy="16" r="1.3" fill={c} />
      <circle cx="20" cy="10" r="1.3" fill={c} />
      <circle cx="25" cy="8" r="1.3" fill={c} />
    </>
  );
}

function TargetGlyph({ c, sw }: GlyphProps) {
  return (
    <>
      <circle cx="16" cy="16" r="10" stroke={c} strokeWidth={sw} />
      <circle cx="16" cy="16" r="5.5" stroke={c} strokeWidth={thin(sw)} />
      <circle cx="16" cy="16" r="1.5" fill={c} />
    </>
  );
}

function BarChartGlyph({ c, sw }: GlyphProps) {
  return (
    <>
      <path d="M7 24h18" stroke={c} strokeWidth={sw} strokeLinecap="round" />
      <rect
        x="9"
        y="17"
        width="3.5"
        height="7"
        rx="1.2"
        stroke={c}
        strokeWidth={sw}
        fill={withAlpha(c, 0.08)}
      />
      <rect
        x="14.25"
        y="13"
        width="3.5"
        height="11"
        rx="1.2"
        stroke={c}
        strokeWidth={sw}
        fill={withAlpha(c, 0.08)}
      />
      <rect
        x="19.5"
        y="9"
        width="3.5"
        height="15"
        rx="1.2"
        stroke={c}
        strokeWidth={sw}
        fill={withAlpha(c, 0.08)}
      />
    </>
  );
}

// ─── Security & System glyphs ────────────────────────────────────────────────

function LockGlyph({ c, a, sw }: GlyphProps) {
  return (
    <>
      <rect
        x="9"
        y="15"
        width="14"
        height="10"
        rx="2.5"
        stroke={c}
        strokeWidth={sw}
        fill={withAlpha(c, 0.05)}
      />
      <path
        d="M12 15v-3a4 4 0 018 0v3"
        stroke={a}
        strokeWidth={sw}
        strokeLinecap="round"
      />
      <circle cx="16" cy="20.5" r="1.3" fill={c} />
    </>
  );
}

function UnlockGlyph({ c, a, sw }: GlyphProps) {
  return (
    <>
      <rect
        x="9"
        y="15"
        width="14"
        height="10"
        rx="2.5"
        stroke={c}
        strokeWidth={sw}
        fill={withAlpha(c, 0.05)}
      />
      <path
        d="M12 15v-3a4 4 0 018 0"
        stroke={a}
        strokeWidth={sw}
        strokeLinecap="round"
      />
      <circle cx="16" cy="20.5" r="1.3" fill={c} />
    </>
  );
}

function SettingsGlyph({ c, a, sw }: GlyphProps) {
  const cx = 16;
  const cy = 16;
  const rOuter = 11.2;
  const rRoot = 8.4;
  const toothHalfWidth = 14;
  const numTeeth = 8;
  const pts: string[] = [];
  for (let i = 0; i < numTeeth; i++) {
    const peakDeg = i * 45;
    const valleyDeg = peakDeg + 22.5;
    const leadRad = ((peakDeg - toothHalfWidth) * Math.PI) / 180;
    pts.push(
      `${(cx + rRoot * Math.cos(leadRad)).toFixed(3)} ${(cy + rRoot * Math.sin(leadRad)).toFixed(3)}`,
    );
    const pk1Rad = ((peakDeg - 8) * Math.PI) / 180;
    const pk2Rad = ((peakDeg + 8) * Math.PI) / 180;
    pts.push(
      `${(cx + rOuter * Math.cos(pk1Rad)).toFixed(3)} ${(cy + rOuter * Math.sin(pk1Rad)).toFixed(3)}`,
    );
    pts.push(
      `${(cx + rOuter * Math.cos(pk2Rad)).toFixed(3)} ${(cy + rOuter * Math.sin(pk2Rad)).toFixed(3)}`,
    );
    const trailRad = ((peakDeg + toothHalfWidth) * Math.PI) / 180;
    pts.push(
      `${(cx + rRoot * Math.cos(trailRad)).toFixed(3)} ${(cy + rRoot * Math.sin(trailRad)).toFixed(3)}`,
    );
    const valleyRad = (valleyDeg * Math.PI) / 180;
    pts.push(
      `${(cx + rRoot * Math.cos(valleyRad)).toFixed(3)} ${(cy + rRoot * Math.sin(valleyRad)).toFixed(3)}`,
    );
  }
  const gearPath = `M ${pts[0]} L ${pts.slice(1).join(' L ')} Z`;
  return (
    <>
      <path
        d={gearPath}
        fill={withAlpha(c, 0.14)}
        stroke={c}
        strokeWidth={mid(sw)}
        strokeLinejoin="round"
      />
      <circle
        cx={cx}
        cy={cy}
        r={3.4}
        fill={withAlpha(a, 0.22)}
        stroke={a}
        strokeWidth={sw}
      />
    </>
  );
}

function EyeGlyph({ c, sw }: GlyphProps) {
  return (
    <>
      <path
        d="M5 16s4-8 11-8 11 8 11 8-4 8-11 8S5 16 5 16z"
        stroke={c}
        strokeWidth={sw}
        strokeLinejoin="round"
      />
      <circle cx="16" cy="16" r="3.5" stroke={c} strokeWidth={mid(sw)} />
      <circle cx="16" cy="16" r="1.3" fill={c} />
    </>
  );
}

function EyeOffGlyph({ c, sw }: GlyphProps) {
  return (
    <>
      <path
        d="M5 16s4-8 11-8 11 8 11 8-4 8-11 8S5 16 5 16z"
        stroke={c}
        strokeWidth={sw}
        strokeLinejoin="round"
        opacity="0.4"
      />
      <circle
        cx="16"
        cy="16"
        r="3.5"
        stroke={c}
        strokeWidth={mid(sw)}
        opacity="0.4"
      />
      <path
        d="M6 6l20 20"
        stroke={c}
        strokeWidth={sw + 0.2}
        strokeLinecap="round"
      />
    </>
  );
}

function GlobeGlyph({ c, sw }: GlyphProps) {
  return (
    <>
      <circle cx="16" cy="16" r="10" stroke={c} strokeWidth={sw} />
      <ellipse
        cx="16"
        cy="16"
        rx="4.5"
        ry="10"
        stroke={c}
        strokeWidth={thin(sw)}
      />
      <path d="M6 16h20" stroke={c} strokeWidth={thin(sw)} />
      <path d="M8 11h16" stroke={c} strokeWidth={thin(sw)} opacity="0.4" />
      <path d="M8 21h16" stroke={c} strokeWidth={thin(sw)} opacity="0.4" />
    </>
  );
}

function QrCodeGlyph({ c, sw }: GlyphProps) {
  return (
    <>
      <rect
        x="6"
        y="6"
        width="8"
        height="8"
        rx="1"
        stroke={c}
        strokeWidth={sw}
      />
      <rect
        x="18"
        y="6"
        width="8"
        height="8"
        rx="1"
        stroke={c}
        strokeWidth={sw}
      />
      <rect
        x="6"
        y="18"
        width="8"
        height="8"
        rx="1"
        stroke={c}
        strokeWidth={sw}
      />
      <rect x="8.5" y="8.5" width="3" height="3" rx="0.5" fill={c} />
      <rect x="20.5" y="8.5" width="3" height="3" rx="0.5" fill={c} />
      <rect x="8.5" y="20.5" width="3" height="3" rx="0.5" fill={c} />
      <rect x="18" y="18" width="3" height="3" fill={c} opacity="0.5" />
      <rect x="23" y="18" width="3" height="3" fill={c} opacity="0.5" />
      <rect x="18" y="23" width="3" height="3" fill={c} opacity="0.5" />
      <rect x="23" y="23" width="3" height="3" fill={c} opacity="0.5" />
    </>
  );
}

// ─── Third-party glyphs ──────────────────────────────────────────────────────

function GoogleGlyph({ sw }: GlyphProps) {
  return (
    <>
      <path
        d="M23.7 16.35C23.7 15.55 23.63 14.95 23.47 14.3H16V17.25H20.39C20.3 18 19.81 19.13 18.73 19.9L18.71 20.09L21.08 21.88L21.24 21.89C22.74 20.54 23.7 18.55 23.7 16.35Z"
        fill="#4285F4"
      />
      <path
        d="M16 24C18.15 24 19.95 23.31 21.24 21.89L18.73 19.9C18.06 20.36 17.15 20.68 16 20.68C13.89 20.68 12.11 19.33 11.47 17.46L11.28 17.48L8.82 19.34L8.75 19.52C10.03 22 12.79 24 16 24Z"
        fill="#34A853"
      />
      <path
        d="M11.47 17.46C11.3 16.81 11.2 16.13 11.2 15.43C11.2 14.73 11.3 14.05 11.46 13.4L11.45 13.2L8.92 11.31L8.75 11.38C8.22 12.4 7.91 13.55 7.91 14.77C7.91 15.99 8.22 17.14 8.75 18.16L11.47 17.46Z"
        fill="#FBBC05"
      />
      <path
        d="M16 10.18C17.45 10.18 18.42 10.79 18.97 11.3L21.3 9.09C19.95 7.87 18.15 7.11 16 7.11C12.79 7.11 10.03 9.11 8.75 11.58L11.46 13.4C12.11 11.53 13.89 10.18 16 10.18Z"
        fill="#EA4335"
      />
      <circle
        cx="16"
        cy="16"
        r="9.7"
        stroke={withAlpha(WHITE, 0.16)}
        strokeWidth={Math.max(sw - 0.5, 0.1)}
      />
    </>
  );
}

// ─── Render dispatcher ───────────────────────────────────────────────────────

function renderGlyph(name: BrandIconName, c: string, a: string, sw: number) {
  const p: GlyphProps = { c, a, sw };
  switch (name) {
    // Sport & Domain
    case 'baseball':
      return <BaseballGlyph {...p} />;
    case 'football':
      return <FootballGlyph {...p} />;
    case 'stats':
      return <StatsGlyph {...p} />;
    case 'draft':
      return <DraftGlyph {...p} />;
    case 'live':
      return <LiveGlyph {...p} />;
    case 'trophy':
      return <TrophyGlyph {...p} />;
    case 'matchup':
      return <MatchupGlyph {...p} />;
    case 'roster':
      return <RosterGlyph {...p} />;
    case 'trade':
      return <TradeGlyph {...p} />;
    case 'standings':
      return <StandingsGlyph {...p} />;
    case 'league':
      return <LeagueGlyph {...p} />;
    case 'commissioner':
      return <CommissionerGlyph {...p} />;
    case 'announcement':
      return <AnnouncementGlyph {...p} />;
    case 'secure':
      return <SecureGlyph {...p} />;
    case 'scoreboard':
      return <ScoreboardGlyph {...p} />;
    case 'award':
      return <AwardGlyph {...p} />;
    // Navigation
    case 'home':
      return <HomeGlyph {...p} />;
    case 'search':
      return <SearchGlyph {...p} />;
    case 'menu':
      return <MenuGlyph {...p} />;
    case 'back':
      return <BackGlyph {...p} />;
    case 'forward':
      return <ForwardGlyph {...p} />;
    case 'chevron-up':
      return <ChevronUpGlyph {...p} />;
    case 'chevron-down':
      return <ChevronDownGlyph {...p} />;
    case 'chevron-left':
      return <ChevronLeftGlyph {...p} />;
    case 'chevron-right':
      return <ChevronRightGlyph {...p} />;
    case 'close':
      return <CloseGlyph {...p} />;
    case 'more':
      return <MoreGlyph {...p} />;
    // Actions
    case 'add':
      return <AddGlyph {...p} />;
    case 'edit':
      return <EditGlyph {...p} />;
    case 'delete':
      return <DeleteGlyph {...p} />;
    case 'save':
      return <SaveGlyph {...p} />;
    case 'copy':
      return <CopyGlyph {...p} />;
    case 'share':
      return <ShareGlyph {...p} />;
    case 'send':
      return <SendGlyph {...p} />;
    case 'refresh':
      return <RefreshGlyph {...p} />;
    case 'undo':
      return <UndoGlyph {...p} />;
    case 'filter':
      return <FilterGlyph {...p} />;
    case 'sort':
      return <SortGlyph {...p} />;
    case 'shuffle':
      return <ShuffleGlyph {...p} />;
    case 'grip':
      return <GripGlyph {...p} />;
    case 'link':
      return <LinkGlyph {...p} />;
    // Status & Feedback
    case 'check':
      return <CheckGlyph {...p} />;
    case 'check-circle':
      return <CheckCircleGlyph {...p} />;
    case 'alert':
      return <AlertGlyph {...p} />;
    case 'info':
      return <InfoGlyph {...p} />;
    case 'help':
      return <HelpGlyph {...p} />;
    case 'warning':
      return <WarningGlyph {...p} />;
    case 'clock':
      return <ClockGlyph {...p} />;
    case 'timer':
      return <TimerGlyph {...p} />;
    case 'hourglass':
      return <HourglassGlyph {...p} />;
    case 'zap':
      return <ZapGlyph {...p} />;
    // People & Social
    case 'user':
      return <UserGlyph {...p} />;
    case 'users':
      return <UsersGlyph {...p} />;
    case 'user-add':
      return <UserAddGlyph {...p} />;
    case 'user-remove':
      return <UserRemoveGlyph {...p} />;
    case 'bell':
      return <BellGlyph {...p} />;
    case 'bell-active':
      return <BellActiveGlyph {...p} />;
    case 'message':
      return <MessageGlyph {...p} />;
    // Content & Data
    case 'calendar':
      return <CalendarGlyph {...p} />;
    case 'book':
      return <BookGlyph {...p} />;
    case 'file':
      return <FileGlyph {...p} />;
    case 'image':
      return <ImageGlyph {...p} />;
    case 'tag':
      return <TagGlyph {...p} />;
    case 'chart':
      return <ChartGlyph {...p} />;
    case 'target':
      return <TargetGlyph {...p} />;
    case 'bar-chart':
      return <BarChartGlyph {...p} />;
    // Security & System
    case 'lock':
      return <LockGlyph {...p} />;
    case 'unlock':
      return <UnlockGlyph {...p} />;
    case 'settings':
      return <SettingsGlyph {...p} />;
    case 'eye':
      return <EyeGlyph {...p} />;
    case 'eye-off':
      return <EyeOffGlyph {...p} />;
    case 'globe':
      return <GlobeGlyph {...p} />;
    case 'qr-code':
      return <QrCodeGlyph {...p} />;
    // Third-party
    case 'google':
      return <GoogleGlyph {...p} />;
    default:
      return null;
  }
}

// ─── Public components ───────────────────────────────────────────────────────

export function BrandIcon({
  name,
  size = 24,
  color = BRAND_GOLD_LIGHT,
  accentColor = BRAND_SEAM_RED,
  strokeWidth = size <= 16 ? 2.2 : 1.8,
  title,
  decorative = true,
  style,
}: BrandIconProps): React.JSX.Element {
  const labelled = !decorative && Boolean(title);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role={labelled ? 'img' : 'presentation'}
      aria-hidden={labelled ? undefined : true}
      aria-label={labelled ? title : undefined}
      style={{ display: 'block', flexShrink: 0, ...style }}
    >
      {labelled ? <title>{title}</title> : null}
      {renderGlyph(name, color, accentColor, strokeWidth)}
    </svg>
  );
}

export function BrandIconBadge({
  name,
  size = 44,
  iconSize = 24,
  color = BRAND_GOLD_LIGHT,
  accentColor = BRAND_SEAM_RED,
  title,
  decorative = true,
  background = `linear-gradient(135deg, ${withAlpha(BRAND_NAVY_LIGHT, 0.28)} 0%, ${withAlpha(BG_DARK, 0.92)} 100%)`,
  borderColor = withAlpha(BRAND_GOLD_LIGHT, 0.3),
  rounded = 'circle',
  style,
}: BrandIconBadgeProps): React.JSX.Element {
  return (
    <span
      style={{
        width: size,
        height: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: rounded === 'circle' ? 9999 : 14,
        background,
        border: `1px solid ${borderColor}`,
        boxShadow: [
          `inset 0 1px 0 ${withAlpha(WHITE, 0.1)}`,
          `0 0 10px ${withAlpha(BRAND_GOLD_LIGHT, 0.18)}`,
        ].join(', '),
        flexShrink: 0,
        ...style,
      }}
    >
      <BrandIcon
        name={name}
        size={iconSize}
        color={color}
        accentColor={accentColor}
        {...(decorative === false && title
          ? { decorative: false as const, title }
          : { decorative: true as const, title })}
      />
    </span>
  );
}

export const BRAND_ICON_ACCENT = BRAND_NAVY_LIGHT;

/** All available icon names — useful for stories and documentation */
export const ALL_BRAND_ICON_NAMES: BrandIconName[] = [
  // Sport & Domain
  'baseball',
  'football',
  'stats',
  'draft',
  'live',
  'trophy',
  'matchup',
  'roster',
  'trade',
  'standings',
  'league',
  'commissioner',
  'announcement',
  'secure',
  'scoreboard',
  'award',
  // Navigation
  'home',
  'search',
  'menu',
  'back',
  'forward',
  'chevron-up',
  'chevron-down',
  'chevron-left',
  'chevron-right',
  'close',
  'more',
  // Actions
  'add',
  'edit',
  'delete',
  'save',
  'copy',
  'share',
  'send',
  'refresh',
  'undo',
  'filter',
  'sort',
  'shuffle',
  'grip',
  'link',
  // Status & Feedback
  'check',
  'check-circle',
  'alert',
  'info',
  'help',
  'warning',
  'clock',
  'timer',
  'hourglass',
  'zap',
  // People & Social
  'user',
  'users',
  'user-add',
  'user-remove',
  'bell',
  'bell-active',
  'message',
  // Content & Data
  'calendar',
  'book',
  'file',
  'image',
  'tag',
  'chart',
  'target',
  'bar-chart',
  // Security & System
  'lock',
  'unlock',
  'settings',
  'eye',
  'eye-off',
  'globe',
  'qr-code',
  // Third-party
  'google',
];
