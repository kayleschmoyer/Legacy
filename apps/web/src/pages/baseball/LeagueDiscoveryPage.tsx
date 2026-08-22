import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spinner, YStack } from 'tamagui';
import { AlertCircle } from '@tamagui/lucide-icons/icons/AlertCircle';
import { AlertTriangle } from '@tamagui/lucide-icons/icons/AlertTriangle';
import { Check } from '@tamagui/lucide-icons/icons/Check';
import { Plus } from '@tamagui/lucide-icons/icons/Plus';
import { RefreshCw } from '@tamagui/lucide-icons/icons/RefreshCw';
import { Search } from '@tamagui/lucide-icons/icons/Search';
import { Trophy } from '@tamagui/lucide-icons/icons/Trophy';
import {
  GetPublicLeagues,
  Sport,
  useGetPublicLeaguesQuery,
  useJoinPublicLeagueMutation,
} from '@legacy-sports/graphql';
import { PageMeta } from '../../components/PageMeta';
import { TEXT_ON_GOLD } from '../../constants/colors';
import { FONT_BODY, FONT_DISPLAY } from '../../constants/typography';

// ── Constants ────────────────────────────────────────────────────────────────

type DraftStatusFilter = 'all' | 'open' | 'queued' | 'in-progress';
type PlayerPoolFilter = 'all' | 'nl' | 'al';

interface DraftStatusMeta {
  short: string;
  full: string;
  bg: string;
  color: string;
  border: string;
  pulse?: boolean;
}

const DRAFT_STATUS_META: Record<string, DraftStatusMeta> = {
  'in-progress': {
    short: 'Draft Live',
    full: 'Draft in Progress',
    bg: 'var(--red2)',
    color: 'var(--brandSeamRedLight)',
    border: 'var(--red6)',
    pulse: true,
  },
  queued: {
    short: 'Queued',
    full: 'Draft Queued',
    bg: 'var(--accentMuted)',
    color: 'var(--brandNavyLight)',
    border: 'color-mix(in srgb, var(--brandNavyLight) 40%, transparent)',
  },
  'not-started': {
    short: 'Open',
    full: 'Open · Pre-Draft',
    bg: 'var(--warningMuted)',
    color: 'var(--brandGoldLight)',
    border: 'color-mix(in srgb, var(--brandGold) 40%, transparent)',
  },
  paused: {
    short: 'Paused',
    full: 'Draft Paused',
    bg: 'var(--warningMuted)',
    color: 'var(--amber8)',
    border: 'color-mix(in srgb, var(--amber8) 40%, transparent)',
  },
  completed: {
    short: 'Closed',
    full: 'Draft Complete',
    bg: 'var(--surfaceSubtle)',
    color: 'var(--textMuted)',
    border: 'var(--outlineStrong)',
  },
};

const POOL_META: Record<string, { name: string; color: string }> = {
  all: { name: 'Universal Pool', color: 'var(--color12)' },
  nl: { name: 'NL Only', color: 'var(--brandNavyLight)' },
  al: { name: 'AL Only', color: 'var(--amber8)' },
};

const DRAFT_STATUS_FILTERS: { label: string; value: DraftStatusFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Open (Not Started)', value: 'open' },
  { label: 'Queued', value: 'queued' },
  { label: 'In Progress', value: 'in-progress' },
];

const PLAYER_POOL_FILTERS: { label: string; value: PlayerPoolFilter }[] = [
  { label: 'All Leagues', value: 'all' },
  { label: 'NL Only', value: 'nl' },
  { label: 'AL Only', value: 'al' },
];

// ── Sport-specific copy ─────────────────────────────────────────────────────
// This page is shared by /baseball/leagues and /football/leagues. The player
// pool filter (NL/AL) is a baseball-only concept, so it's hidden for football
// rather than built out for the nfl/afc/nfc pools the backend already
// supports but no football UI surface exposes yet.
const SPORT_DISCOVERY_META: Record<
  'baseball' | 'football',
  { label: string; description: string; showPlayerPoolFilter: boolean }
> = {
  baseball: {
    label: 'Baseball · Public Leagues',
    description:
      'Find a public fantasy baseball league to join — browse open leagues across every era of the game.',
    showPlayerPoolFilter: true,
  },
  football: {
    label: 'Football · Public Leagues',
    description:
      'Find a public fantasy football league to join — browse open leagues and jump into the season.',
    showPlayerPoolFilter: false,
  },
};

// ── Pill ─────────────────────────────────────────────────────────────────────

function FilterPill({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`ls-discovery-pill${active ? ' is-active' : ''}`}
      style={{
        fontFamily: FONT_DISPLAY,
        fontWeight: 700,
        fontSize: 11,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        padding: '8px 14px',
        borderRadius: 9999,
        border: `1px solid ${active ? 'color-mix(in srgb, var(--brandNavyLight) 80%, transparent)' : 'var(--outlineSubtle)'}`,
        background: active ? 'var(--accentMuted)' : 'transparent',
        color: active ? 'var(--textOnAccent)' : 'var(--textMuted)',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        transition: 'all 150ms ease',
      }}
    >
      {children}
      {label}
    </button>
  );
}

// ── Draft status chip ─────────────────────────────────────────────────────────

function DraftChip({ status }: { status: string }) {
  const meta = DRAFT_STATUS_META[status] ?? DRAFT_STATUS_META['not-started'];
  return (
    <span
      style={{
        fontFamily: FONT_DISPLAY,
        fontWeight: 700,
        fontSize: 11,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        padding: '6px 11px',
        borderRadius: 9999,
        border: `1px solid ${meta.border}`,
        background: meta.bg,
        color: meta.color,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      <span
        className={meta.pulse ? 'ls-dot-pulse' : undefined}
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: 'currentColor',
          display: 'inline-block',
        }}
      />
      {meta.short}
    </span>
  );
}

// ── Skeleton card ─────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div
      style={{
        background: 'var(--surfaceCard)',
        border: `1px solid ${'var(--glassBorder)'}`,
        borderRadius: 16,
        padding: '20px 22px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 14,
        }}
      >
        <div style={{ flex: 1 }}>
          <div className="ls-skeleton" style={{ height: 24, width: '60%' }} />
          <div
            className="ls-skeleton"
            style={{ height: 14, width: '40%', marginTop: 8 }}
          />
        </div>
        <div
          className="ls-skeleton"
          style={{ height: 22, width: 88, borderRadius: 9999 }}
        />
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr auto',
          gap: 16,
          padding: '14px 0',
          borderTop: `1px solid ${'var(--outlineSubtle)'}`,
          borderBottom: `1px solid ${'var(--outlineSubtle)'}`,
        }}
      >
        <div>
          <div className="ls-skeleton" style={{ height: 10, width: 60 }} />
          <div
            className="ls-skeleton"
            style={{ height: 36, width: '80%', marginTop: 6 }}
          />
        </div>
        <div>
          <div className="ls-skeleton" style={{ height: 10, width: 60 }} />
          <div
            className="ls-skeleton"
            style={{ height: 36, width: '80%', marginTop: 6 }}
          />
        </div>
        <div>
          <div className="ls-skeleton" style={{ height: 10, width: 60 }} />
          <div
            className="ls-skeleton"
            style={{ height: 36, width: 60, marginTop: 6 }}
          />
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div className="ls-skeleton" style={{ height: 13, width: 120 }} />
        <div
          className="ls-skeleton"
          style={{ height: 42, width: 140, borderRadius: 12 }}
        />
      </div>
    </div>
  );
}

// ── Spots meter ───────────────────────────────────────────────────────────────

function SpotsMeter({
  available,
  total,
  isFull,
}: {
  available: number;
  total: number;
  isFull: boolean;
}) {
  const fillPct = total > 0 ? ((total - available) / total) * 100 : 100;
  return (
    <div style={{ minWidth: 140 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 8,
        }}
      >
        <span
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 700,
            fontSize: 10,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--textMuted)',
          }}
        >
          Spots Open
        </span>
      </div>
      <div style={{ marginBottom: 8 }}>
        <span
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 800,
            fontSize: 22,
            color: isFull ? 'var(--textMuted)' : 'var(--brandGoldLight)',
            letterSpacing: '0.02em',
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {available}
        </span>
        <span
          style={{
            color: 'var(--textMuted)',
            fontSize: 15,
            fontWeight: 600,
            marginLeft: 2,
          }}
        >
          {' / '}
          {total}
        </span>
      </div>
      <div
        style={{
          height: 4,
          background: 'var(--glassBorder)',
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: '100%',
            background: isFull
              ? 'var(--outlineSubtle)'
              : `linear-gradient(90deg, ${'var(--brandGoldDark)'}, ${'var(--brandGold)'})`,
            borderRadius: 2,
            transform: `scaleX(${fillPct / 100})`,
            transformOrigin: 'left',
            transition: 'transform 300ms ease',
          }}
        />
      </div>
    </div>
  );
}

// ── League card ───────────────────────────────────────────────────────────────

interface LeagueCardProps {
  lg: {
    id?: number | null;
    name?: string | null;
    draftStatus?: string | null;
    playerPool?: string | null;
    availableSpots?: number | null;
    totalSpots?: number | null;
    maxRosterSize?: number | null;
    isFull?: boolean | null;
    isAlreadyMember?: boolean | null;
  };
  joining: boolean;
  joined: boolean;
  joinError: string | null;
  teamName: string;
  onOpenJoin: () => void;
  onCancelJoin: () => void;
  onTeamNameChange: (v: string) => void;
  onSubmitJoin: () => Promise<void>;
  onViewLeague: () => void;
  submitting: boolean;
}

function LeagueCard({
  lg,
  joining,
  joined,
  joinError,
  teamName,
  onOpenJoin,
  onCancelJoin,
  onTeamNameChange,
  onSubmitJoin,
  onViewLeague,
  submitting,
}: LeagueCardProps) {
  const draftStatus = lg.draftStatus ?? 'not-started';
  const pool = POOL_META[lg.playerPool ?? 'all'] ?? POOL_META['all'];
  const isFull = lg.isFull ?? false;
  const isMember = lg.isAlreadyMember ?? false;
  const available = lg.availableSpots ?? 0;
  const total = lg.totalSpots ?? 0;

  const cardStyle: React.CSSProperties = {
    background: isMember
      ? `linear-gradient(135deg, ${'var(--accentMuted)'} 0%, ${'var(--warningMuted)'} 100%), ${'var(--surfaceCard)'}`
      : 'var(--surfaceCard)',
    border: `1px solid ${isMember ? 'color-mix(in srgb, var(--brandGold) 45%, transparent)' : 'var(--glassBorder)'}`,
    borderRadius: 16,
    overflow: 'hidden',
    transition: 'all 220ms ease',
    opacity: isFull && !isMember ? 0.78 : 1,
    boxShadow: isMember
      ? `0 4px 24px ${'var(--shadowColor)'}, 0 0 0 1px ${'var(--warningMuted)'}`
      : `0 2px 12px ${'var(--shadowColor)'}`,
  };

  return (
    <article className="ls-discovery-card" style={cardStyle}>
      {/* Member ribbon */}
      {isMember && (
        <div
          data-testid="already-member-banner"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 22px',
            background: `linear-gradient(90deg, ${'var(--brandNavy)'} 0%, ${'var(--accentMuted)'} 100%)`,
            borderBottom: `1px solid ${'color-mix(in srgb, var(--brandGold) 30%, transparent)'}`,
            fontFamily: FONT_DISPLAY,
            fontWeight: 700,
            fontSize: 11,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--brandGoldLight)',
          }}
        >
          <Trophy size={14} color="var(--brandGoldLight)" />
          You&rsquo;re already in this league
        </div>
      )}

      {/* Join success overlay */}
      {joined ? (
        <>
          <div style={{ padding: '20px 22px 0' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 14,
              }}
            >
              <h2
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontWeight: 800,
                  fontSize: 24,
                  color: 'var(--color12)',
                  margin: 0,
                  letterSpacing: '-0.01em',
                }}
              >
                {lg.name}
              </h2>
              <DraftChip status={draftStatus} />
            </div>
          </div>
          <div
            style={{
              padding: '22px',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              background: `linear-gradient(135deg, ${'var(--successMuted)'} 0%, ${'var(--successMuted)'} 100%)`,
              borderTop: `1px solid ${'var(--green7)'}`,
              marginTop: 14,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: 'var(--successMuted)',
                color: 'var(--green9)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Check size={18} color="var(--green9)" />
            </div>
            <div>
              <div
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontWeight: 700,
                  fontSize: 16,
                  color: 'var(--color12)',
                  letterSpacing: '0.02em',
                }}
              >
                Successfully joined {lg.name}
              </div>
              <div
                style={{
                  fontFamily: FONT_BODY,
                  fontSize: 13,
                  color: 'var(--textMuted)',
                  marginTop: 2,
                  fontStyle: 'italic',
                }}
              >
                Redirecting to your clubhouse…
              </div>
            </div>
          </div>
        </>
      ) : (
        <div style={{ padding: '20px 22px' }}>
          {/* Card top */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 14,
              marginBottom: 14,
            }}
          >
            <div>
              <h2
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontWeight: 800,
                  fontSize: 24,
                  color: 'var(--color12)',
                  margin: 0,
                  letterSpacing: '-0.01em',
                  lineHeight: 1.1,
                }}
              >
                {lg.name}
              </h2>
              <div
                style={{
                  fontFamily: FONT_BODY,
                  fontSize: 13,
                  color: 'var(--textMuted)',
                  marginTop: 6,
                }}
              >
                {(POOL_META[lg.playerPool ?? 'all'] ?? POOL_META['all']).name}
              </div>
            </div>
            <DraftChip status={draftStatus} />
          </div>

          {/* Stat line */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr auto',
              gap: 16,
              alignItems: 'end',
              padding: '14px 0',
              borderTop: `1px solid ${'var(--outlineSubtle)'}`,
              borderBottom: `1px solid ${'var(--outlineSubtle)'}`,
              marginBottom: 14,
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontWeight: 700,
                  fontSize: 10,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: 'var(--textMuted)',
                  marginBottom: 4,
                }}
              >
                Player Pool
              </div>
              <div
                style={{
                  fontFamily: FONT_BODY,
                  fontSize: 14,
                  color: pool.color,
                  fontWeight: 500,
                }}
              >
                {pool.name}
              </div>
            </div>
            <div>
              <div
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontWeight: 700,
                  fontSize: 10,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: 'var(--textMuted)',
                  marginBottom: 4,
                }}
              >
                Roster
              </div>
              <div
                style={{
                  fontFamily: FONT_BODY,
                  fontSize: 14,
                  color: 'var(--color12)',
                  fontWeight: 500,
                }}
              >
                <span
                  style={{
                    fontFamily: FONT_DISPLAY,
                    fontWeight: 800,
                    fontSize: 18,
                    letterSpacing: '0.02em',
                  }}
                >
                  {lg.maxRosterSize}
                </span>{' '}
                <span style={{ color: 'var(--textMuted)' }}>
                  players / team
                </span>
              </div>
            </div>
            <SpotsMeter available={available} total={total} isFull={isFull} />
          </div>

          {/* Card actions */}
          {joining ? (
            <div
              style={{
                marginTop: 4,
                padding: 16,
                background: 'var(--background075)',
                border: `1px solid ${'var(--outlineSubtle)'}`,
                borderRadius: 12,
              }}
            >
              <div
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontWeight: 700,
                  fontSize: 10,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: 'var(--brandGoldLight)',
                  marginBottom: 8,
                }}
              >
                Choose a team name
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  flexWrap: 'wrap',
                  alignItems: 'stretch',
                }}
              >
                <input
                  autoFocus
                  data-testid={
                    lg.id != null
                      ? `league-card-${lg.id}-team-name-input`
                      : undefined
                  }
                  aria-label="Team name"
                  placeholder="e.g. Shortstop Stars"
                  value={teamName}
                  onChange={(e) => onTeamNameChange(e.target.value)}
                  maxLength={40}
                  style={{
                    flex: 1,
                    minWidth: 200,
                    padding: '11px 14px',
                    fontFamily: FONT_BODY,
                    fontSize: 15,
                    color: 'var(--color12)',
                    background: 'var(--background075)',
                    border: `1px solid ${'var(--glassBorderHover)'}`,
                    borderRadius: 8,
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !submitting && teamName.trim()) {
                      e.preventDefault();
                      void onSubmitJoin();
                    }
                  }}
                />
                <button
                  onClick={onCancelJoin}
                  disabled={submitting}
                  style={{
                    fontFamily: FONT_DISPLAY,
                    fontWeight: 700,
                    fontSize: 12,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    padding: '11px 18px',
                    borderRadius: 12,
                    border: `1px solid ${'var(--glassBorderHover)'}`,
                    background: 'transparent',
                    color: 'var(--color12)',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => void onSubmitJoin()}
                  disabled={submitting || !teamName.trim()}
                  className="ls-discovery-btn-lift"
                  style={{
                    fontFamily: FONT_DISPLAY,
                    fontWeight: 700,
                    fontSize: 12,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    padding: '11px 18px',
                    borderRadius: 12,
                    border: `1px solid ${'var(--brandGoldDark)'}`,
                    background: 'var(--brandGold)',
                    color: TEXT_ON_GOLD,
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    opacity: submitting ? 0.7 : 1,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  {submitting ? <Spinner size="small" /> : 'Join League'}
                </button>
              </div>
              <div
                style={{
                  marginTop: 8,
                  fontFamily: FONT_BODY,
                  fontSize: 12,
                  color: 'var(--textMuted)',
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span>Required · 1–40 characters</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {teamName.length}/40
                </span>
              </div>
              {joinError && (
                <div
                  style={{
                    marginTop: 10,
                    padding: '10px 14px',
                    background: 'var(--red2)',
                    border: `1px solid ${'var(--red6)'}`,
                    borderRadius: 8,
                    fontFamily: FONT_BODY,
                    fontSize: 13,
                    color: 'var(--brandSeamRedLight)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <AlertCircle size={16} color="var(--brandSeamRedLight)" />
                  {joinError}
                </div>
              )}
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                gap: 10,
                justifyContent: 'flex-end',
                flexWrap: 'wrap',
              }}
            >
              {isMember ? (
                <button
                  onClick={onViewLeague}
                  className="ls-discovery-btn-lift"
                  style={{
                    fontFamily: FONT_DISPLAY,
                    fontWeight: 700,
                    fontSize: 12,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    padding: '11px 18px',
                    borderRadius: 12,
                    border: 'none',
                    background: 'var(--brandGold)',
                    color: TEXT_ON_GOLD,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  View League <span>→</span>
                </button>
              ) : isFull ? (
                <span
                  style={{
                    fontFamily: FONT_BODY,
                    fontSize: 14,
                    color: 'var(--textMuted)',
                    fontStyle: 'italic',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: 'var(--textMuted)',
                      display: 'inline-block',
                    }}
                  />
                  This league is full
                </span>
              ) : (
                <button
                  onClick={onOpenJoin}
                  data-testid={
                    lg.id != null
                      ? `league-card-${lg.id}-join-button`
                      : undefined
                  }
                  className="ls-discovery-btn-lift"
                  style={{
                    fontFamily: FONT_DISPLAY,
                    fontWeight: 700,
                    fontSize: 12,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    padding: '11px 18px',
                    borderRadius: 12,
                    border: `1px solid ${'var(--brandNavyLight)'}`,
                    background: 'var(--brandNavy)',
                    color: 'var(--textOnAccent)',
                    cursor: 'pointer',
                    transition: 'all 150ms ease',
                  }}
                >
                  Join League →
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export interface LeagueDiscoveryPageProps {
  /** Which sport's public leagues to browse. Defaults to baseball for backward compatibility. */
  sport?: 'baseball' | 'football';
}

export function LeagueDiscoveryPage({
  sport = 'baseball',
}: LeagueDiscoveryPageProps = {}): React.JSX.Element {
  const navigate = useNavigate();
  const meta = SPORT_DISCOVERY_META[sport];
  const sportEnum = sport === 'football' ? Sport.Football : Sport.Baseball;

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [draftFilter, setDraftFilter] = useState<DraftStatusFilter>('all');
  const [poolFilter, setPoolFilter] = useState<PlayerPoolFilter>('all');
  const [joiningLeagueId, setJoiningLeagueId] = useState<number | null>(null);
  const [teamName, setTeamName] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinedLeagueId, setJoinedLeagueId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    return () => {
      if (navTimerRef.current != null) clearTimeout(navTimerRef.current);
    };
  }, []);

  const { data, loading, error, refetch } = useGetPublicLeaguesQuery({
    variables: {
      sport: sportEnum,
      search: debouncedSearch || undefined,
      draftStatus:
        draftFilter !== 'all'
          ? draftFilter === 'open'
            ? 'not-started'
            : draftFilter
          : undefined,
      playerPool: poolFilter !== 'all' ? poolFilter : undefined,
      limit: 50,
      offset: 0,
    },
    fetchPolicy: 'cache-and-network',
  });

  const [joinPublicLeague, { loading: submitting }] =
    useJoinPublicLeagueMutation({
      refetchQueries: [{ query: GetPublicLeagues }],
    });

  const leagues = data?.publicLeagues ?? [];

  const handleRefresh = () => {
    setRefreshing(true);
    void refetch().finally(() => setRefreshing(false));
  };

  const handleJoinStart = (leagueId: number) => {
    setJoiningLeagueId(leagueId);
    setTeamName('');
    setJoinError(null);
  };

  const handleJoinCancel = () => {
    setJoiningLeagueId(null);
    setTeamName('');
    setJoinError(null);
  };

  const handleJoinSubmit = async (leagueId: number) => {
    if (!teamName.trim()) {
      setJoinError('Please enter a team name');
      return;
    }
    setJoinError(null);
    try {
      const result = await joinPublicLeague({
        variables: { leagueId, teamName: teamName.trim() },
      });
      if (result.data?.joinPublicLeague?.success) {
        const joinedId = result.data.joinPublicLeague.leagueId ?? leagueId;
        setJoinedLeagueId(joinedId);
        setJoiningLeagueId(null);
        if (navTimerRef.current != null) clearTimeout(navTimerRef.current);
        navTimerRef.current = setTimeout(() => {
          navigate(`/${sport}/league/${joinedId}`);
        }, 1200);
      } else {
        setJoinError(
          result.data?.joinPublicLeague?.message ?? 'Failed to join league',
        );
      }
    } catch (err) {
      setJoinError((err as Error).message || 'Failed to join league');
    }
  };

  const showLoading = loading && leagues.length === 0;
  const showError = !!error;
  const isSearchActive =
    search.trim() || draftFilter !== 'all' || poolFilter !== 'all';
  const showEmptyFiltered = !loading && leagues.length === 0 && isSearchActive;
  const showEmpty = !loading && leagues.length === 0 && !isSearchActive;
  const showPopulated = leagues.length > 0;

  // ── Styles ──────────────────────────────────────────────────────────────────

  const controlsPanelStyle: React.CSSProperties = {
    background: 'var(--surfacePanel)',
    border: `1px solid ${'var(--outlineSubtle)'}`,
    borderRadius: 16,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    marginBottom: 22,
  };

  const searchInputStyle: React.CSSProperties = {
    width: '100%',
    padding: '13px 14px 13px 44px',
    fontFamily: FONT_BODY,
    fontSize: 15,
    color: 'var(--color12)',
    background: 'var(--background075)',
    border: `1px solid ${'var(--outlineSubtle)'}`,
    borderRadius: 10,
    transition: 'all 150ms ease',
  };

  return (
    <YStack
      className="ls-discovery-bg"
      flex={1}
      padding="$6"
      $sm={{ padding: '$4' }}
      maxWidth={1000}
      marginHorizontal="auto"
      width="100%"
    >
      <PageMeta title="Browse Public Leagues" description={meta.description} />

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: 20,
          marginBottom: 28,
        }}
      >
        <div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 6,
            }}
          >
            <span
              style={{
                width: 18,
                height: 1,
                background: 'var(--brandGold)',
                opacity: 0.6,
                display: 'inline-block',
              }}
            />
            <span
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: 700,
                fontSize: 11,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: 'var(--brandGoldLight)',
              }}
            >
              {meta.label}
            </span>
          </div>
          <h1
            style={{
              fontFamily: FONT_DISPLAY,
              fontWeight: 800,
              fontSize: 'clamp(32px, 4vw, 48px)',
              lineHeight: 1,
              letterSpacing: '-0.02em',
              color: 'var(--color12)',
              margin: '0 0 10px',
            }}
          >
            Browse Public Leagues
          </h1>
          <p
            style={{
              fontFamily: FONT_BODY,
              color: 'var(--textMuted)',
              fontSize: 16,
              lineHeight: 1.55,
              maxWidth: '58ch',
              margin: 0,
            }}
          >
            Find a clubhouse that fits your era. Public leagues are open to any
            manager — join and compete on real archived statistics.
          </p>
        </div>
        <button
          onClick={() => navigate(`/${sport}/league/create`)}
          className="ls-discovery-btn-lift"
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 700,
            fontSize: 12,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            padding: '11px 16px',
            borderRadius: 12,
            background: 'transparent',
            color: 'var(--color12)',
            border: `1px solid ${'var(--glassBorderHover)'}`,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            whiteSpace: 'nowrap',
            flexShrink: 0,
            transition: 'all 150ms ease',
          }}
        >
          <Plus size={14} /> Create a League
        </button>
      </div>

      {/* ── Controls: search + filters ───────────────────────────────────── */}
      <div style={controlsPanelStyle}>
        {/* Search */}
        <div style={{ position: 'relative' }}>
          <span
            style={{
              position: 'absolute',
              left: 14,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--textMuted)',
              pointerEvents: 'none',
              display: 'flex',
            }}
          >
            <Search size={18} color="var(--textMuted)" />
          </span>
          <input
            aria-label="Search leagues"
            className="ls-discovery-search"
            style={searchInputStyle}
            placeholder="Search leagues by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Filter rows */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 20,
            alignItems: 'flex-start',
          }}
        >
          {/* Draft Status */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: 700,
                fontSize: 10,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: 'var(--textMuted)',
              }}
            >
              Draft Status
            </span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {DRAFT_STATUS_FILTERS.map((opt) => (
                <FilterPill
                  key={opt.value}
                  label={opt.label}
                  active={draftFilter === opt.value}
                  onClick={() => setDraftFilter(opt.value)}
                >
                  {opt.value === 'in-progress' && (
                    <span
                      className="ls-dot-pulse"
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        background: 'var(--brandSeamRedLight)',
                        display: 'inline-block',
                      }}
                    />
                  )}
                </FilterPill>
              ))}
            </div>
          </div>

          {/* Player Pool — baseball only (NL/AL); football has no equivalent UI yet */}
          {meta.showPlayerPoolFilter && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontWeight: 700,
                  fontSize: 10,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: 'var(--textMuted)',
                }}
              >
                Player Pool
              </span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {PLAYER_POOL_FILTERS.map((opt) => (
                  <FilterPill
                    key={opt.value}
                    label={opt.label}
                    active={poolFilter === opt.value}
                    onClick={() => setPoolFilter(opt.value)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Results header ───────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 14,
          padding: '0 4px',
        }}
      >
        <div
          data-testid="discovery-results-count"
          style={{
            fontFamily: FONT_BODY,
            color: 'var(--textMuted)',
            fontSize: 14,
          }}
        >
          {showLoading && (
            <span style={{ fontStyle: 'italic' }}>Scanning the clubhouse…</span>
          )}
          {showError && (
            <span style={{ fontStyle: 'italic' }}>Unable to load leagues.</span>
          )}
          {(showEmpty || showEmptyFiltered) && (
            <span>
              <b
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontWeight: 800,
                  fontSize: 22,
                  color: 'var(--color12)',
                  letterSpacing: '0.02em',
                  fontVariantNumeric: 'tabular-nums',
                  marginRight: 6,
                  verticalAlign: -1,
                }}
              >
                0
              </b>
              leagues
              <span style={{ color: 'var(--textMuted)', margin: '0 6px' }}>
                ·
              </span>
              <span style={{ color: 'var(--textMuted)' }}>
                {showEmptyFiltered
                  ? 'none match your filters'
                  : 'none available right now'}
              </span>
            </span>
          )}
          {showPopulated && (
            <span>
              <b
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontWeight: 800,
                  fontSize: 22,
                  color: 'var(--color12)',
                  letterSpacing: '0.02em',
                  fontVariantNumeric: 'tabular-nums',
                  marginRight: 6,
                  verticalAlign: -1,
                }}
              >
                {leagues.length}
              </b>
              {leagues.length === 1 ? 'league' : 'leagues'}
              <span style={{ color: 'var(--textMuted)', margin: '0 6px' }}>
                ·
              </span>
              <span style={{ color: 'var(--textMuted)' }}>
                available to join
              </span>
            </span>
          )}
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing || loading}
          className="ls-discovery-refresh"
          style={{
            background: 'transparent',
            border: 0,
            color: 'var(--textMuted)',
            cursor: refreshing || loading ? 'not-allowed' : 'pointer',
            opacity: refreshing || loading ? 0.6 : 1,
            fontFamily: FONT_DISPLAY,
            fontWeight: 700,
            fontSize: 11,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 10px',
            borderRadius: 8,
          }}
        >
          <span
            className={refreshing ? 'ls-spinning' : undefined}
            style={{ display: 'inline-flex' }}
          >
            <RefreshCw size={14} />
          </span>
          Refresh
        </button>
      </div>

      {/* ── Loading state ────────────────────────────────────────────────── */}
      {showLoading && (
        <>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
              padding: 32,
              color: 'var(--textMuted)',
            }}
          >
            <Spinner size="large" color="var(--brandGold)" />
            <span
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: 700,
                fontSize: 12,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--textMuted)',
              }}
            >
              Searching for Public Leagues…
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              marginTop: 4,
            }}
          >
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </>
      )}

      {/* ── Error state ──────────────────────────────────────────────────── */}
      {showError && (
        <div
          role="alert"
          style={{
            background: `linear-gradient(135deg, ${'var(--red2)'} 0%, ${'var(--background075)'} 100%), ${'var(--surfaceCard)'}`,
            border: `1px solid ${'var(--red6)'}`,
            borderRadius: 16,
            padding: 28,
            display: 'flex',
            gap: 18,
            alignItems: 'flex-start',
            boxShadow: `0 2px 12px ${'var(--shadowColor)'}`,
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: 'var(--red2)',
              color: 'var(--brandSeamRedLight)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <AlertTriangle size={24} color="var(--brandSeamRedLight)" />
          </div>
          <div style={{ flex: 1 }}>
            <h3
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: 800,
                fontSize: 22,
                color: 'var(--color12)',
                margin: '0 0 6px',
                letterSpacing: '-0.005em',
              }}
            >
              Unable to load public leagues
            </h3>
            <p
              style={{
                fontFamily: FONT_BODY,
                color: 'var(--textMuted)',
                lineHeight: 1.55,
                margin: '0 0 14px',
                maxWidth: '60ch',
              }}
            >
              We couldn&rsquo;t reach the league directory. Check your
              connection and try again — your saved leagues are unaffected.
            </p>
            {error && (
              <code
                style={{
                  fontFamily: "'Fira Code', 'Courier New', monospace",
                  fontSize: 12,
                  color: 'var(--textMuted)',
                  padding: '8px 10px',
                  background: 'var(--shadowColor)',
                  borderRadius: 6,
                  marginBottom: 14,
                  display: 'inline-block',
                }}
              >
                {error.message}
              </code>
            )}
            <div>
              <button
                onClick={handleRefresh}
                className="ls-discovery-btn-lift"
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontWeight: 700,
                  fontSize: 12,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  padding: '11px 18px',
                  borderRadius: 12,
                  border: `1px solid ${'var(--brandNavyLight)'}`,
                  background: 'var(--brandNavy)',
                  color: 'var(--textOnAccent)',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <RefreshCw size={14} /> Retry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Empty: no leagues ────────────────────────────────────────────── */}
      {showEmpty && (
        <div
          style={{
            background: 'var(--surfaceCard)',
            border: `1px solid ${'var(--glassBorder)'}`,
            borderRadius: 20,
            padding: '48px 32px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 14,
            boxShadow: `0 2px 12px ${'var(--shadowColor)'}`,
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              background: `linear-gradient(135deg, ${'var(--accentMuted)'}, ${'var(--warningMuted)'})`,
              border: `1px solid ${'color-mix(in srgb, var(--brandGold) 25%, transparent)'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 4,
            }}
          >
            <Trophy size={32} color="var(--brandGoldLight)" />
          </div>
          <h3
            style={{
              fontFamily: FONT_DISPLAY,
              fontWeight: 800,
              fontSize: 26,
              color: 'var(--color12)',
              margin: 0,
              letterSpacing: '-0.01em',
            }}
          >
            No public leagues found
          </h3>
          <p
            style={{
              fontFamily: FONT_BODY,
              color: 'var(--textMuted)',
              maxWidth: '48ch',
              lineHeight: 1.55,
              margin: 0,
              fontStyle: 'italic',
            }}
          >
            No public leagues are currently open. Start your own league and
            invite the public — you&rsquo;ll be first at bat.
          </p>
          <button
            onClick={() => navigate(`/${sport}/league/create`)}
            className="ls-discovery-btn-lift"
            style={{
              marginTop: 8,
              fontFamily: FONT_DISPLAY,
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              padding: '11px 18px',
              borderRadius: 12,
              border: 'none',
              background: 'var(--brandGold)',
              color: TEXT_ON_GOLD,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Plus size={14} /> Create a Public League
          </button>
          <div
            style={{
              fontFamily: FONT_DISPLAY,
              fontWeight: 700,
              fontSize: 10,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'var(--textMuted)',
              marginTop: 8,
            }}
          >
            Or check back in a few minutes
          </div>
        </div>
      )}

      {/* ── Empty: filtered ──────────────────────────────────────────────── */}
      {showEmptyFiltered && (
        <div
          style={{
            background: 'var(--surfaceCard)',
            border: `1px solid ${'var(--glassBorder)'}`,
            borderRadius: 20,
            padding: '48px 32px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 14,
            boxShadow: `0 2px 12px ${'var(--shadowColor)'}`,
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              background: `linear-gradient(135deg, ${'var(--accentMuted)'}, ${'var(--warningMuted)'})`,
              border: `1px solid ${'color-mix(in srgb, var(--brandGold) 25%, transparent)'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 4,
            }}
          >
            <Search size={28} color="var(--brandGoldLight)" />
          </div>
          <h3
            style={{
              fontFamily: FONT_DISPLAY,
              fontWeight: 800,
              fontSize: 26,
              color: 'var(--color12)',
              margin: 0,
              letterSpacing: '-0.01em',
            }}
          >
            No leagues matched your search
          </h3>
          <p
            style={{
              fontFamily: FONT_BODY,
              color: 'var(--textMuted)',
              maxWidth: '48ch',
              lineHeight: 1.55,
              margin: 0,
            }}
          >
            {search.trim() ? (
              <>
                Nothing found for{' '}
                <span
                  style={{
                    fontStyle: 'italic',
                    color: 'var(--brandGoldLight)',
                    fontWeight: 500,
                  }}
                >
                  &ldquo;{search}&rdquo;
                </span>
                . Try a different name, clear your filters, or start a league of
                your own.
              </>
            ) : (
              <>
                Clear your filters or try a different search to see available
                leagues.
              </>
            )}
          </p>
          <div
            style={{
              display: 'flex',
              gap: 10,
              marginTop: 8,
              flexWrap: 'wrap',
              justifyContent: 'center',
            }}
          >
            <button
              onClick={() => {
                setSearch('');
                setDraftFilter('all');
                setPoolFilter('all');
              }}
              className="ls-discovery-btn-lift"
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: 700,
                fontSize: 12,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                padding: '11px 18px',
                borderRadius: 12,
                border: `1px solid ${'var(--glassBorderHover)'}`,
                background: 'transparent',
                color: 'var(--color12)',
                cursor: 'pointer',
              }}
            >
              Clear Filters
            </button>
            <button
              onClick={() => navigate(`/${sport}/league/create`)}
              className="ls-discovery-btn-lift"
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: 700,
                fontSize: 12,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                padding: '11px 18px',
                borderRadius: 12,
                border: 'none',
                background: 'var(--brandGold)',
                color: TEXT_ON_GOLD,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Plus size={14} /> Create a League
            </button>
          </div>
        </div>
      )}

      {/* ── League list ──────────────────────────────────────────────────── */}
      {showPopulated && (
        <>
          <div
            data-testid="leagues-grid"
            style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
          >
            {leagues.map((lg, idx) => {
              const leagueId = lg.id;
              const hasLeagueId = leagueId != null;
              const cardKey = hasLeagueId
                ? `league-card-${leagueId}`
                : `league-card-idx-${idx}`;
              return (
                <div key={cardKey} data-testid={cardKey}>
                  <LeagueCard
                    lg={lg}
                    joining={hasLeagueId && joiningLeagueId === leagueId}
                    joined={hasLeagueId && joinedLeagueId === leagueId}
                    joinError={
                      hasLeagueId && joiningLeagueId === leagueId
                        ? joinError
                        : null
                    }
                    teamName={
                      hasLeagueId && joiningLeagueId === leagueId
                        ? teamName
                        : ''
                    }
                    onOpenJoin={() => {
                      if (leagueId != null) handleJoinStart(leagueId);
                    }}
                    onCancelJoin={handleJoinCancel}
                    onTeamNameChange={setTeamName}
                    onSubmitJoin={() =>
                      leagueId != null
                        ? handleJoinSubmit(leagueId)
                        : Promise.resolve()
                    }
                    onViewLeague={() => {
                      if (leagueId != null)
                        navigate(`/${sport}/league/${leagueId}`);
                    }}
                    submitting={submitting}
                  />
                </div>
              );
            })}
          </div>

          {/* Footer CTA */}
          <div
            style={{
              marginTop: 32,
              padding: '32px 28px',
              background: `linear-gradient(135deg, ${'var(--accentMuted)'} 0%, ${'var(--background075)'} 100%), ${'var(--surfaceCard)'}`,
              border: `1px solid ${'color-mix(in srgb, var(--brandGold) 25%, transparent)'}`,
              borderRadius: 20,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 20,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <h3
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontWeight: 800,
                  fontSize: 26,
                  color: 'var(--color12)',
                  margin: 0,
                  letterSpacing: '-0.01em',
                }}
              >
                Can't find the right league?
              </h3>
              <p
                style={{
                  fontFamily: FONT_BODY,
                  color: 'var(--textMuted)',
                  margin: '6px 0 0',
                  maxWidth: '48ch',
                  lineHeight: 1.5,
                }}
              >
                Start your own clubhouse. Set the era, scoring style, and roster
                — invite the public or keep it private.
              </p>
            </div>
            <button
              onClick={() => navigate(`/${sport}/league/create`)}
              className="ls-discovery-btn-lift"
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: 700,
                fontSize: 12,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                padding: '11px 18px',
                borderRadius: 12,
                border: 'none',
                background: 'var(--brandGold)',
                color: TEXT_ON_GOLD,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                flexShrink: 0,
              }}
            >
              <Plus size={14} /> Create a League
            </button>
          </div>
        </>
      )}

      {/* Bottom padding */}
      <div style={{ height: 64 }} />
    </YStack>
  );
}

export default LeagueDiscoveryPage;
