import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BarChart2, Users, Zap } from '@tamagui/lucide-icons';
import { FONT_DISPLAY } from './NavDropdownShared';
import {
  BRAND_NAVY,
  BRAND_SEAM_RED,
  OUTLINE_SUBTLE,
} from '../../constants/colors';

interface Tab {
  id: string;
  label: string;
  to: string;
  Icon: React.ComponentType<{ size?: number; color?: string }>;
  /** Dot indicator when there's live activity */
  liveDot?: boolean;
}

const TABS: Tab[] = [
  { id: 'players', label: 'Players', to: '/players', Icon: Users },
  { id: 'stats', label: 'Stats', to: '/players/stats', Icon: BarChart2 },
  { id: 'minigames', label: 'Minigames', to: '/games', Icon: Zap },
];

interface Props {
  draftLive?: boolean;
}

export const NavPillTabs: React.FC<Props> = ({ draftLive = false }) => {
  const location = useLocation();

  const isActive = (tab: Tab) => {
    if (tab.id === 'players')
      return (
        location.pathname === '/players' ||
        (location.pathname.startsWith('/players') &&
          !location.pathname.startsWith('/players/stats'))
      );
    if (tab.id === 'stats')
      return location.pathname.startsWith('/players/stats');
    if (tab.id === 'minigames')
      return (
        location.pathname.startsWith('/games') ||
        location.pathname.startsWith('/draft')
      );
    return false;
  };

  return (
    <nav
      aria-label="Main navigation"
      style={{
        display: 'flex',
        gap: 2,
        background: 'rgba(15,23,42,0.6)',
        border: `1px solid ${OUTLINE_SUBTLE}`,
        borderRadius: 9999,
        padding: 4,
      }}
    >
      {TABS.map((tab) => {
        const active = isActive(tab);
        const isDraftActive = draftLive && tab.id === 'minigames' && active;

        return (
          <Link
            key={tab.id}
            to={tab.to}
            aria-current={active ? 'page' : undefined}
            style={{ textDecoration: 'none' }}
          >
            <span
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: 700,
                fontSize: 12,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                padding: '8px 16px',
                borderRadius: 9999,
                background: active
                  ? isDraftActive
                    ? `linear-gradient(135deg, #8B1A2B, ${BRAND_SEAM_RED})`
                    : BRAND_NAVY
                  : 'transparent',
                border: 0,
                color: active ? '#fff' : '#9CAAC5',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                transition: 'all 150ms cubic-bezier(0.2, 0.8, 0.2, 1)',
                position: 'relative' as const,
                boxShadow: active
                  ? isDraftActive
                    ? '0 0 0 1px rgba(196,30,58,0.4) inset, 0 0 14px -2px rgba(196,30,58,0.55)'
                    : '0 1px 0 rgba(197,165,90,0.25) inset, 0 1px 2px rgba(0,0,0,0.3)'
                  : undefined,
              }}
            >
              <tab.Icon size={14} color={active ? '#fff' : '#9CAAC5'} />
              {tab.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
};
