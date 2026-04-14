import React from 'react';
import {
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  FONT_DISPLAY,
  FONT_BODY,
  FONT_MONO,
  PANEL_BORDER,
  POS_CATCHER,
  POS_INFIELD,
  POS_OUTFIELD,
  POS_PITCHER,
  POS_UTILITY,
  SURFACE_CARD,
  SURFACE_PANEL,
  TEXT_MUTED,
  TEXT_PRIMARY,
} from '../theme';

const POS_COLORS: Record<string, string> = {
  SP: POS_PITCHER,
  RP: POS_PITCHER,
  P: POS_PITCHER,
  C: POS_CATCHER,
  '1B': POS_INFIELD,
  '2B': POS_INFIELD,
  '3B': POS_INFIELD,
  SS: POS_INFIELD,
  OF: POS_OUTFIELD,
  LF: POS_OUTFIELD,
  CF: POS_OUTFIELD,
  RF: POS_OUTFIELD,
  DH: POS_UTILITY,
  UTIL: POS_UTILITY,
};

export interface PlayerData {
  name: string;
  year: number;
  team: string;
  position: string;
  stats: { label: string; value: string }[];
  highlight?: boolean;
}

export const PlayerCard: React.FC<{
  player: PlayerData;
  scale?: number;
  opacity?: number;
}> = ({ player, scale = 1, opacity = 1 }) => {
  const posColor = POS_COLORS[player.position] ?? POS_UTILITY;

  return (
    <div
      style={{
        width: 280,
        background: `linear-gradient(160deg, ${SURFACE_CARD} 0%, ${SURFACE_PANEL} 100%)`,
        border: `1px solid ${player.highlight ? BRAND_GOLD + '66' : PANEL_BORDER}`,
        borderRadius: 14,
        overflow: 'hidden',
        transform: `scale(${scale})`,
        transformOrigin: 'top center',
        opacity,
        boxShadow: player.highlight ? `0 8px 40px ${BRAND_GOLD}22` : 'none',
      }}
    >
      {/* Position color bar */}
      <div
        style={{
          height: 4,
          background: posColor,
          width: '100%',
        }}
      />

      {/* Header */}
      <div
        style={{
          padding: '20px 22px 16px',
          borderBottom: `1px solid ${PANEL_BORDER}`,
        }}
      >
        {/* Year badge */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: player.highlight ? BRAND_GOLD + '22' : SURFACE_PANEL,
            border: `1px solid ${player.highlight ? BRAND_GOLD + '44' : PANEL_BORDER}`,
            borderRadius: 6,
            padding: '3px 10px',
            marginBottom: 10,
          }}
        >
          <div
            style={{
              fontFamily: FONT_MONO,
              fontSize: 13,
              fontWeight: 600,
              color: player.highlight ? BRAND_GOLD_LIGHT : TEXT_MUTED,
              letterSpacing: '0.06em',
            }}
          >
            {player.year} · {player.team}
          </div>
        </div>

        {/* Name */}
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 800,
            fontSize: 26,
            color: TEXT_PRIMARY,
            lineHeight: 1.1,
            letterSpacing: '0.01em',
            textTransform: 'uppercase',
          }}
        >
          {player.name}
        </div>

        {/* Position */}
        <div
          style={{
            marginTop: 6,
            fontFamily: FONT_DISPLAY,
            fontWeight: 600,
            fontSize: 14,
            color: posColor,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}
        >
          {player.position}
        </div>
      </div>

      {/* Stats */}
      <div
        style={{
          padding: '14px 22px 18px',
          display: 'flex',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        {player.stats.map((s) => (
          <div
            key={s.label}
            style={{ display: 'flex', flexDirection: 'column', gap: 2 }}
          >
            <div
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: 700,
                fontSize: 24,
                color: player.highlight ? BRAND_GOLD : TEXT_PRIMARY,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {s.value}
            </div>
            <div
              style={{
                fontFamily: FONT_BODY,
                fontSize: 12,
                color: TEXT_MUTED,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
