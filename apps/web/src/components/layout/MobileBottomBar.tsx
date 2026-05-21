import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BarChart2, Bell, Users, Zap } from '@tamagui/lucide-icons';
import { useAuth } from '@legacy-sports/shared-components/auth';
import { FONT_DISPLAY } from './NavDropdownShared';
import {
  BRAND_NAVY,
  BRAND_SEAM_RED,
  GRADIENT_AVATAR,
  OUTLINE_SUBTLE,
} from '../../constants/colors';
import { useGetUnreadNotificationCountQuery } from '../../api/db/graphql.generated';

interface MobileTab {
  id: string;
  label: string;
  to: string;
  Icon?: React.ComponentType<{ size?: number; color?: string }>;
  isAvatar?: boolean;
  badgeCount?: number;
  liveDot?: boolean;
}

const TABS: MobileTab[] = [
  { id: 'players', label: 'Players', to: '/players', Icon: Users },
  { id: 'stats', label: 'Stats', to: '/players/stats', Icon: BarChart2 },
  { id: 'minigames', label: 'Minigames', to: '/games', Icon: Zap },
  { id: 'alerts', label: 'Alerts', to: '/notifications', Icon: Bell },
  { id: 'you', label: 'You', to: '/profile/settings', isAvatar: true },
];

interface Props {
  draftLive?: boolean;
}

export const MobileBottomBar: React.FC<Props> = ({ draftLive = false }) => {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();

  const { data: notifData } = useGetUnreadNotificationCountQuery({
    skip: !isAuthenticated,
  });
  const unreadCount = notifData?.getUnreadNotificationCount ?? 0;

  const userInitials = (() => {
    const name = user?.username ?? '';
    return name.length >= 2 ? name.slice(0, 2).toUpperCase() : 'ME';
  })();

  const isActive = (tab: MobileTab) => {
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
    if (tab.id === 'alerts')
      return location.pathname.startsWith('/notifications');
    if (tab.id === 'you') return location.pathname.startsWith('/profile');
    return false;
  };

  return (
    <div
      role="navigation"
      aria-label="Bottom navigation"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: 'rgba(10,15,26,0.92)',
        backdropFilter: 'blur(16px) saturate(140%)',
        WebkitBackdropFilter: 'blur(16px) saturate(140%)',
        borderTop: `1px solid ${OUTLINE_SUBTLE}`,
        padding: '8px 12px 22px',
        display: 'flex',
        justifyContent: 'space-around',
        gap: 4,
        zIndex: 200,
      }}
    >
      {TABS.map((tab) => {
        const active = isActive(tab);
        const isDraftActive = draftLive && tab.id === 'minigames' && active;
        const badge =
          tab.id === 'alerts' && unreadCount > 0 ? unreadCount : undefined;

        return (
          <Link
            key={tab.id}
            to={tab.to}
            aria-current={active ? 'page' : undefined}
            aria-label={
              tab.id === 'alerts' && badge
                ? `${tab.label} — ${badge} unread`
                : tab.label
            }
            style={{ textDecoration: 'none', flex: 1 }}
          >
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                padding: '8px 4px 4px',
                color: active ? '#F8FAFC' : '#9CAAC5',
                fontFamily: FONT_DISPLAY,
                fontWeight: 700,
                fontSize: 10,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                transition: 'color 150ms cubic-bezier(0.2, 0.8, 0.2, 1)',
                cursor: 'pointer',
              }}
            >
              {/* Icon container (pill indicator when active) */}
              <div
                style={{
                  width: 40,
                  height: 28,
                  borderRadius: 9999,
                  border: active
                    ? isDraftActive
                      ? '1px solid rgba(196,30,58,0.4)'
                      : '1px solid rgba(197,165,90,0.4)'
                    : '1px solid transparent',
                  background: active
                    ? isDraftActive
                      ? `linear-gradient(135deg, #8B1A2B, ${BRAND_SEAM_RED})`
                      : BRAND_NAVY
                    : 'transparent',
                  boxShadow: active
                    ? isDraftActive
                      ? '0 0 0 1px rgba(196,30,58,0.4), 0 6px 14px -4px rgba(196,30,58,0.6)'
                      : '0 0 0 1px rgba(197,165,90,0.2), 0 6px 14px -4px rgba(27,58,92,0.8)'
                    : undefined,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 180ms cubic-bezier(0.2, 0.8, 0.2, 1)',
                  position: 'relative' as const,
                }}
              >
                {tab.isAvatar ? (
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      background: GRADIENT_AVATAR,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: FONT_DISPLAY,
                      fontWeight: 800,
                      fontSize: 9,
                      color: '#fff',
                    }}
                  >
                    {userInitials}
                  </div>
                ) : (
                  tab.Icon && (
                    <tab.Icon size={18} color={active ? '#fff' : '#9CAAC5'} />
                  )
                )}

                {/* Badge */}
                {badge !== undefined && (
                  <span
                    style={{
                      position: 'absolute',
                      top: -1,
                      right: 2,
                      width: 14,
                      height: 14,
                      fontSize: 8,
                      color: '#fff',
                      fontFamily: FONT_DISPLAY,
                      fontWeight: 800,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '50%',
                      background: BRAND_SEAM_RED,
                      border: '1.5px solid rgba(10,15,26,0.95)',
                    }}
                  >
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}

                {/* Live dot for draft */}
                {tab.id === 'minigames' && draftLive && !active && (
                  <span
                    style={{
                      position: 'absolute',
                      top: 3,
                      right: 6,
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: '#E63950',
                      border: '1.5px solid rgba(10,15,26,0.95)',
                    }}
                  />
                )}
              </div>

              {tab.label}
            </div>
          </Link>
        );
      })}
    </div>
  );
};
