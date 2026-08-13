import React from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { BarChart2 } from '@tamagui/lucide-icons/icons/BarChart2';
import { Bug } from '@tamagui/lucide-icons/icons/Bug';
import { ChevronRight } from '@tamagui/lucide-icons/icons/ChevronRight';
import { Compass } from '@tamagui/lucide-icons/icons/Compass';
import { HelpCircle } from '@tamagui/lucide-icons/icons/HelpCircle';
import { ListOrdered } from '@tamagui/lucide-icons/icons/ListOrdered';
import { LogOut } from '@tamagui/lucide-icons/icons/LogOut';
import { Plus } from '@tamagui/lucide-icons/icons/Plus';
import { Settings } from '@tamagui/lucide-icons/icons/Settings';
import { Shuffle } from '@tamagui/lucide-icons/icons/Shuffle';
import { Ticket } from '@tamagui/lucide-icons/icons/Ticket';
import { Trophy } from '@tamagui/lucide-icons/icons/Trophy';
import { User } from '@tamagui/lucide-icons/icons/User';
import { Users } from '@tamagui/lucide-icons/icons/Users';
import { X } from '@tamagui/lucide-icons/icons/X';
import { Zap } from '@tamagui/lucide-icons/icons/Zap';
import { useAuth } from '@legacy-sports/shared-components/auth';
import { LOGGER } from '@legacy-sports/logging';
import { useGetUserLeaguesQuery } from '@legacy-sports/graphql';
import { FONT_DISPLAY } from './NavDropdownShared';
import {
  BG_DARK,
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  BRAND_NAVY_DARK,
  OUTLINE_SUBTLE,
  PANEL_BORDER,
  SHADOW_DARK,
  TEXT_FG2,
  TEXT_MUTED,
  TEXT_PRIMARY,
  TEXT_TERTIARY,
  withAlpha,
} from '../../constants/colors';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onBugReport?: () => void;
}

const DRAWER_ITEM: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '12px 20px',
  cursor: 'pointer',
  fontFamily: FONT_DISPLAY,
  fontWeight: 700,
  fontSize: 13,
  letterSpacing: '0.04em',
  color: TEXT_FG2,
  background: 'transparent',
  border: 0,
  width: '100%',
  textAlign: 'left' as const,
  transition: 'all 120ms cubic-bezier(0.2, 0.8, 0.2, 1)',
  position: 'relative' as const,
};

function getInitials(name: string | null | undefined): string {
  if (!name) return 'LS';
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return name.slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export const MobileNavDrawer: React.FC<Props> = ({
  isOpen,
  onClose,
  onBugReport,
}) => {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isLoggedIn = Boolean(auth?.user);

  const { data } = useGetUserLeaguesQuery({ skip: !isLoggedIn });
  const leagues = data?.userLeagues ?? [];
  const currentLeague = leagues[0] ?? null;

  const isPathActive = (prefix: string) => location.pathname.startsWith(prefix);

  const handleNav = (to: string) => {
    navigate(to);
    onClose();
  };

  React.useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // LS-4986: intercept the Android/browser back button while the drawer is
  // open. Push a dummy history entry on open so the back button pops it
  // instead of navigating away; listen for popstate to close the drawer.
  // On non-back-button close (backdrop tap, X button), pop the dummy entry
  // only if history.length is exactly one ahead of where we started — if
  // handleNav fired in the meantime, length will be higher and we skip the
  // back() call to avoid pulling the user away from their destination.
  React.useEffect(() => {
    if (!isOpen) return;
    const lengthBeforePush = window.history.length;
    window.history.pushState({ navDrawerOpen: true }, '');
    let closedByBackButton = false;
    const handlePopState = () => {
      closedByBackButton = true;
      onClose();
    };
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (
        !closedByBackButton &&
        window.history.length === lengthBeforePush + 1
      ) {
        window.history.back();
      }
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  // Render via portal to document.body so the drawer escapes the nav's
  // sticky-positioned stacking context (which is capped at NAV_Z_INDEX = 200,
  // matching the fixed MobileBottomBar). Without the portal, the drawer's
  // own zIndex: 300 is bounded and the bottom nav paints over it.
  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: withAlpha(BG_DARK, 0.6),
        backdropFilter: 'blur(4px)',
        zIndex: 300,
        display: 'flex',
      }}
    >
      {/* Panel — stop propagation so clicking inside doesn't close */}
      <nav
        aria-label="Mobile navigation"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '78%',
          maxWidth: 320,
          background: `
            radial-gradient(ellipse at 0% 0%, ${withAlpha(BRAND_NAVY, 0.35)} 0%, transparent 50%),
            radial-gradient(ellipse at 100% 100%, ${withAlpha(BRAND_GOLD, 0.1)} 0%, transparent 50%),
            ${BG_DARK}
          `,
          borderRight: `1px solid ${PANEL_BORDER}`,
          height: '100%',
          overflowY: 'auto' as const,
          display: 'flex',
          flexDirection: 'column' as const,
          boxShadow: `0 20px 48px ${withAlpha(SHADOW_DARK, 0.75)}`,
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 20px 16px',
            borderBottom: `1px solid ${OUTLINE_SUBTLE}`,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <img
            src="/logo.png"
            alt="Legacy Sports"
            style={{ height: 36, width: 'auto' }}
          />
          <div>
            <div
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: 800,
                fontSize: 16,
                color: BRAND_GOLD_LIGHT,
                letterSpacing: '0.08em',
              }}
            >
              LEGACY
            </div>
            <div
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: 700,
                fontSize: 10,
                color: TEXT_MUTED,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                marginTop: 2,
              }}
            >
              Sports
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close menu"
            aria-expanded={true}
            style={{
              marginLeft: 'auto',
              background: 'transparent',
              border: 0,
              color: TEXT_MUTED,
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              borderRadius: 8,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Current league card */}
        {currentLeague && (
          <div
            onClick={() => {
              if (currentLeague.id) {
                handleNav(`/baseball/league/${currentLeague.id}`);
              }
            }}
            style={{
              margin: '12px 16px 0',
              padding: 14,
              borderRadius: 14,
              background: `linear-gradient(135deg, ${withAlpha(BRAND_NAVY, 0.6)}, ${withAlpha(BRAND_NAVY_DARK, 0.3)})`,
              border: `1px solid ${withAlpha(BRAND_GOLD, 0.35)}`,
              display: 'flex',
              gap: 12,
              alignItems: 'center',
              cursor: 'pointer',
            }}
          >
            <span
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: withAlpha(BG_DARK, 0.7),
                border: `1px solid ${withAlpha(BRAND_GOLD, 0.4)}`,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: FONT_DISPLAY,
                fontWeight: 800,
                fontSize: 12,
                color: BRAND_GOLD_LIGHT,
                flexShrink: 0,
              }}
            >
              {getInitials(currentLeague.name)}
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontWeight: 700,
                  fontSize: 13,
                  color: TEXT_PRIMARY,
                  letterSpacing: '0.04em',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {currentLeague.name}
              </div>
              {currentLeague.currentWeekNumber && (
                <div
                  style={{
                    fontFamily: "'Literata', serif",
                    fontSize: 11,
                    color: TEXT_MUTED,
                    marginTop: 2,
                  }}
                >
                  Week {currentLeague.currentWeekNumber}
                  {currentLeague.totalMatchups
                    ? ` / ${currentLeague.totalMatchups}`
                    : ''}
                </div>
              )}
            </div>
            <ChevronRight size={14} color={TEXT_TERTIARY} />
          </div>
        )}

        {/* Leagues section */}
        <div
          style={{
            padding: '16px 20px 8px',
            fontFamily: FONT_DISPLAY,
            fontWeight: 700,
            fontSize: 10,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: TEXT_TERTIARY,
          }}
        >
          Leagues
        </div>

        {[
          {
            icon: <Compass size={18} />,
            label: 'Browse public leagues',
            to: '/baseball/leagues',
          },
          {
            icon: <Ticket size={18} />,
            label: 'Join with invite code',
            to: '/baseball/league/join',
          },
        ].map((item) => (
          <button
            key={item.label}
            onClick={() => handleNav(item.to)}
            style={DRAWER_ITEM}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLElement).style.background = withAlpha(
                BRAND_NAVY,
                0.35,
              ))
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLElement).style.background =
                'transparent')
            }
          >
            {item.icon}
            {item.label}
          </button>
        ))}

        <button
          onClick={() => handleNav('/baseball/league/create')}
          style={{ ...DRAWER_ITEM, color: BRAND_GOLD_LIGHT }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLElement).style.background = withAlpha(
              BRAND_NAVY,
              0.35,
            ))
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLElement).style.background = 'transparent')
          }
        >
          <Plus size={18} color={BRAND_GOLD_LIGHT} />
          Create a new league
        </button>

        {/* Play section */}
        <div
          style={{
            padding: '16px 20px 8px',
            fontFamily: FONT_DISPLAY,
            fontWeight: 700,
            fontSize: 10,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: TEXT_TERTIARY,
          }}
        >
          Play
        </div>

        {[
          {
            Icon: Users,
            label: 'Players',
            to: '/players',
            active: isPathActive('/players') && !isPathActive('/players/stats'),
          },
          {
            Icon: BarChart2,
            label: 'Stats',
            to: '/players/stats',
            active: isPathActive('/players/stats'),
          },
          {
            Icon: Zap,
            label: 'Minigames',
            to: '/games',
            active: isPathActive('/games'),
          },
          {
            Icon: Shuffle,
            label: 'Mock Draft',
            to: '/baseball/mock-draft',
            active: isPathActive('/baseball/mock-draft'),
          },
          {
            Icon: ListOrdered,
            label: 'Standings',
            to: '/standings',
            active: isPathActive('/standings'),
          },
          {
            Icon: Trophy,
            label: 'Trophy Case',
            to: '/profile/settings',
            active: false,
          },
        ].map((item) => (
          <button
            key={item.label}
            onClick={() => handleNav(item.to)}
            style={{
              ...DRAWER_ITEM,
              background: item.active
                ? `linear-gradient(90deg, ${withAlpha(BRAND_GOLD, 0.12)}, transparent)`
                : 'transparent',
              color: item.active ? TEXT_PRIMARY : TEXT_FG2,
            }}
            onMouseEnter={(e) => {
              if (!item.active)
                (e.currentTarget as HTMLElement).style.background = withAlpha(
                  BRAND_NAVY,
                  0.35,
                );
            }}
            onMouseLeave={(e) => {
              if (!item.active)
                (e.currentTarget as HTMLElement).style.background =
                  'transparent';
            }}
          >
            {item.active && (
              <span
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 8,
                  bottom: 8,
                  width: 3,
                  borderRadius: '0 3px 3px 0',
                  background: BRAND_GOLD,
                }}
              />
            )}
            <item.Icon size={18} />
            {item.label}
          </button>
        ))}

        {/* You section */}
        <div
          style={{
            padding: '16px 20px 8px',
            fontFamily: FONT_DISPLAY,
            fontWeight: 700,
            fontSize: 10,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: TEXT_TERTIARY,
          }}
        >
          You
        </div>

        {[
          {
            icon: <User size={18} />,
            label: 'Profile',
            to: '/profile/settings',
          },
          {
            icon: <Settings size={18} />,
            label: 'Settings',
            to: '/profile/settings',
          },
          {
            icon: <HelpCircle size={18} />,
            label: 'Help & support',
            to: '/help',
          },
        ].map((item) => (
          <button
            key={item.label}
            onClick={() => handleNav(item.to)}
            style={DRAWER_ITEM}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLElement).style.background = withAlpha(
                BRAND_NAVY,
                0.35,
              ))
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLElement).style.background =
                'transparent')
            }
          >
            {item.icon}
            {item.label}
          </button>
        ))}

        <button
          onClick={() => {
            onBugReport?.();
            onClose();
          }}
          style={DRAWER_ITEM}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLElement).style.background = withAlpha(
              BRAND_NAVY,
              0.35,
            ))
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLElement).style.background = 'transparent')
          }
        >
          <Bug size={18} />
          Report a bug
        </button>

        <button
          onClick={() => {
            auth.logout().catch((err: unknown) => {
              LOGGER.error('Sign out failed', { err });
            });
            onClose();
          }}
          style={DRAWER_ITEM}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLElement).style.background = withAlpha(
              BRAND_NAVY,
              0.35,
            ))
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLElement).style.background = 'transparent')
          }
        >
          <LogOut size={18} />
          Sign out
        </button>
      </nav>
    </div>,
    document.body,
  );
};
