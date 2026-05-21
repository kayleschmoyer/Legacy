import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, ScrollView, Spinner, Text, YStack } from 'tamagui';
import { Lock, Plus, X } from '@tamagui/lucide-icons';
import { LOGGER } from '@legacy-sports/logging';
import { useAuth } from '@legacy-sports/shared-components/auth';
import {
  type GetPlayersWithStatsQuery,
  useGetAllPlayerSeasonStatsQuery,
  useGetPlayersWithStatsQuery,
} from '../../api/db/graphql.generated';
import { PremiumGate } from '../../components/PremiumGate';
import { useIsPremium } from '../../hooks/useIsPremium';
import { PageMeta } from '../../components/PageMeta';
import {
  BG_DARK,
  BRAND_GOLD,
  BRAND_GOLD_DARK,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY_DARK,
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED,
  SURFACE_CARD,
  SURFACE_PANEL,
  SURFACE_SUBTLE,
  TEXT_MUTED,
  WHITE,
  withAlpha,
} from '../../constants/colors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PlayerSummary = NonNullable<
  NonNullable<GetPlayersWithStatsQuery['players']>[number]
>;

interface SelectedPlayer {
  id: number;
  name: string;
  position: string;
  summary: PlayerSummary;
}

const MAX_PLAYERS = 4;

const FONT_DISPLAY = "'Big Shoulders Display', sans-serif";
const FONT_BODY = "'Literata', serif";

const SUGGESTION_PLACEHOLDER_STYLE: React.CSSProperties = {
  padding: '12px 14px',
  fontFamily: FONT_BODY,
  fontSize: 13,
  color: TEXT_MUTED,
  fontStyle: 'italic',
};

// Per-slot accent colors matching the mockup spec
const PLAYER_ACCENTS = [BRAND_GOLD, '#60A5FA', '#34D399', '#F87171'] as const;
const PLAYER_ACCENT_ALPHAS = [
  'rgba(197,165,90,0.5)',
  'rgba(96,165,250,0.5)',
  'rgba(52,211,153,0.5)',
  'rgba(248,113,113,0.5)',
] as const;

// ---------------------------------------------------------------------------
// Util
// ---------------------------------------------------------------------------

function fmt(n: number | null | undefined, decimals = 0): string {
  if (n == null) return '—';
  if (decimals > 0) return n.toFixed(decimals);
  return n.toLocaleString('en-US');
}

function fmtAvg(n: number | null | undefined): string {
  if (n == null) return '—';
  return n >= 1 ? n.toFixed(0) : n.toFixed(3).replace(/^0/, '');
}

function bestIndex(
  values: (number | null | undefined)[],
  lowerIsBetter = false,
): number | null {
  const valid = values.filter((v) => v != null);
  if (valid.length < 2) return null;
  const best = lowerIsBetter ? Math.min(...valid) : Math.max(...valid);
  const bests = values.filter((v) => v === best);
  if (bests.length > 1) return null; // tied — no leader
  return values.findIndex((v) => v === best);
}

// ---------------------------------------------------------------------------
// Scorecard illustration (two overlapping cards — from mockup SVG spec)
// ---------------------------------------------------------------------------

function ScorecardIllus({ size = 140 }: { size?: number }) {
  const s = size / 140;
  return (
    <svg
      width={size}
      height={size * (110 / 140)}
      viewBox="0 0 140 110"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      aria-hidden="true"
      style={{ color: TEXT_MUTED, opacity: 0.5 }}
    >
      <rect x={14 * s} y={14 * s} width={56 * s} height={80 * s} rx={4 * s} />
      <rect x={70 * s} y={20 * s} width={56 * s} height={80 * s} rx={4 * s} />
      <g opacity="0.5">
        <path d={`M${22 * s} ${28 * s}h${40 * s}`} />
        <path d={`M${22 * s} ${36 * s}h${28 * s}`} />
        <path d={`M${22 * s} ${58 * s}h${40 * s}`} />
        <path d={`M${22 * s} ${66 * s}h${40 * s}`} />
        <path d={`M${22 * s} ${74 * s}h${30 * s}`} />
        <path d={`M${78 * s} ${34 * s}h${40 * s}`} />
        <path d={`M${78 * s} ${42 * s}h${28 * s}`} />
        <path d={`M${78 * s} ${64 * s}h${40 * s}`} />
        <path d={`M${78 * s} ${72 * s}h${40 * s}`} />
        <path d={`M${78 * s} ${80 * s}h${30 * s}`} />
      </g>
      <circle cx={62 * s} cy={22 * s} r={5 * s} stroke={BRAND_SEAM_RED} />
      <circle cx={118 * s} cy={28 * s} r={5 * s} stroke={BRAND_GOLD} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Premium inline banner (for subscribed users per mockup spec)
// ---------------------------------------------------------------------------

function PremiumBanner({ isPremium }: { isPremium: boolean }) {
  return (
    <div
      role="note"
      style={{
        display: 'flex',
        gap: 14,
        alignItems: 'center',
        padding: '14px 18px',
        background:
          'linear-gradient(90deg,rgba(197,165,90,0.10),rgba(197,165,90,0.02))',
        border: `1px solid rgba(197,165,90,0.35)`,
        borderRadius: 16,
        marginBottom: 22,
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          flexShrink: 0,
          background: 'rgba(197,165,90,0.15)',
          color: BRAND_GOLD_LIGHT,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Lock size={18} color={BRAND_GOLD_LIGHT} />
      </div>
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 800,
            fontSize: 13,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: BRAND_GOLD_LIGHT,
          }}
        >
          Premium · Player Comparison
        </div>
        <p
          style={{
            margin: '2px 0 0',
            fontFamily: FONT_BODY,
            color: TEXT_MUTED,
            fontSize: 13,
          }}
        >
          Compare up to 4 players side-by-side with career stats, scoring
          projections, and season breakdowns.
        </p>
      </div>
      <div
        style={{
          fontFamily: FONT_DISPLAY,
          fontWeight: 700,
          fontSize: 11,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          padding: '10px 14px',
          borderRadius: 12,
          border: `1px solid ${BRAND_GOLD_DARK}`,
          background: isPremium ? BRAND_GOLD : SURFACE_PANEL,
          color: isPremium ? BRAND_NAVY_DARK : WHITE,
          cursor: isPremium ? 'default' : 'pointer',
          flexShrink: 0,
        }}
      >
        {isPremium ? 'Subscribed' : 'Upgrade'}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Masthead
// ---------------------------------------------------------------------------

function Masthead() {
  return (
    <header
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        paddingBottom: 18,
        borderBottom: `1px solid ${withAlpha(BRAND_NAVY_LIGHT, 0.25)}`,
        marginBottom: 22,
      }}
    >
      <span
        style={{
          fontFamily: FONT_DISPLAY,
          fontWeight: 700,
          fontSize: 11,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: BRAND_GOLD,
        }}
      >
        Premium · Head-to-Head
      </span>
      <h1
        style={{
          margin: 0,
          fontFamily: FONT_DISPLAY,
          fontWeight: 800,
          fontSize: 'clamp(34px, 5vw, 52px)',
          lineHeight: 0.95,
          letterSpacing: '-0.02em',
          color: WHITE,
        }}
      >
        Compare up to four.
      </h1>
      <p
        style={{
          margin: 0,
          fontFamily: FONT_BODY,
          fontSize: 16,
          lineHeight: 1.55,
          color: TEXT_MUTED,
          maxWidth: '70ch',
          fontStyle: 'italic',
        }}
      >
        Set legends beside stars beside rookies, line up the numbers that
        actually decide a draft, and read the whole story across eras.
      </p>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Player search dropdown
// ---------------------------------------------------------------------------

function PlayerSearchInput({
  onSelect,
  excludeIds,
  disabled,
  usedCount,
  filledSlots,
}: {
  onSelect: (player: PlayerSummary) => void;
  excludeIds: number[];
  disabled: boolean;
  usedCount: number;
  filledSlots?: React.ReactNode;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const blurTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    };
  }, []);

  const { data, loading, error } = useGetPlayersWithStatsQuery({
    variables: { search: query, limit: 8 },
    skip: query.trim().length < 2,
  });

  React.useEffect(() => {
    if (error) {
      LOGGER.error('Failed to fetch players', error, { query });
    }
  }, [error, query]);

  const results = useMemo(
    () =>
      (data?.players ?? []).filter(
        (p) => p?.id != null && !excludeIds.includes(p.id),
      ),
    [data, excludeIds],
  );

  const slotsOpen = MAX_PLAYERS - usedCount;
  const hintText =
    usedCount < 2
      ? 'Add at least 2 players to run the comparison.'
      : `${usedCount} of 4 selected · ${slotsOpen} slot${slotsOpen === 1 ? '' : 's'} open`;

  return (
    <div
      style={{
        background: SURFACE_SUBTLE,
        border: `1px solid ${withAlpha(BRAND_NAVY_LIGHT, 0.3)}`,
        borderRadius: 20,
        padding: 14,
        marginBottom: 22,
      }}
    >
      <div style={{ position: 'relative' }}>
        <label
          htmlFor="cmp-search"
          style={{
            display: 'block',
            fontFamily: FONT_DISPLAY,
            fontWeight: 700,
            fontSize: 10,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: TEXT_MUTED,
            paddingLeft: 2,
            marginBottom: 4,
          }}
        >
          Add player · up to 4
        </label>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: SURFACE_PANEL,
            border: `1px solid ${open ? BRAND_NAVY_LIGHT : withAlpha(BRAND_NAVY_LIGHT, 0.35)}`,
            borderRadius: 6,
            padding: '0 12px',
            transition: 'border-color 150ms ease',
          }}
        >
          <Plus size={16} color={TEXT_MUTED} />
          <input
            id="cmp-search"
            disabled={disabled}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => {
              if (blurTimerRef.current) {
                clearTimeout(blurTimerRef.current);
                blurTimerRef.current = null;
              }
              setOpen(true);
            }}
            onBlur={() => {
              blurTimerRef.current = setTimeout(() => {
                blurTimerRef.current = null;
                setOpen(false);
              }, 150);
            }}
            placeholder={
              disabled
                ? '4 players selected — remove one to add more'
                : 'Search player name…'
            }
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: WHITE,
              fontSize: 14,
              padding: '10px 8px',
              fontFamily: FONT_BODY,
              opacity: disabled ? 0.5 : 1,
              cursor: disabled ? 'not-allowed' : 'text',
            }}
            aria-label="Search players to compare"
            aria-autocomplete="list"
          />
          {loading && <Spinner size="small" color={BRAND_NAVY_LIGHT} />}
        </div>

        {open && query.trim().length >= 2 && (
          <div
            role="listbox"
            aria-label="Player suggestions"
            style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              left: 0,
              right: 0,
              background: SURFACE_CARD,
              border: `1px solid ${withAlpha(BRAND_NAVY_LIGHT, 0.4)}`,
              borderRadius: 16,
              boxShadow: `0 12px 32px rgba(8,12,20,0.65)`,
              zIndex: 5,
              overflow: 'hidden',
            }}
          >
            {results.length === 0 && (
              <div aria-hidden={true} style={SUGGESTION_PLACEHOLDER_STYLE}>
                {loading
                  ? 'Searching…'
                  : error
                    ? 'Could not load players. Please try again.'
                    : 'No players match that search.'}
              </div>
            )}
            {results.map((p) => {
              if (!p?.id) return null;
              const name = `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim();
              const pos = (p.eligiblePositions ?? []).join(', ') || '—';
              return (
                <div
                  key={p.id}
                  role="option"
                  aria-selected={false}
                  onClick={() => {
                    onSelect(p);
                    setQuery('');
                    setOpen(false);
                  }}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 14px',
                    cursor: 'pointer',
                    borderBottom: `1px solid rgba(255,255,255,0.04)`,
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background =
                      withAlpha(BRAND_NAVY_LIGHT, 0.12);
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background =
                      'transparent';
                  }}
                >
                  <div
                    style={{ display: 'flex', flexDirection: 'column', gap: 2 }}
                  >
                    <span
                      style={{
                        fontFamily: FONT_BODY,
                        fontWeight: 600,
                        fontSize: 14,
                        color: WHITE,
                      }}
                    >
                      {name}
                    </span>
                    <span
                      style={{
                        fontFamily: FONT_BODY,
                        fontSize: 12,
                        color: TEXT_MUTED,
                        fontStyle: 'italic',
                      }}
                    >
                      {pos}
                    </span>
                  </div>
                  {p.scoring?.avgPointsPerGame != null && (
                    <span
                      style={{
                        fontFamily: FONT_DISPLAY,
                        fontWeight: 700,
                        fontSize: 11,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        color: TEXT_MUTED,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {p.scoring.avgPointsPerGame.toFixed(1)} pts/g
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <p
          style={{
            margin: '6px 0 0',
            fontFamily: FONT_BODY,
            fontSize: 13,
            color: TEXT_MUTED,
            fontStyle: 'italic',
          }}
        >
          {hintText}
        </p>
      </div>

      {/* Slot chips — filled and empty rendered together inside the selector card */}
      {usedCount > 0 && (
        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            marginTop: 14,
          }}
          aria-label="Selected players"
        >
          {filledSlots}
          {Array.from({ length: MAX_PLAYERS - usedCount }).map((_, i) => (
            <span
              key={`empty-${i}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 10px 6px 8px',
                border: `1px dashed ${withAlpha(BRAND_NAVY_LIGHT, 0.3)}`,
                borderRadius: 9999,
                fontFamily: FONT_DISPLAY,
                fontWeight: 700,
                fontSize: 12,
                letterSpacing: '0.06em',
                color: TEXT_MUTED,
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: withAlpha(BRAND_NAVY_LIGHT, 0.4),
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontFamily: FONT_BODY,
                  fontWeight: 500,
                  fontStyle: 'italic',
                }}
              >
                Slot {usedCount + i + 1} · empty
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Player chip
// ---------------------------------------------------------------------------

function PlayerChip({
  player,
  index,
  onRemove,
}: {
  player: SelectedPlayer;
  index: number;
  onRemove: () => void;
}) {
  const accent = PLAYER_ACCENTS[index] ?? BRAND_GOLD;
  const borderAlpha = PLAYER_ACCENT_ALPHAS[index] ?? 'rgba(197,165,90,0.5)';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px 6px 8px',
        border: `1px solid ${borderAlpha}`,
        borderRadius: 9999,
        background: SURFACE_PANEL,
        fontFamily: FONT_DISPLAY,
        fontWeight: 700,
        fontSize: 12,
        letterSpacing: '0.06em',
        color: WHITE,
      }}
    >
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: accent,
          flexShrink: 0,
        }}
      />
      <span>{player.name}</span>
      <span
        style={{
          fontFamily: FONT_BODY,
          fontWeight: 500,
          color: TEXT_MUTED,
          letterSpacing: 0,
        }}
      >
        · {player.position}
      </span>
      <button
        onClick={onRemove}
        aria-label={`Remove ${player.name}`}
        style={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: 'transparent',
          border: 'none',
          color: TEXT_MUTED,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          padding: 0,
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background =
            'rgba(255,255,255,0.08)';
          (e.currentTarget as HTMLButtonElement).style.color = WHITE;
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background =
            'transparent';
          (e.currentTarget as HTMLButtonElement).style.color = TEXT_MUTED;
        }}
      >
        <X size={12} />
      </button>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Comparison table
// ---------------------------------------------------------------------------

interface StatGroup {
  title: string;
  rows: {
    label: string;
    desc?: string;
    vals: string[];
    nums: (number | null | undefined)[];
    lowerIsBetter?: boolean;
  }[];
}

function ComparisonTable({
  players,
  groups,
}: {
  players: SelectedPlayer[];
  groups: StatGroup[];
}) {
  return (
    <div
      style={{
        border: `1px solid ${withAlpha(BRAND_NAVY_LIGHT, 0.25)}`,
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: '0 4px 14px rgba(8,12,20,0.55)',
        background: SURFACE_CARD,
        overflowX: 'auto',
      }}
    >
      <table
        aria-label="Player comparison table"
        style={{
          width: '100%',
          borderCollapse: 'separate',
          borderSpacing: 0,
          minWidth: 560,
        }}
      >
        <thead>
          <tr>
            <th
              scope="col"
              style={{
                background: SURFACE_PANEL,
                borderBottom: `1px solid ${withAlpha(BRAND_NAVY_LIGHT, 0.2)}`,
                padding: '16px 14px',
                textAlign: 'left',
                fontFamily: FONT_DISPLAY,
                fontWeight: 700,
                fontSize: 11,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: TEXT_MUTED,
                width: '34%',
                minWidth: 160,
              }}
            >
              Metric
            </th>
            {players.map((p, i) => (
              <th
                key={p.id}
                scope="col"
                style={{
                  background: SURFACE_PANEL,
                  borderBottom: `1px solid ${withAlpha(BRAND_NAVY_LIGHT, 0.2)}`,
                  borderLeft: `1px solid ${withAlpha(BRAND_NAVY_LIGHT, 0.15)}`,
                  padding: '16px 14px',
                  textAlign: 'right',
                  fontFamily: FONT_DISPLAY,
                  fontWeight: 700,
                  fontSize: 11,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: TEXT_MUTED,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                    gap: 2,
                  }}
                >
                  <span
                    style={{
                      fontFamily: FONT_DISPLAY,
                      fontWeight: 800,
                      fontSize: 18,
                      letterSpacing: 0,
                      color: WHITE,
                      textTransform: 'none',
                    }}
                  >
                    {p.name}
                  </span>
                  <span
                    style={{
                      fontFamily: FONT_BODY,
                      fontStyle: 'italic',
                      fontSize: 11,
                      color: TEXT_MUTED,
                      letterSpacing: '0.02em',
                      textTransform: 'none',
                      fontWeight: 400,
                    }}
                  >
                    {p.position}
                  </span>
                  <span
                    style={{
                      display: 'inline-block',
                      width: 32,
                      height: 3,
                      borderRadius: 2,
                      marginTop: 6,
                      background: PLAYER_ACCENTS[i] ?? BRAND_GOLD,
                    }}
                    aria-hidden="true"
                  />
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <React.Fragment key={g.title}>
              {/* Group header row */}
              <tr>
                <td
                  colSpan={1 + players.length}
                  style={{
                    background: SURFACE_SUBTLE,
                    fontFamily: FONT_DISPLAY,
                    fontWeight: 800,
                    fontSize: 11,
                    letterSpacing: '0.2em',
                    textTransform: 'uppercase',
                    color: BRAND_GOLD_LIGHT,
                    padding: '10px 14px',
                    borderBottom: `1px solid ${withAlpha(BRAND_NAVY_LIGHT, 0.2)}`,
                  }}
                >
                  {g.title}
                </td>
              </tr>
              {g.rows.map((row, ri) => {
                const bi = bestIndex(row.nums, row.lowerIsBetter);
                const isLast = ri === g.rows.length - 1;
                return (
                  <tr key={row.label}>
                    <td
                      style={{
                        padding: '13px 14px',
                        borderBottom: isLast
                          ? 'none'
                          : `1px solid ${withAlpha(BRAND_NAVY_LIGHT, 0.1)}`,
                        fontFamily: FONT_BODY,
                        fontWeight: 500,
                        fontSize: 14,
                        color: TEXT_MUTED,
                        textAlign: 'left',
                      }}
                    >
                      {row.label}
                      {row.desc && (
                        <span
                          style={{
                            display: 'block',
                            fontFamily: FONT_BODY,
                            fontWeight: 400,
                            fontSize: 11,
                            color: withAlpha(TEXT_MUTED, 0.7),
                            fontStyle: 'italic',
                            marginTop: 1,
                          }}
                        >
                          {row.desc}
                        </span>
                      )}
                    </td>
                    {row.vals.map((val, vi) => {
                      const isBest = bi === vi;
                      return (
                        <td
                          key={vi}
                          style={{
                            padding: '13px 14px',
                            borderBottom: isLast
                              ? 'none'
                              : `1px solid ${withAlpha(BRAND_NAVY_LIGHT, 0.1)}`,
                            borderLeft: `1px solid ${withAlpha(BRAND_NAVY_LIGHT, 0.1)}`,
                            fontFamily: FONT_DISPLAY,
                            fontWeight: 600,
                            fontSize: 16,
                            color: isBest ? BRAND_GOLD_LIGHT : WHITE,
                            textAlign: 'right',
                            fontVariantNumeric: 'tabular-nums',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {isBest && (
                            <span
                              style={{
                                color: BRAND_GOLD,
                                fontSize: 9,
                                marginRight: 6,
                                verticalAlign: 'middle',
                              }}
                            >
                              ▲
                            </span>
                          )}
                          {val}
                          {isBest && (
                            <span
                              style={{
                                fontFamily: FONT_DISPLAY,
                                fontWeight: 800,
                                fontSize: 9,
                                letterSpacing: '0.16em',
                                background: 'rgba(197,165,90,0.14)',
                                color: BRAND_GOLD,
                                padding: '2px 6px',
                                borderRadius: 3,
                                marginLeft: 8,
                                verticalAlign: 'middle',
                              }}
                            >
                              BEST
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Season breakdown block per player
// ---------------------------------------------------------------------------

function SeasonBattingBlock({
  player,
  accentIndex,
  data,
  loading,
}: {
  player: SelectedPlayer;
  accentIndex: number;
  data: ReturnType<typeof useGetAllPlayerSeasonStatsQuery>['data'];
  loading: boolean;
}) {
  const accent = PLAYER_ACCENTS[accentIndex] ?? BRAND_GOLD;

  const rows = useMemo(() => {
    if (!data?.playerSeasonBatting) return [];
    return [...data.playerSeasonBatting]
      .filter((r) => r?.season != null && (r.atBats ?? 0) > 0)
      .sort((a, b) => (b?.season ?? 0) - (a?.season ?? 0))
      .slice(0, 4);
  }, [data]);

  const pitchingRows = useMemo(() => {
    if (!data?.playerSeasonPitching) return [];
    return [...data.playerSeasonPitching]
      .filter((r) => r?.season != null && (r.inningsPitched ?? 0) > 0)
      .sort((a, b) => (b?.season ?? 0) - (a?.season ?? 0))
      .slice(0, 4);
  }, [data]);

  const colStyle = (isFirst: boolean): React.CSSProperties => ({
    padding: '10px 10px',
    borderBottom: `1px solid rgba(255,255,255,0.04)`,
    fontFamily: FONT_DISPLAY,
    fontWeight: isFirst ? 800 : 600,
    fontSize: 14,
    color: isFirst ? accent : WHITE,
    textAlign: isFirst ? 'left' : 'right',
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: isFirst ? '0.04em' : 0,
    whiteSpace: 'nowrap',
  });

  return (
    <section
      aria-label={`Seasons for ${player.name}`}
      style={{
        marginTop: 22,
        padding: 18,
        background: SURFACE_SUBTLE,
        border: `1px solid ${withAlpha(BRAND_NAVY_LIGHT, 0.25)}`,
        borderTop: `3px solid ${accent}`,
        borderRadius: 16,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 10,
          marginBottom: 12,
        }}
      >
        <h3
          style={{
            margin: 0,
            fontFamily: FONT_DISPLAY,
            fontWeight: 800,
            fontSize: 20,
            color: accent,
            letterSpacing: '-0.005em',
          }}
        >
          {player.name}
        </h3>
        <span
          style={{
            fontFamily: FONT_BODY,
            fontStyle: 'italic',
            color: TEXT_MUTED,
            fontSize: 12,
          }}
        >
          {player.position} · showing 4 most recent seasons
        </span>
      </div>

      {loading && (
        <YStack padding="$3" alignItems="center">
          <Spinner size="small" color={BRAND_NAVY_LIGHT} />
        </YStack>
      )}

      {!loading && rows.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table
            aria-label={`Season batting for ${player.name}`}
            style={{
              width: '100%',
              borderCollapse: 'separate',
              borderSpacing: 0,
              minWidth: 580,
            }}
          >
            <thead>
              <tr>
                {[
                  'Year',
                  'G',
                  'PA',
                  'AB',
                  'H',
                  'HR',
                  'RBI',
                  'SB',
                  'AVG',
                  'OBP',
                  'SLG',
                ].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: '10px 10px',
                      borderBottom: `1px solid ${withAlpha(BRAND_NAVY_LIGHT, 0.25)}`,
                      fontFamily: FONT_DISPLAY,
                      fontWeight: 700,
                      fontSize: 10,
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      color: TEXT_MUTED,
                      textAlign: h === 'Year' ? 'left' : 'right',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={`${r?.season}-${idx}`}>
                  {[
                    String(r?.season ?? '—'),
                    fmt(r?.games),
                    fmt(r?.plateAppearances),
                    fmt(r?.atBats),
                    fmt(r?.hits),
                    fmt(r?.homeRuns),
                    fmt(r?.rbi),
                    fmt(r?.stolenBases),
                    fmtAvg(r?.battingAverage),
                    fmtAvg(r?.onBasePercentage),
                    fmtAvg(r?.sluggingPercentage),
                  ].map((val, ci) => (
                    <td key={ci} style={colStyle(ci === 0)}>
                      {val}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && pitchingRows.length > 0 && (
        <div style={{ overflowX: 'auto', marginTop: 16 }}>
          <div
            style={{
              fontFamily: FONT_DISPLAY,
              fontWeight: 700,
              fontSize: 10,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: TEXT_MUTED,
              marginBottom: 8,
            }}
          >
            Pitching
          </div>
          <table
            aria-label={`Season pitching for ${player.name}`}
            style={{
              width: '100%',
              borderCollapse: 'separate',
              borderSpacing: 0,
              minWidth: 480,
            }}
          >
            <thead>
              <tr>
                {['Year', 'G', 'W', 'L', 'ERA', 'IP', 'SO', 'BB', 'WHIP'].map(
                  (h) => (
                    <th
                      key={h}
                      style={{
                        padding: '10px 10px',
                        borderBottom: `1px solid ${withAlpha(BRAND_NAVY_LIGHT, 0.25)}`,
                        fontFamily: FONT_DISPLAY,
                        fontWeight: 700,
                        fontSize: 10,
                        letterSpacing: '0.14em',
                        textTransform: 'uppercase',
                        color: TEXT_MUTED,
                        textAlign: h === 'Year' ? 'left' : 'right',
                      }}
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {pitchingRows.map((r, idx) => {
                const era = r?.earnedRunAverage
                  ? parseFloat(r.earnedRunAverage)
                  : null;
                return (
                  <tr key={`${r?.season}-${idx}`}>
                    {[
                      String(r?.season ?? '—'),
                      fmt(r?.games),
                      fmt(r?.wins),
                      fmt(r?.losses),
                      era != null && Number.isFinite(era)
                        ? era.toFixed(2)
                        : '—',
                      r?.inningsPitched != null
                        ? r.inningsPitched.toFixed(1)
                        : '—',
                      fmt(r?.strikeouts),
                      fmt(r?.baseOnBalls),
                      r?.whip != null ? r.whip.toFixed(2) : '—',
                    ].map((val, ci) => (
                      <td key={ci} style={colStyle(ci === 0)}>
                        {val}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && rows.length === 0 && pitchingRows.length === 0 && (
        <Text color={TEXT_MUTED} fontSize="$2" fontStyle="italic">
          No season data available.
        </Text>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section head
// ---------------------------------------------------------------------------

function SectionHead({ title, meta }: { title: string; meta?: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 12,
        margin: '32px 0 14px',
        flexWrap: 'wrap',
      }}
    >
      <h2
        style={{
          margin: 0,
          fontFamily: FONT_DISPLAY,
          fontWeight: 800,
          fontSize: 22,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: WHITE,
        }}
      >
        {title}
      </h2>
      {meta && (
        <span
          style={{
            fontFamily: FONT_BODY,
            fontSize: 13,
            color: TEXT_MUTED,
            fontStyle: 'italic',
          }}
        >
          {meta}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div
      role="status"
      style={{
        padding: '60px 32px',
        background: SURFACE_CARD,
        border: `1px dashed ${withAlpha(BRAND_NAVY_LIGHT, 0.4)}`,
        borderRadius: 16,
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 14,
      }}
    >
      <ScorecardIllus size={140} />
      <h3
        style={{
          margin: 0,
          fontFamily: FONT_DISPLAY,
          fontWeight: 800,
          fontSize: 30,
          color: WHITE,
          letterSpacing: '-0.01em',
        }}
      >
        Nobody on deck yet.
      </h3>
      <p
        style={{
          margin: 0,
          maxWidth: '56ch',
          color: TEXT_MUTED,
          fontStyle: 'italic',
          fontFamily: FONT_BODY,
        }}
      >
        Search above and add at least two players to begin comparing. You can
        mix eras — put legends next to rookies and let the numbers tell the
        story.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1-player nudge
// ---------------------------------------------------------------------------

function OnePlayerNudge() {
  return (
    <div
      role="note"
      style={{
        padding: 22,
        background: SURFACE_CARD,
        border: `1px solid ${withAlpha(BRAND_NAVY_LIGHT, 0.25)}`,
        borderRadius: 16,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
      }}
    >
      <span
        style={{
          fontFamily: FONT_DISPLAY,
          fontWeight: 800,
          fontSize: 44,
          color: BRAND_GOLD,
          lineHeight: 1,
          flexShrink: 0,
        }}
      >
        1/4
      </span>
      <div>
        <p
          style={{
            margin: 0,
            fontFamily: FONT_DISPLAY,
            fontWeight: 700,
            fontSize: 17,
            color: WHITE,
            letterSpacing: '0.02em',
          }}
        >
          One player on deck.
        </p>
        <p
          style={{
            margin: '4px 0 0',
            color: TEXT_MUTED,
            fontStyle: 'italic',
            fontFamily: FONT_BODY,
            fontSize: 14,
          }}
        >
          Add at least one more to run the head-to-head — the comparison table
          and season breakdown unlock at two.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export function PlayerComparisonPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const [selected, setSelected] = useState<(SelectedPlayer | null)[]>([
    null,
    null,
    null,
    null,
  ]);

  const activePlayers = selected.filter((p): p is SelectedPlayer => p !== null);
  const activeIds = activePlayers.map((p) => p.id);

  // Fixed slot hooks — rules of hooks require unconditional calls
  const slot0Stats = useGetAllPlayerSeasonStatsQuery({
    variables: { playerId: selected[0]?.id ?? 0 },
    skip: !selected[0],
  });
  const slot1Stats = useGetAllPlayerSeasonStatsQuery({
    variables: { playerId: selected[1]?.id ?? 0 },
    skip: !selected[1],
  });
  const slot2Stats = useGetAllPlayerSeasonStatsQuery({
    variables: { playerId: selected[2]?.id ?? 0 },
    skip: !selected[2],
  });
  const slot3Stats = useGetAllPlayerSeasonStatsQuery({
    variables: { playerId: selected[3]?.id ?? 0 },
    skip: !selected[3],
  });
  const slotStats = [slot0Stats, slot1Stats, slot2Stats, slot3Stats];

  const handleAdd = useCallback((p: PlayerSummary) => {
    const id = p.id;
    if (id == null) return;
    const name = `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim();
    const position = (p.eligiblePositions ?? []).join(', ') || '—';
    setSelected((prev) => {
      const firstEmpty = prev.findIndex((s) => s === null);
      if (firstEmpty === -1) return prev;
      const next = [...prev];
      next[firstEmpty] = { id, name, position, summary: p };
      return next;
    });
  }, []);

  const handleRemove = useCallback((idx: number) => {
    setSelected((prev) => {
      const next = [...prev];
      next[idx] = null;
      return next;
    });
  }, []);

  // ---------- Build stat groups ----------

  const scoringRows = useMemo(() => {
    const defs: [
      string,
      string | undefined,
      boolean,
      (p: PlayerSummary) => number | null | undefined,
    ][] = [
      [
        'Fantasy Score',
        'Projected season total',
        false,
        (p) => p.scoring?.totalScore,
      ],
      [
        'Avg Pts / Game',
        'Across all seasons',
        false,
        (p) => p.scoring?.avgPointsPerGame,
      ],
      ['Hitter Score', undefined, false, (p) => p.scoring?.hitterScore],
      ['Pitcher Score', undefined, false, (p) => p.scoring?.pitchingScore],
      ['Field Score', undefined, false, (p) => p.scoring?.fieldingScore],
    ];
    return defs.map(([label, desc, lowerIsBetter, ext]) => {
      const nums = activePlayers.map((p) => ext(p.summary));
      return {
        label,
        desc,
        lowerIsBetter,
        vals: nums.map((n) => (n == null ? '—' : n.toFixed(1))),
        nums,
      };
    });
  }, [activePlayers]);

  const careerBattingRows = useMemo(() => {
    const defs: [
      string,
      string | undefined,
      boolean,
      (p: PlayerSummary) => number | null | undefined,
    ][] = [
      ['Games', undefined, false, (p) => p.careerBatting?.games],
      ['Hits', undefined, false, (p) => p.careerBatting?.hits],
      ['Home Runs', undefined, false, (p) => p.careerBatting?.homeRuns],
      ['RBI', undefined, false, (p) => p.careerBatting?.rbi],
      ['Runs', undefined, false, (p) => p.careerBatting?.runs],
      ['Stolen Bases', undefined, false, (p) => p.careerBatting?.stolenBases],
      ['Walks', undefined, false, (p) => p.careerBatting?.baseOnBalls],
      ['Total Bases', undefined, false, (p) => p.careerBatting?.totalBases],
      [
        'oWAR',
        'Offensive Wins Above Replacement',
        false,
        (p) => p.careerBatting?.offensiveWAR,
      ],
      [
        'Avg Season AVG',
        undefined,
        false,
        (p) => p.averageSeasonBatting?.battingAverage,
      ],
      [
        'Avg Season OBP',
        undefined,
        false,
        (p) => p.averageSeasonBatting?.onBasePercentage,
      ],
      [
        'Avg Season SLG',
        undefined,
        false,
        (p) => p.averageSeasonBatting?.sluggingPercentage,
      ],
    ];
    return defs.map(([label, desc, lowerIsBetter, ext]) => {
      const nums = activePlayers.map((p) => ext(p.summary));
      const vals = nums.map((n) => {
        if (n == null) return '—';
        if (
          label.includes('AVG') ||
          label.includes('OBP') ||
          label.includes('SLG')
        )
          return fmtAvg(n);
        if (label.includes('WAR')) return n.toFixed(1);
        return fmt(n);
      });
      return { label, desc, lowerIsBetter, vals, nums };
    });
  }, [activePlayers]);

  const careerPitchingRows = useMemo(() => {
    const hasPitching = activePlayers.some(
      (p) => (p.summary.careerPitching?.games ?? 0) > 0,
    );
    if (!hasPitching) return [];

    const defs: [
      string,
      string | undefined,
      boolean,
      (p: PlayerSummary) => number | null | undefined,
    ][] = [
      ['Games', undefined, false, (p) => p.careerPitching?.games],
      ['Wins', undefined, false, (p) => p.careerPitching?.wins],
      ['Losses', undefined, true, (p) => p.careerPitching?.losses],
      ['Saves', undefined, false, (p) => p.careerPitching?.saves],
      ['Strikeouts', undefined, false, (p) => p.careerPitching?.strikeouts],
      ['Walks', undefined, true, (p) => p.careerPitching?.baseOnBalls],
      ['Win %', undefined, false, (p) => p.careerPitching?.winPercentage],
    ];
    const baseRows = defs.map(([label, desc, lowerIsBetter, ext]) => {
      const nums = activePlayers.map((p) => ext(p.summary));
      const vals = nums.map((n) => {
        if (n == null) return '—';
        if (label === 'Win %') return `${(n * 100).toFixed(1)}%`;
        return fmt(n);
      });
      return { label, desc, lowerIsBetter, vals, nums };
    });

    const eraNums = activePlayers.map((p) => {
      const s = p.summary.careerPitching?.era;
      if (!s) return null;
      const n = parseFloat(s);
      return Number.isFinite(n) ? n : null;
    });
    baseRows.push({
      label: 'ERA',
      desc: undefined,
      lowerIsBetter: true,
      vals: eraNums.map((n) => (n != null ? n.toFixed(2) : '—')),
      nums: eraNums,
    });
    return baseRows;
  }, [activePlayers]);

  const achievementRows = useMemo(() => {
    const defs: [
      string,
      string | undefined,
      boolean,
      (p: PlayerSummary) => number | null | undefined,
    ][] = [
      [
        'All-Star Selections',
        undefined,
        false,
        (p) => p.careerAchievements?.allStarSelections,
      ],
      ['MVP Awards', undefined, false, (p) => p.careerAchievements?.mvpAwards],
      [
        'Cy Young Awards',
        undefined,
        false,
        (p) => p.careerAchievements?.cyYoungAwards,
      ],
      [
        'Gold Gloves',
        undefined,
        false,
        (p) => p.careerAchievements?.goldGloves,
      ],
      [
        'Silver Sluggers',
        undefined,
        false,
        (p) => p.careerAchievements?.silverSluggers,
      ],
      [
        'World Series Rings',
        undefined,
        false,
        (p) => p.careerAchievements?.worldSeriesRings,
      ],
    ];
    return defs.map(([label, desc, lowerIsBetter, ext]) => {
      const nums = activePlayers.map((p) => ext(p.summary));
      return {
        label,
        desc,
        lowerIsBetter,
        vals: nums.map((n) => (n == null ? '—' : String(n))),
        nums,
      };
    });
  }, [activePlayers]);

  const statGroups: StatGroup[] = useMemo(() => {
    const groups: StatGroup[] = [
      { title: 'Fantasy Scoring Projections', rows: scoringRows },
      { title: 'Career Batting', rows: careerBattingRows },
    ];
    if (careerPitchingRows.length > 0) {
      groups.push({ title: 'Career Pitching', rows: careerPitchingRows });
    }
    groups.push({ title: 'Career Achievements', rows: achievementRows });
    return groups;
  }, [scoringRows, careerBattingRows, careerPitchingRows, achievementRows]);

  const showTable = activePlayers.length >= 2;
  const showNudge = activePlayers.length === 1;
  const isPremium = useIsPremium();

  // ---------- Not authenticated ----------

  if (!authLoading && !isAuthenticated) {
    return (
      <YStack
        flex={1}
        minHeight="100vh"
        justifyContent="center"
        alignItems="center"
        backgroundColor={BG_DARK as never}
        padding="$6"
        gap="$4"
      >
        <PageMeta
          title="Player Comparison"
          description="Compare up to 4 players side-by-side with career stats, scoring projections, and season breakdowns."
        />
        <Lock size={32} color={BRAND_GOLD_LIGHT} />
        <YStack alignItems="center" gap="$2">
          <Text
            color={BRAND_GOLD}
            fontSize="$5"
            fontWeight="bold"
            textAlign="center"
          >
            Sign in to compare players
          </Text>
          <Text
            color={TEXT_MUTED}
            fontSize="$3"
            textAlign="center"
            maxWidth={320}
          >
            Create a free account to compare up to 4 players side-by-side with
            career stats, scoring projections, and season breakdowns.
          </Text>
        </YStack>
        <Button
          onPress={() => navigate('/')}
          backgroundColor={BRAND_GOLD}
          color={BRAND_NAVY_DARK}
          fontWeight="bold"
          borderRadius="$4"
          paddingHorizontal="$5"
          pressStyle={{ opacity: 0.85, scale: 0.97 }}
        >
          Get Started Free
        </Button>
      </YStack>
    );
  }

  // ---------- Main page ----------

  return (
    <PremiumGate
      isPremium={isPremium}
      featureName="Player Comparison"
      featureDescription="Compare up to 4 players side-by-side with career stats, scoring projections, and season breakdowns."
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        <PageMeta
          title="Player Comparison"
          description="Compare up to 4 players side-by-side with career stats, scoring projections, and season breakdowns."
        />

        <div
          style={{
            maxWidth: 1280,
            margin: '0 auto',
            padding: '32px 24px',
            background: BG_DARK,
            minHeight: '100vh',
          }}
        >
          {/* Premium inline banner */}
          <PremiumBanner isPremium={isPremium} />

          {/* Editorial masthead */}
          <Masthead />

          {/* Search & selection panel — filled chips render inline with empty slots */}
          <PlayerSearchInput
            onSelect={handleAdd}
            excludeIds={activeIds}
            disabled={activePlayers.length >= MAX_PLAYERS}
            usedCount={activePlayers.length}
            filledSlots={selected.map((p, idx) =>
              p ? (
                <PlayerChip
                  key={p.id}
                  player={p}
                  index={idx}
                  onRemove={() => handleRemove(idx)}
                />
              ) : null,
            )}
          />

          {/* Empty state */}
          {activePlayers.length === 0 && <EmptyState />}

          {/* 1-player nudge */}
          {showNudge && (
            <>
              <OnePlayerNudge />
              {/* Season preview for the single player */}
              <SeasonBattingBlock
                player={activePlayers[0]}
                accentIndex={selected.findIndex((p) => p !== null)}
                data={slotStats[selected.findIndex((p) => p !== null)]?.data}
                loading={
                  slotStats[selected.findIndex((p) => p !== null)]?.loading ??
                  false
                }
              />
            </>
          )}

          {/* Comparison table */}
          {showTable && (
            <>
              <SectionHead
                title="Head-to-Head"
                meta="Gold ▲ marks the leader in each row · ties show no leader"
              />
              <ComparisonTable players={activePlayers} groups={statGroups} />

              <SectionHead
                title="Season by Season"
                meta="Four most recent per player · full log inside Player Detail"
              />
              {selected.map((player, idx) => {
                if (!player) return null;
                return (
                  <SeasonBattingBlock
                    key={player.id}
                    player={player}
                    accentIndex={idx}
                    data={slotStats[idx]?.data}
                    loading={slotStats[idx]?.loading ?? false}
                  />
                );
              })}
            </>
          )}
        </div>
      </ScrollView>
    </PremiumGate>
  );
}
