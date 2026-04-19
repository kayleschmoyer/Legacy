import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@legacy-sports/shared-components/auth';
import {
  Check,
  ChevronDown,
  Compass,
  Plus,
  Ticket,
} from '@tamagui/lucide-icons';
import { FONT_DISPLAY, NAV_DROPDOWN_ANIMATION } from './NavDropdownShared';
import { useGetUserLeaguesQuery } from '../../api/db/graphql.generated';
import {
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  BRAND_SEAM_RED,
  OUTLINE_SUBTLE,
  SURFACE_PANEL,
} from '../../constants/colors';
import { NAV_DROPDOWN_Z_INDEX } from '../../constants/dimensions';
import { BaseballIcon, FootballIcon } from '../icons/SportIcons';

const CHIP_STYLES: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '7px 10px 7px 8px',
  border: `1px solid ${OUTLINE_SUBTLE}`,
  borderRadius: 12,
  background: 'rgba(255,255,255,0.02)',
  cursor: 'pointer',
  transition: 'all 150ms cubic-bezier(0.2, 0.8, 0.2, 1)',
  color: '#F8FAFC',
  textAlign: 'left' as const,
  maxWidth: 240,
  flexShrink: 0,
};

function getInitials(name: string | null | undefined): string {
  if (!name) return 'LS';
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return name.slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function getSportLabel(
  playerPool: string | null | undefined,
): 'baseball' | 'football' {
  if (!playerPool) return 'baseball';
  const p = playerPool.toLowerCase();
  if (p.includes('football') || p === 'nfl') return 'football';
  return 'baseball';
}

function getLeagueContext(
  leaguePhase: string | null | undefined,
  currentWeekNumber: number | null | undefined,
  totalMatchups: number | null | undefined,
): string {
  if (!leaguePhase) return '';
  if (leaguePhase === 'pre-draft') return 'Pre-Draft';
  if (leaguePhase === 'active') {
    if (currentWeekNumber && totalMatchups)
      return `Week ${currentWeekNumber} / ${totalMatchups}`;
    if (currentWeekNumber) return `Week ${currentWeekNumber}`;
    return 'Active';
  }
  if (leaguePhase === 'offseason') return 'Offseason';
  return leaguePhase;
}

interface Props {
  draftLive?: boolean;
}

export const LeagueSwitcherChip: React.FC<Props> = ({ draftLive = false }) => {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [sport, setSport] = useState<'baseball' | 'football'>('baseball');
  const ref = useRef<HTMLDivElement>(null);

  const isLoggedIn = Boolean(auth?.user);
  const { data } = useGetUserLeaguesQuery({ skip: !isLoggedIn });
  const leagues = data?.userLeagues ?? [];

  // Detect current league from URL
  const leagueIdMatch = location.pathname.match(/\/baseball\/league\/(\d+)/);
  const currentLeagueId = leagueIdMatch ? parseInt(leagueIdMatch[1], 10) : null;
  const currentLeague =
    leagues.find((l) => l.id === currentLeagueId) ?? leagues[0] ?? null;

  // Sync sport filter to current league
  useEffect(() => {
    if (currentLeague?.playerPool) {
      setSport(getSportLabel(currentLeague.playerPool));
    }
  }, [currentLeague?.playerPool]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen]);

  if (!isLoggedIn) return null;

  const initials = getInitials(currentLeague?.name);
  const leagueName = currentLeague?.name ?? 'My Leagues';
  const filteredLeagues = leagues.filter(
    (l) => getSportLabel(l.playerPool) === sport,
  );

  const chipStyle: React.CSSProperties = {
    ...CHIP_STYLES,
    ...(isOpen
      ? {
          borderColor: `rgba(197,165,90,0.4)`,
          background: 'rgba(197,165,90,0.08)',
        }
      : {}),
    ...(draftLive
      ? {
          borderColor: 'rgba(196,30,58,0.6)',
          boxShadow:
            '0 0 0 2px rgba(196,30,58,0.15), 0 0 14px rgba(196,30,58,0.2)',
          animation: 'switcherDraftGlow 2.4s ease-in-out infinite',
        }
      : {}),
  };

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      {/* Inject glow keyframes once */}
      <style>{`
        @keyframes switcherDraftGlow {
          0%,100% { box-shadow: 0 0 0 2px rgba(196,30,58,0.15), 0 0 14px rgba(196,30,58,0.2); }
          50%      { box-shadow: 0 0 0 2px rgba(196,30,58,0.35), 0 0 22px rgba(196,30,58,0.4); }
        }
      `}</style>

      <button
        data-testid="league-switcher-chip"
        onClick={() => setIsOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`Current league: ${leagueName}. Click to switch leagues.`}
        style={chipStyle}
      >
        {/* Crest */}
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: `linear-gradient(135deg, ${BRAND_NAVY} 0%, #143050 100%)`,
            border: `1px solid rgba(197,165,90,0.4)`,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: FONT_DISPLAY,
            fontWeight: 800,
            fontSize: 11,
            color: BRAND_GOLD_LIGHT,
            letterSpacing: '0.04em',
            flexShrink: 0,
            boxShadow: draftLive ? `0 0 0 2px rgba(196,30,58,0.5)` : undefined,
          }}
        >
          {initials}
        </span>

        {/* Label */}
        <span
          style={{
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
          }}
        >
          <span
            style={{
              fontFamily: FONT_DISPLAY,
              fontWeight: 700,
              fontSize: 9,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: draftLive ? BRAND_SEAM_RED : '#9CAAC5',
              lineHeight: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {draftLive ? (
              <>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: BRAND_SEAM_RED,
                    display: 'inline-block',
                    animation: 'pulse 1.4s ease-in-out infinite',
                  }}
                />
                Draft live
              </>
            ) : (
              'League'
            )}
          </span>
          <span
            style={{
              fontFamily: FONT_DISPLAY,
              fontWeight: 700,
              fontSize: 13,
              color: '#F8FAFC',
              letterSpacing: '0.02em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: 150,
            }}
          >
            {leagueName}
          </span>
        </span>

        <ChevronDown size={11} color="#9CAAC5" />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          role="listbox"
          aria-label="League selector"
          style={{
            position: 'absolute',
            left: 0,
            top: 'calc(100% + 8px)',
            width: 340,
            background: SURFACE_PANEL,
            border: `1px solid rgba(197,165,90,0.2)`,
            borderRadius: 16,
            boxShadow: '0 12px 32px rgba(8,12,20,0.65)',
            padding: 6,
            zIndex: NAV_DROPDOWN_Z_INDEX,
            animation: NAV_DROPDOWN_ANIMATION,
          }}
        >
          {/* Sport segmented control */}
          <div
            style={{
              display: 'flex',
              gap: 4,
              padding: '6px 6px 10px 6px',
            }}
          >
            {(
              [
                {
                  id: 'baseball' as const,
                  label: 'Baseball',
                  count: leagues.filter(
                    (l) => getSportLabel(l.playerPool) === 'baseball',
                  ).length,
                },
                {
                  id: 'football' as const,
                  label: 'Football',
                  count: leagues.filter(
                    (l) => getSportLabel(l.playerPool) === 'football',
                  ).length,
                },
              ] as const
            ).map((s) => (
              <button
                key={s.id}
                onClick={() => setSport(s.id)}
                style={{
                  flex: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  padding: '7px 10px',
                  borderRadius: 9999,
                  background:
                    sport === s.id ? 'rgba(197,165,90,0.12)' : 'transparent',
                  border: `1px solid ${sport === s.id ? 'rgba(197,165,90,0.45)' : OUTLINE_SUBTLE}`,
                  color: sport === s.id ? BRAND_GOLD_LIGHT : '#9CAAC5',
                  fontFamily: FONT_DISPLAY,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {s.id === 'baseball' ? (
                  <BaseballIcon
                    size={14}
                    color={sport === s.id ? BRAND_GOLD_LIGHT : '#9CAAC5'}
                  />
                ) : (
                  <FootballIcon
                    size={14}
                    color={sport === s.id ? BRAND_GOLD_LIGHT : '#9CAAC5'}
                  />
                )}
                <span>{s.label}</span>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: 18,
                    height: 16,
                    padding: '0 5px',
                    borderRadius: 9999,
                    background:
                      sport === s.id
                        ? 'rgba(197,165,90,0.25)'
                        : 'rgba(255,255,255,0.06)',
                    color: sport === s.id ? BRAND_GOLD_LIGHT : '#6C80BA',
                    fontSize: 9,
                    fontWeight: 800,
                    letterSpacing: 0,
                  }}
                >
                  {s.count}
                </span>
              </button>
            ))}
          </div>

          {/* League group header */}
          <div
            style={{
              padding: '2px 12px 6px',
              fontFamily: FONT_DISPLAY,
              fontWeight: 700,
              fontSize: 10,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#6C80BA',
            }}
          >
            Your leagues · {filteredLeagues.length}
          </div>

          {/* League rows */}
          {filteredLeagues.map((league) => {
            const isCurrent = league.id === currentLeague?.id;
            return (
              <button
                key={league.id}
                role="option"
                aria-selected={isCurrent}
                onClick={() => {
                  if (league.id) {
                    navigate(`/baseball/league/${league.id}`);
                    setIsOpen(false);
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: 12,
                  borderRadius: 12,
                  cursor: 'pointer',
                  background: isCurrent
                    ? 'rgba(197,165,90,0.08)'
                    : 'transparent',
                  border: 0,
                  width: '100%',
                  transition: 'background 120ms',
                  color: '#F8FAFC',
                }}
                onMouseEnter={(e) => {
                  if (!isCurrent)
                    (e.currentTarget as HTMLElement).style.background =
                      'rgba(27,58,92,0.3)';
                }}
                onMouseLeave={(e) => {
                  if (!isCurrent)
                    (e.currentTarget as HTMLElement).style.background =
                      'transparent';
                }}
              >
                <span
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: `linear-gradient(135deg, ${BRAND_NAVY} 0%, #143050 100%)`,
                    border: `1px solid rgba(197,165,90,0.35)`,
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
                  {getInitials(league.name)}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: FONT_DISPLAY,
                      fontWeight: 700,
                      fontSize: 14,
                      color: '#F8FAFC',
                      letterSpacing: '0.02em',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {league.name}
                  </div>
                  <div
                    style={{
                      fontFamily: "'Literata', serif",
                      fontSize: 12,
                      color: '#9CAAC5',
                      marginTop: 2,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <span>
                      {getLeagueContext(
                        league.leaguePhase,
                        league.currentWeekNumber,
                        league.totalMatchups,
                      )}
                    </span>
                  </div>
                </div>
                {isCurrent && (
                  <span style={{ marginLeft: 'auto', color: BRAND_GOLD }}>
                    <Check size={16} />
                  </span>
                )}
              </button>
            );
          })}

          {filteredLeagues.length === 0 && (
            <div
              style={{
                padding: '12px',
                fontFamily: "'Literata', serif",
                fontSize: 13,
                color: '#6C80BA',
                textAlign: 'center',
              }}
            >
              No {sport} leagues yet
            </div>
          )}

          {/* Divider */}
          <div
            style={{
              height: 1,
              background: OUTLINE_SUBTLE,
              margin: '6px 12px',
            }}
          />

          {/* Find a league */}
          <div
            style={{
              padding: '2px 12px 6px',
              fontFamily: FONT_DISPLAY,
              fontWeight: 700,
              fontSize: 10,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#6C80BA',
            }}
          >
            Find a league
          </div>

          {[
            {
              icon: <Compass size={14} />,
              label: 'Browse public leagues',
              hint: 'Open lobby',
              to: '/baseball/leagues',
            },
            {
              icon: <Ticket size={14} />,
              label: 'Join with invite code',
              hint: undefined,
              to: '/baseball/leagues/join',
            },
          ].map((item) => (
            <button
              key={item.label}
              onClick={() => {
                navigate(item.to);
                setIsOpen(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 12px',
                borderRadius: 10,
                cursor: 'pointer',
                fontFamily: "'Literata', serif",
                fontSize: 14,
                color: '#F8FAFC',
                background: 'transparent',
                border: 0,
                width: '100%',
                textAlign: 'left',
                transition: 'background 120ms',
              }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLElement).style.background =
                  'rgba(27,58,92,0.3)')
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLElement).style.background =
                  'transparent')
              }
            >
              <span style={{ color: '#6C80BA' }}>{item.icon}</span>
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.hint && (
                <span
                  style={{
                    fontFamily: FONT_DISPLAY,
                    fontWeight: 700,
                    fontSize: 9,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: '#6C80BA',
                    padding: '3px 7px',
                    borderRadius: 6,
                    background: 'rgba(27,58,92,0.4)',
                    border: `1px solid ${OUTLINE_SUBTLE}`,
                    flexShrink: 0,
                  }}
                >
                  {item.hint}
                </span>
              )}
            </button>
          ))}

          <button
            onClick={() => {
              navigate('/baseball/leagues/create');
              setIsOpen(false);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 12px',
              borderRadius: 10,
              cursor: 'pointer',
              fontFamily: "'Literata', serif",
              fontSize: 14,
              color: BRAND_GOLD_LIGHT,
              background: 'transparent',
              border: 0,
              width: '100%',
              textAlign: 'left',
              transition: 'background 120ms',
            }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLElement).style.background =
                'rgba(27,58,92,0.3)')
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLElement).style.background =
                'transparent')
            }
          >
            <Plus size={14} color={BRAND_GOLD_LIGHT} />
            <span>Create a new league</span>
          </button>
        </div>
      )}
    </div>
  );
};
