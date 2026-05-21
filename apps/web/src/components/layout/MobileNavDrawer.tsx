import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart2,
  Bug,
  ChevronRight,
  Compass,
  HelpCircle,
  ListOrdered,
  LogOut,
  Plus,
  Settings,
  Shuffle,
  Ticket,
  Trophy,
  User,
  Users,
  X,
  Zap,
} from '@tamagui/lucide-icons';
import { useAuth } from '@legacy-sports/shared-components/auth';
import { LOGGER } from '@legacy-sports/logging';
import { FONT_DISPLAY } from './NavDropdownShared';
import {
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  OUTLINE_SUBTLE,
  PANEL_BORDER,
} from '../../constants/colors';
import { useGetUserLeaguesQuery } from '../../api/db/graphql.generated';

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
  color: '#DEE6FF',
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

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(10,15,26,0.6)',
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
            radial-gradient(ellipse at 0% 0%, rgba(27,58,92,0.35) 0%, transparent 50%),
            radial-gradient(ellipse at 100% 100%, rgba(197,165,90,0.10) 0%, transparent 50%),
            #0A0F1A
          `,
          borderRight: `1px solid ${PANEL_BORDER}`,
          height: '100%',
          overflowY: 'auto' as const,
          display: 'flex',
          flexDirection: 'column' as const,
          boxShadow: '0 20px 48px rgba(8,12,20,0.75)',
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
                color: '#9CAAC5',
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
              color: '#9CAAC5',
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
              background:
                'linear-gradient(135deg, rgba(27,58,92,0.6), rgba(20,48,80,0.3))',
              border: `1px solid rgba(197,165,90,0.35)`,
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
                background: 'rgba(10,15,26,0.7)',
                border: `1px solid rgba(197,165,90,0.4)`,
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
                  color: '#F8FAFC',
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
                    color: '#9CAAC5',
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
            <ChevronRight size={14} color="#6C80BA" />
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
            color: '#6C80BA',
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
              ((e.currentTarget as HTMLElement).style.background =
                'rgba(27,58,92,0.35)')
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
            ((e.currentTarget as HTMLElement).style.background =
              'rgba(27,58,92,0.35)')
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
            color: '#6C80BA',
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
                ? 'linear-gradient(90deg, rgba(197,165,90,0.12), transparent)'
                : 'transparent',
              color: item.active ? '#F8FAFC' : '#DEE6FF',
            }}
            onMouseEnter={(e) => {
              if (!item.active)
                (e.currentTarget as HTMLElement).style.background =
                  'rgba(27,58,92,0.35)';
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
            color: '#6C80BA',
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
              ((e.currentTarget as HTMLElement).style.background =
                'rgba(27,58,92,0.35)')
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
            ((e.currentTarget as HTMLElement).style.background =
              'rgba(27,58,92,0.35)')
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
            ((e.currentTarget as HTMLElement).style.background =
              'rgba(27,58,92,0.35)')
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLElement).style.background = 'transparent')
          }
        >
          <LogOut size={18} />
          Sign out
        </button>
      </nav>
    </div>
  );
};
