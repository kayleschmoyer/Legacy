import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  type StyleProp,
  Text,
  TextInput,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';
import { Lock, Plus, X } from '@tamagui/lucide-icons';
// Structural table elements use a Tamagui stack: on web the `tag` prop renders
// a real <table>/<thead>/<tbody>/<tr>/<th>/<td> host element (with `role` kept
// for native screen readers, since the optimizer strips `role` from the web
// build). React Native's `View` has no `tag` prop. See StandingsTable (LS-7860).
import { YStack } from 'tamagui';
import { LOGGER } from '@legacy-sports/logging';
import {
  type GetAllPlayerSeasonStatsQuery,
  type GetPlayersWithStatsQuery,
  useGetAllPlayerSeasonStatsQuery,
  useGetPlayersWithStatsQuery,
} from '../../api/db/graphql.generated';
import {
  BG_DARK,
  BRAND_GOLD,
  BRAND_GOLD_DARK,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY_DARK,
  BRAND_NAVY_LIGHT,
  SURFACE_CARD,
  SURFACE_PANEL,
  SURFACE_SUBTLE,
  TEXT_MUTED,
  WHITE,
  withAlpha,
} from '../../utils/colors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PlayerSummary = NonNullable<
  NonNullable<GetPlayersWithStatsQuery['players']>[number]
>;

type SeasonStatsData = GetAllPlayerSeasonStatsQuery | undefined;

interface SelectedPlayer {
  id: number;
  name: string;
  position: string;
  summary: PlayerSummary;
}

/** Props for the cross-platform Player Comparison feature. */
export interface PlayerComparisonProps {
  /** Drives the inline premium banner (Subscribed vs. Upgrade pill). */
  isPremium: boolean;
  /** When false, the sign-in prompt is shown instead of the tool. Defaults to true. */
  isAuthenticated?: boolean;
  /** Suppresses the sign-in prompt while auth state is resolving. Defaults to false. */
  authLoading?: boolean;
  /** Invoked by the sign-in CTA shown to unauthenticated visitors. */
  onSignIn?: () => void;
  /** Invoked by the "Upgrade" pill in the inline banner for non-premium users. */
  onUpgrade?: () => void;
}

const MAX_PLAYERS = 4;

/**
 * Marketing/feature description for Player Comparison. Single source of truth
 * shared by both platform wrappers (web `PremiumGate` + `PageMeta`, native
 * `PremiumGate`) and the inline premium banner below.
 */
export const PLAYER_COMPARISON_FEATURE_DESCRIPTION =
  'Compare up to 4 players side-by-side with career stats, scoring projections, and season breakdowns.';

const FONT_DISPLAY = "'Big Shoulders Display', sans-serif";
const FONT_BODY = "'Literata', serif";

// Per-slot accent colors matching the mockup spec
const PLAYER_ACCENTS = [BRAND_GOLD, '#60A5FA', '#34D399', '#F87171'] as const;
const PLAYER_ACCENT_ALPHAS = [
  'rgba(197,165,90,0.5)',
  'rgba(96,165,250,0.5)',
  'rgba(52,211,153,0.5)',
  'rgba(248,113,113,0.5)',
] as const;

// Comparison-table column widths (horizontal scroll keeps 4 columns readable).
const METRIC_W = 180;
const VALUE_W = 124;

// ---------------------------------------------------------------------------
// Util
// ---------------------------------------------------------------------------

export function fmt(n: number | null | undefined, decimals = 0): string {
  if (n == null) return '—';
  if (decimals > 0) return n.toFixed(decimals);
  return n.toLocaleString('en-US');
}

export function fmtAvg(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toFixed(3).replace(/^0/, '');
}

// Achievement counts are integers that can legitimately be 0 (e.g. zero MVPs).
// This formatter preserves the 0 as "0" and reserves "—" for true absence (null/undefined).
export function fmtCount(n: number | null | undefined): string {
  if (n == null) return '—';
  return String(n);
}

export function bestIndex(
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
// Empty-state illustration
// ---------------------------------------------------------------------------

function ScorecardIllus() {
  // Two overlapping "scorecards" approximated with stacked panels — keeps the
  // editorial empty-state feel without a platform-specific SVG.
  return (
    <View
      aria-hidden
      style={{ width: 120, height: 96, opacity: 0.5, pointerEvents: 'none' }}
    >
      <View
        style={{
          position: 'absolute',
          left: 8,
          top: 8,
          width: 56,
          height: 80,
          borderRadius: 4,
          borderWidth: 1.4,
          borderColor: TEXT_MUTED,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 56,
          top: 14,
          width: 56,
          height: 80,
          borderRadius: 4,
          borderWidth: 1.4,
          borderColor: TEXT_MUTED,
        }}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Premium inline banner (for subscribed users per mockup spec)
// ---------------------------------------------------------------------------

function PremiumBanner({
  isPremium,
  onUpgrade,
}: {
  isPremium: boolean;
  onUpgrade?: () => void;
}) {
  return (
    <View
      role="note"
      style={{
        flexDirection: 'row',
        gap: 14,
        alignItems: 'center',
        padding: 16,
        backgroundColor: withAlpha(BRAND_GOLD, 0.06),
        borderWidth: 1,
        borderColor: withAlpha(BRAND_GOLD, 0.35),
        borderRadius: 16,
        marginBottom: 22,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: withAlpha(BRAND_GOLD, 0.15),
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Lock size={18} color={BRAND_GOLD_LIGHT} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: '800',
            fontSize: 13,
            letterSpacing: 1.5,
            textTransform: 'uppercase',
            color: BRAND_GOLD_LIGHT,
          }}
        >
          Premium · Player Comparison
        </Text>
        <Text
          style={{
            marginTop: 2,
            fontFamily: FONT_BODY,
            color: TEXT_MUTED,
            fontSize: 13,
          }}
        >
          {PLAYER_COMPARISON_FEATURE_DESCRIPTION}
        </Text>
      </View>
      <Pressable
        role="button"
        aria-label={isPremium ? 'Subscribed' : 'Upgrade'}
        disabled={isPremium}
        onPress={isPremium ? undefined : onUpgrade}
        style={{
          paddingVertical: 10,
          paddingHorizontal: 14,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: BRAND_GOLD_DARK,
          backgroundColor: isPremium ? BRAND_GOLD : SURFACE_PANEL,
        }}
      >
        <Text
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: '700',
            fontSize: 11,
            letterSpacing: 1.1,
            textTransform: 'uppercase',
            color: isPremium ? BRAND_NAVY_DARK : WHITE,
          }}
        >
          {isPremium ? 'Subscribed' : 'Upgrade'}
        </Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Masthead
// ---------------------------------------------------------------------------

function Masthead() {
  return (
    <View
      style={{
        gap: 6,
        paddingBottom: 18,
        borderBottomWidth: 1,
        borderBottomColor: withAlpha(BRAND_NAVY_LIGHT, 0.25),
        marginBottom: 22,
      }}
    >
      <Text
        style={{
          fontFamily: FONT_DISPLAY,
          fontWeight: '700',
          fontSize: 11,
          letterSpacing: 2.2,
          textTransform: 'uppercase',
          color: BRAND_GOLD,
        }}
      >
        Premium · Head-to-Head
      </Text>
      <Text
        role="heading"
        accessibilityRole="header"
        style={{
          fontFamily: FONT_DISPLAY,
          fontWeight: '800',
          fontSize: 44,
          lineHeight: 44,
          letterSpacing: -0.5,
          color: WHITE,
        }}
      >
        Compare up to four.
      </Text>
      <Text
        style={{
          fontFamily: FONT_BODY,
          fontSize: 16,
          lineHeight: 25,
          color: TEXT_MUTED,
          fontStyle: 'italic',
        }}
      >
        Set legends beside stars beside rookies, line up the numbers that
        actually decide a draft, and read the whole story across eras.
      </Text>
    </View>
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
  const [focused, setFocused] = useState(false);

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
        (p): p is PlayerSummary => p?.id != null && !excludeIds.includes(p.id),
      ),
    [data, excludeIds],
  );

  const slotsOpen = MAX_PLAYERS - usedCount;
  const hintText =
    usedCount < 2
      ? 'Add at least 2 players to run the comparison.'
      : `${usedCount} of 4 selected · ${slotsOpen} slot${slotsOpen === 1 ? '' : 's'} open`;

  const showDropdown = open && query.trim().length >= 2;

  return (
    <View
      style={{
        backgroundColor: SURFACE_SUBTLE,
        borderWidth: 1,
        borderColor: withAlpha(BRAND_NAVY_LIGHT, 0.3),
        borderRadius: 20,
        padding: 14,
        marginBottom: 22,
        zIndex: 5,
      }}
    >
      <View style={{ position: 'relative', zIndex: 5 }}>
        <Text
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: '700',
            fontSize: 10,
            letterSpacing: 1.6,
            textTransform: 'uppercase',
            color: TEXT_MUTED,
            paddingLeft: 2,
            marginBottom: 4,
          }}
        >
          Add player · up to 4
        </Text>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            backgroundColor: SURFACE_PANEL,
            borderWidth: 1,
            borderColor: focused
              ? BRAND_NAVY_LIGHT
              : withAlpha(BRAND_NAVY_LIGHT, 0.35),
            borderRadius: 6,
            paddingHorizontal: 12,
          }}
        >
          <Plus size={16} color={TEXT_MUTED} />
          <TextInput
            aria-label="Search players to compare"
            accessibilityLabel="Search players to compare"
            editable={!disabled}
            // RN's `editable={false}` renders as `readonly`, not `disabled`, so
            // expose the disabled state to assistive tech (and Playwright's
            // toBeDisabled) explicitly when at max capacity (LS-7843).
            aria-disabled={disabled || undefined}
            value={query}
            onChangeText={(text) => {
              setQuery(text);
              setOpen(true);
            }}
            onFocus={() => {
              setFocused(true);
              setOpen(true);
            }}
            onBlur={() => setFocused(false)}
            placeholder={
              disabled
                ? '4 players selected — remove one to add more'
                : 'Search player name…'
            }
            placeholderTextColor={TEXT_MUTED}
            style={{
              flex: 1,
              color: WHITE,
              fontSize: 14,
              paddingVertical: 10,
              paddingHorizontal: 8,
              fontFamily: FONT_BODY,
              opacity: disabled ? 0.5 : 1,
            }}
          />
          {loading ? (
            <ActivityIndicator size="small" color={BRAND_NAVY_LIGHT} />
          ) : null}
        </View>

        {showDropdown ? (
          <View
            aria-label="Player suggestions"
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              marginTop: 4,
              backgroundColor: SURFACE_CARD,
              borderWidth: 1,
              borderColor: withAlpha(BRAND_NAVY_LIGHT, 0.4),
              borderRadius: 16,
              overflow: 'hidden',
              zIndex: 50,
            }}
          >
            {results.length === 0 ? (
              <Text
                aria-hidden
                style={{
                  padding: 12,
                  paddingHorizontal: 14,
                  fontFamily: FONT_BODY,
                  fontSize: 13,
                  color: TEXT_MUTED,
                  fontStyle: 'italic',
                }}
              >
                {loading
                  ? 'Searching…'
                  : error
                    ? 'Could not load players. Please try again.'
                    : 'No players match that search.'}
              </Text>
            ) : null}
            {results.map((p) => {
              const name = `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim();
              const pos = (p.eligiblePositions ?? []).join(', ') || '—';
              return (
                <Pressable
                  key={p.id}
                  role="option"
                  aria-label={name}
                  onPress={() => {
                    onSelect(p);
                    setQuery('');
                    setOpen(false);
                  }}
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    borderBottomWidth: 1,
                    borderBottomColor: 'rgba(255,255,255,0.04)',
                  }}
                >
                  <View style={{ gap: 2 }}>
                    <Text
                      style={{
                        fontFamily: FONT_BODY,
                        fontWeight: '600',
                        fontSize: 14,
                        color: WHITE,
                      }}
                    >
                      {name}
                    </Text>
                    <Text
                      style={{
                        fontFamily: FONT_BODY,
                        fontSize: 12,
                        color: TEXT_MUTED,
                        fontStyle: 'italic',
                      }}
                    >
                      {pos}
                    </Text>
                  </View>
                  {p.scoring?.avgPointsPerGame != null ? (
                    <Text
                      style={{
                        fontFamily: FONT_DISPLAY,
                        fontWeight: '700',
                        fontSize: 11,
                        letterSpacing: 0.8,
                        textTransform: 'uppercase',
                        color: TEXT_MUTED,
                        fontVariant: ['tabular-nums'],
                      }}
                    >
                      {p.scoring.avgPointsPerGame.toFixed(1)} pts/g
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <Text
          style={{
            marginTop: 6,
            fontFamily: FONT_BODY,
            fontSize: 13,
            color: TEXT_MUTED,
            fontStyle: 'italic',
          }}
        >
          {hintText}
        </Text>
      </View>

      {/* Slot chips — filled and empty rendered together inside the selector card */}
      {usedCount > 0 ? (
        <View
          style={{
            flexDirection: 'row',
            gap: 8,
            flexWrap: 'wrap',
            marginTop: 14,
          }}
          aria-label="Selected players"
        >
          {filledSlots}
          {Array.from({ length: MAX_PLAYERS - usedCount }).map((_, i) => (
            <View
              key={`empty-${i}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingVertical: 6,
                paddingLeft: 8,
                paddingRight: 10,
                borderWidth: 1,
                borderStyle: 'dashed',
                borderColor: withAlpha(BRAND_NAVY_LIGHT, 0.3),
                borderRadius: 9999,
              }}
            >
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: withAlpha(BRAND_NAVY_LIGHT, 0.4),
                }}
              />
              <Text
                style={{
                  fontFamily: FONT_BODY,
                  fontWeight: '500',
                  fontStyle: 'italic',
                  fontSize: 12,
                  color: TEXT_MUTED,
                }}
              >
                Slot {usedCount + i + 1} · empty
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
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
  const borderColor = PLAYER_ACCENT_ALPHAS[index] ?? 'rgba(197,165,90,0.5)';
  return (
    <View
      testID={`selected-chip-${player.id}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 6,
        paddingLeft: 8,
        paddingRight: 10,
        borderWidth: 1,
        borderColor,
        borderRadius: 9999,
        backgroundColor: SURFACE_PANEL,
      }}
    >
      <View
        style={{
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: accent,
        }}
      />
      <Text
        style={{
          fontFamily: FONT_DISPLAY,
          fontWeight: '700',
          fontSize: 12,
          letterSpacing: 0.7,
          color: WHITE,
        }}
      >
        {player.name}
      </Text>
      <Text
        style={{
          fontFamily: FONT_BODY,
          fontWeight: '500',
          color: TEXT_MUTED,
          fontSize: 12,
        }}
      >
        · {player.position}
      </Text>
      <Pressable
        testID={`remove-player-${player.id}`}
        role="button"
        aria-label={`Remove ${player.name}`}
        accessibilityLabel={`Remove ${player.name}`}
        onPress={onRemove}
        style={{
          width: 18,
          height: 18,
          borderRadius: 9,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <X size={12} color={TEXT_MUTED} />
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Comparison table
// ---------------------------------------------------------------------------

interface StatRow {
  label: string;
  desc?: string;
  vals: string[];
  nums: (number | null | undefined)[];
  lowerIsBetter?: boolean;
}

interface StatGroup {
  title: string;
  rows: StatRow[];
}

function ComparisonTable({
  players,
  groups,
}: {
  players: SelectedPlayer[];
  groups: StatGroup[];
}) {
  const cellBorder = withAlpha(BRAND_NAVY_LIGHT, 0.1);
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: withAlpha(BRAND_NAVY_LIGHT, 0.25),
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: SURFACE_CARD,
      }}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {/* Emit real <table>/<thead>/<tbody>/<tr>/<th>/<td> on web via the
            Tamagui `tag` prop (it survives the optimizing compiler; `role` is
            stripped from the prod build — LS-7861). `role` is kept for native
            screen readers. Flex layout is unchanged — `tag` only sets the DOM
            element name. */}
        <YStack
          tag="table"
          role="table"
          aria-label="Player comparison"
          minWidth={METRIC_W + players.length * VALUE_W}
        >
          {/* Header row */}
          <YStack tag="thead" role="rowgroup">
            <YStack
              tag="tr"
              role="row"
              flexDirection="row"
              backgroundColor={SURFACE_PANEL}
              borderBottomWidth={1}
              borderBottomColor={withAlpha(BRAND_NAVY_LIGHT, 0.2)}
            >
              <YStack
                tag="th"
                {...{ scope: 'col' }}
                role="columnheader"
                width={METRIC_W}
                padding={14}
              >
                <Text
                  style={{
                    fontFamily: FONT_DISPLAY,
                    fontWeight: '700',
                    fontSize: 11,
                    letterSpacing: 1.3,
                    textTransform: 'uppercase',
                    color: TEXT_MUTED,
                  }}
                >
                  Metric
                </Text>
              </YStack>
              {players.map((p, i) => (
                <YStack
                  key={p.id}
                  tag="th"
                  {...{ scope: 'col' }}
                  role="columnheader"
                  width={VALUE_W}
                  padding={14}
                  alignItems="flex-end"
                  borderLeftWidth={1}
                  borderLeftColor={withAlpha(BRAND_NAVY_LIGHT, 0.15)}
                >
                  <Text
                    numberOfLines={1}
                    style={{
                      fontFamily: FONT_DISPLAY,
                      fontWeight: '800',
                      fontSize: 18,
                      color: WHITE,
                      textAlign: 'right',
                    }}
                  >
                    {p.name}
                  </Text>
                  <Text
                    style={{
                      fontFamily: FONT_BODY,
                      fontStyle: 'italic',
                      fontSize: 11,
                      color: TEXT_MUTED,
                    }}
                  >
                    {p.position}
                  </Text>
                  <View
                    aria-hidden
                    style={{
                      width: 32,
                      height: 3,
                      borderRadius: 2,
                      marginTop: 6,
                      backgroundColor: PLAYER_ACCENTS[i] ?? BRAND_GOLD,
                    }}
                  />
                </YStack>
              ))}
            </YStack>
          </YStack>

          {/* Groups — each renders as its own <tbody>; the group title is a
              full-width <tr><td> and every stat is a <tr> of <td> cells. */}
          {groups.map((g) => (
            <YStack tag="tbody" role="rowgroup" key={g.title}>
              <YStack tag="tr" role="row">
                <YStack
                  tag="td"
                  role="cell"
                  backgroundColor={SURFACE_SUBTLE}
                  paddingVertical={10}
                  paddingHorizontal={14}
                  borderBottomWidth={1}
                  borderBottomColor={withAlpha(BRAND_NAVY_LIGHT, 0.2)}
                >
                  <Text
                    style={{
                      fontFamily: FONT_DISPLAY,
                      fontWeight: '800',
                      fontSize: 11,
                      letterSpacing: 2,
                      textTransform: 'uppercase',
                      color: BRAND_GOLD_LIGHT,
                    }}
                  >
                    {g.title}
                  </Text>
                </YStack>
              </YStack>
              {g.rows.map((row, ri) => {
                const bi = bestIndex(row.nums, row.lowerIsBetter);
                const isLast = ri === g.rows.length - 1;
                return (
                  <YStack
                    tag="tr"
                    role="row"
                    key={row.label}
                    flexDirection="row"
                    alignItems="stretch"
                  >
                    <YStack
                      tag="td"
                      role="cell"
                      width={METRIC_W}
                      paddingVertical={13}
                      paddingHorizontal={14}
                      borderBottomWidth={isLast ? 0 : 1}
                      borderBottomColor={cellBorder}
                      justifyContent="center"
                    >
                      <Text
                        style={{
                          fontFamily: FONT_BODY,
                          fontWeight: '500',
                          fontSize: 14,
                          color: TEXT_MUTED,
                        }}
                      >
                        {row.label}
                      </Text>
                      {row.desc ? (
                        <Text
                          style={{
                            fontFamily: FONT_BODY,
                            fontSize: 11,
                            color: withAlpha(TEXT_MUTED, 0.7),
                            fontStyle: 'italic',
                            marginTop: 1,
                          }}
                        >
                          {row.desc}
                        </Text>
                      ) : null}
                    </YStack>
                    {row.vals.map((val, vi) => {
                      const isBest = bi === vi;
                      return (
                        <YStack
                          tag="td"
                          role="cell"
                          key={vi}
                          width={VALUE_W}
                          paddingVertical={13}
                          paddingHorizontal={14}
                          borderBottomWidth={isLast ? 0 : 1}
                          borderBottomColor={cellBorder}
                          borderLeftWidth={1}
                          borderLeftColor={cellBorder}
                          flexDirection="row"
                          alignItems="center"
                          justifyContent="flex-end"
                          gap={6}
                        >
                          {isBest ? (
                            <Text style={{ color: BRAND_GOLD, fontSize: 9 }}>
                              ▲
                            </Text>
                          ) : null}
                          <Text
                            style={{
                              fontFamily: FONT_DISPLAY,
                              fontWeight: '600',
                              fontSize: 16,
                              color: isBest ? BRAND_GOLD_LIGHT : WHITE,
                              textAlign: 'right',
                              fontVariant: ['tabular-nums'],
                            }}
                          >
                            {val}
                          </Text>
                          {isBest ? (
                            <Text
                              style={{
                                fontFamily: FONT_DISPLAY,
                                fontWeight: '800',
                                fontSize: 9,
                                letterSpacing: 1.4,
                                color: BRAND_GOLD,
                                backgroundColor: withAlpha(BRAND_GOLD, 0.14),
                                paddingHorizontal: 6,
                                paddingVertical: 2,
                                borderRadius: 3,
                                overflow: 'hidden',
                              }}
                            >
                              BEST
                            </Text>
                          ) : null}
                        </YStack>
                      );
                    })}
                  </YStack>
                );
              })}
            </YStack>
          ))}
        </YStack>
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Season breakdown block per player
// ---------------------------------------------------------------------------

const SEASON_BATTING_HEADERS = [
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
] as const;

const SEASON_PITCHING_HEADERS = [
  'Year',
  'G',
  'W',
  'L',
  'ERA',
  'IP',
  'SO',
  'BB',
  'WHIP',
] as const;

function SeasonCell({
  value,
  isFirst,
  accent,
  isHeader,
}: {
  value: string;
  isFirst: boolean;
  accent: string;
  isHeader?: boolean;
}) {
  const style: StyleProp<TextStyle> = isHeader
    ? {
        fontFamily: FONT_DISPLAY,
        fontWeight: '700',
        fontSize: 10,
        letterSpacing: 1.4,
        textTransform: 'uppercase',
        color: TEXT_MUTED,
        textAlign: isFirst ? 'left' : 'right',
      }
    : {
        fontFamily: FONT_DISPLAY,
        fontWeight: isFirst ? '800' : '600',
        fontSize: 14,
        color: isFirst ? accent : WHITE,
        textAlign: isFirst ? 'left' : 'right',
        fontVariant: ['tabular-nums'],
      };
  // Header cells render as <th scope="col">; data cells as <td> (web `tag`
  // survives the optimizer; `role` is kept for native — LS-7861). `scope` is
  // omitted from Tamagui's prop types, so spread it (see LeagueDetailShell).
  return (
    <YStack
      tag={isHeader ? 'th' : 'td'}
      role={isHeader ? 'columnheader' : 'cell'}
      {...(isHeader ? { scope: 'col' } : {})}
      width={isFirst ? 64 : 52}
      paddingVertical={10}
      paddingHorizontal={6}
      borderBottomWidth={1}
      borderBottomColor={
        isHeader ? withAlpha(BRAND_NAVY_LIGHT, 0.25) : 'rgba(255,255,255,0.04)'
      }
    >
      <Text style={style}>{value}</Text>
    </YStack>
  );
}

function SeasonRow({
  cells,
  accent,
  isHeader,
}: {
  cells: string[];
  accent: string;
  isHeader?: boolean;
}) {
  return (
    <YStack tag="tr" role="row" flexDirection="row">
      {cells.map((c, i) => (
        <SeasonCell
          key={i}
          value={c}
          isFirst={i === 0}
          accent={accent}
          isHeader={isHeader}
        />
      ))}
    </YStack>
  );
}

function SeasonBattingBlock({
  player,
  accentIndex,
  data,
  loading,
}: {
  player: SelectedPlayer;
  accentIndex: number;
  data: SeasonStatsData;
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

  return (
    <View
      aria-label={`Seasons for ${player.name}`}
      style={{
        marginTop: 22,
        padding: 18,
        backgroundColor: SURFACE_SUBTLE,
        borderWidth: 1,
        borderColor: withAlpha(BRAND_NAVY_LIGHT, 0.25),
        borderTopWidth: 3,
        borderTopColor: accent,
        borderRadius: 16,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          gap: 10,
          marginBottom: 12,
          flexWrap: 'wrap',
        }}
      >
        <Text
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: '800',
            fontSize: 20,
            color: accent,
          }}
        >
          {player.name}
        </Text>
        <Text
          style={{
            fontFamily: FONT_BODY,
            fontStyle: 'italic',
            color: TEXT_MUTED,
            fontSize: 12,
          }}
        >
          {player.position} · showing 4 most recent seasons
        </Text>
      </View>

      {loading ? (
        <View style={{ padding: 12, alignItems: 'center' }}>
          <ActivityIndicator size="small" color={BRAND_NAVY_LIGHT} />
        </View>
      ) : null}

      {!loading && rows.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <YStack
            tag="table"
            role="table"
            aria-label={`Season batting for ${player.name}`}
            minWidth={580}
          >
            <YStack tag="thead" role="rowgroup">
              <SeasonRow
                cells={[...SEASON_BATTING_HEADERS]}
                accent={accent}
                isHeader
              />
            </YStack>
            <YStack tag="tbody" role="rowgroup">
              {rows.map((r, idx) => (
                <SeasonRow
                  key={`${r?.season}-${idx}`}
                  accent={accent}
                  cells={[
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
                  ]}
                />
              ))}
            </YStack>
          </YStack>
        </ScrollView>
      ) : null}

      {!loading && pitchingRows.length > 0 ? (
        <View style={{ marginTop: 16 }}>
          <Text
            style={{
              fontFamily: FONT_DISPLAY,
              fontWeight: '700',
              fontSize: 10,
              letterSpacing: 1.4,
              textTransform: 'uppercase',
              color: TEXT_MUTED,
              marginBottom: 8,
            }}
          >
            Pitching
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <YStack
              tag="table"
              role="table"
              aria-label={`Season pitching for ${player.name}`}
              minWidth={480}
            >
              <YStack tag="thead" role="rowgroup">
                <SeasonRow
                  cells={[...SEASON_PITCHING_HEADERS]}
                  accent={accent}
                  isHeader
                />
              </YStack>
              <YStack tag="tbody" role="rowgroup">
                {pitchingRows.map((r, idx) => {
                  const era = r?.earnedRunAverage
                    ? parseFloat(r.earnedRunAverage)
                    : null;
                  return (
                    <SeasonRow
                      key={`${r?.season}-${idx}`}
                      accent={accent}
                      cells={[
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
                      ]}
                    />
                  );
                })}
              </YStack>
            </YStack>
          </ScrollView>
        </View>
      ) : null}

      {!loading && rows.length === 0 && pitchingRows.length === 0 ? (
        <Text style={{ color: TEXT_MUTED, fontSize: 12, fontStyle: 'italic' }}>
          No season data available.
        </Text>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Section head
// ---------------------------------------------------------------------------

function SectionHead({ title, meta }: { title: string; meta?: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 12,
        marginTop: 32,
        marginBottom: 14,
        flexWrap: 'wrap',
      }}
    >
      <Text
        role="heading"
        accessibilityRole="header"
        style={{
          fontFamily: FONT_DISPLAY,
          fontWeight: '800',
          fontSize: 22,
          letterSpacing: 0.9,
          textTransform: 'uppercase',
          color: WHITE,
        }}
      >
        {title}
      </Text>
      {meta ? (
        <Text
          style={{
            fontFamily: FONT_BODY,
            fontSize: 13,
            color: TEXT_MUTED,
            fontStyle: 'italic',
          }}
        >
          {meta}
        </Text>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Empty / nudge states
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <View
      role="status"
      style={{
        paddingVertical: 60,
        paddingHorizontal: 32,
        backgroundColor: SURFACE_CARD,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: withAlpha(BRAND_NAVY_LIGHT, 0.4),
        borderRadius: 16,
        alignItems: 'center',
        gap: 14,
      }}
    >
      <ScorecardIllus />
      <Text
        style={{
          fontFamily: FONT_DISPLAY,
          fontWeight: '800',
          fontSize: 30,
          color: WHITE,
          textAlign: 'center',
        }}
      >
        Nobody on deck yet.
      </Text>
      <Text
        style={{
          maxWidth: 460,
          color: TEXT_MUTED,
          fontStyle: 'italic',
          fontFamily: FONT_BODY,
          textAlign: 'center',
        }}
      >
        Search above and add at least two players to begin comparing. You can
        mix eras — put legends next to rookies and let the numbers tell the
        story.
      </Text>
    </View>
  );
}

function OnePlayerNudge() {
  return (
    <View
      role="note"
      style={{
        padding: 22,
        backgroundColor: SURFACE_CARD,
        borderWidth: 1,
        borderColor: withAlpha(BRAND_NAVY_LIGHT, 0.25),
        borderRadius: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
      }}
    >
      <Text
        style={{
          fontFamily: FONT_DISPLAY,
          fontWeight: '800',
          fontSize: 44,
          color: BRAND_GOLD,
          lineHeight: 44,
        }}
      >
        {`1/${MAX_PLAYERS}`}
      </Text>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: '700',
            fontSize: 17,
            color: WHITE,
            letterSpacing: 0.3,
          }}
        >
          One player on deck.
        </Text>
        <Text
          style={{
            marginTop: 4,
            color: TEXT_MUTED,
            fontStyle: 'italic',
            fontFamily: FONT_BODY,
            fontSize: 14,
          }}
        >
          Add at least one more to run the head-to-head — the comparison table
          and season breakdown unlock at two.
        </Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Unauthenticated prompt
// ---------------------------------------------------------------------------

function SignInPrompt({ onSignIn }: { onSignIn?: () => void }) {
  return (
    <View
      style={{
        flex: 1,
        minHeight: 480,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: BG_DARK,
        padding: 24,
        gap: 16,
      }}
    >
      <Lock size={32} color={BRAND_GOLD_LIGHT} />
      <View style={{ alignItems: 'center', gap: 8 }}>
        <Text
          style={{
            color: BRAND_GOLD,
            fontSize: 20,
            fontWeight: '700',
            textAlign: 'center',
          }}
        >
          Sign in to compare players
        </Text>
        <Text
          style={{
            color: TEXT_MUTED,
            fontSize: 14,
            textAlign: 'center',
            maxWidth: 320,
          }}
        >
          Create a free account to compare up to 4 players side-by-side with
          career stats, scoring projections, and season breakdowns.
        </Text>
      </View>
      <Pressable
        role="button"
        aria-label="Get Started Free"
        onPress={onSignIn}
        style={{
          backgroundColor: BRAND_GOLD,
          borderRadius: 8,
          paddingHorizontal: 20,
          paddingVertical: 12,
        }}
      >
        <Text style={{ color: BRAND_NAVY_DARK, fontWeight: '700' }}>
          Get Started Free
        </Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Cross-platform Player Comparison feature (LS-7804). Extracted from the
 * canonical web page so web and native share one implementation: side-by-side
 * comparison of up to {@link MAX_PLAYERS} players with fantasy scoring
 * projections, career batting/pitching, achievements, "best" highlighting, a
 * player-search dropdown, and four-most-recent season breakdowns.
 *
 * Data is fetched via shared-components GraphQL hooks; premium state, auth
 * state, and navigation are injected by the consuming platform via props.
 */
export function PlayerComparison({
  isPremium,
  isAuthenticated = true,
  authLoading = false,
  onSignIn,
  onUpgrade,
}: PlayerComparisonProps): React.JSX.Element {
  const [selected, setSelected] = useState<(SelectedPlayer | null)[]>([
    null,
    null,
    null,
    null,
  ]);

  const activePlayers = selected.filter((p): p is SelectedPlayer => p !== null);
  const activeIds = activePlayers.map((p) => p.id);

  // Fixed slot hooks — rules of hooks require unconditional calls.
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
      if (prev.some((s) => s?.id === id)) return prev;
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

  const scoringRows = useMemo<StatRow[]>(() => {
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

  const careerBattingRows = useMemo<StatRow[]>(() => {
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
      ['Walks Drawn', undefined, false, (p) => p.careerBatting?.baseOnBalls],
      ['Strikeouts', undefined, true, (p) => p.careerBatting?.strikeouts],
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

  const careerPitchingRows = useMemo<StatRow[]>(() => {
    if (!isPremium) return [];
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
      [
        'Walks Issued',
        'Walks issued to batters — lower is better; fewer walks means better command',
        true,
        (p) => p.careerPitching?.baseOnBalls,
      ],
      ['Win %', undefined, false, (p) => p.careerPitching?.winPercentage],
    ];
    const baseRows: StatRow[] = defs.map(
      ([label, desc, lowerIsBetter, ext]) => {
        const nums = activePlayers.map((p) => ext(p.summary));
        const vals = nums.map((n) => {
          if (n == null) return '—';
          if (label === 'Win %') return `${(n * 100).toFixed(1)}%`;
          return fmt(n);
        });
        return { label, desc, lowerIsBetter, vals, nums };
      },
    );

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
    const whipNums = activePlayers.map((p) => {
      const n = p.summary.careerPitching?.whip;
      return n != null && Number.isFinite(n) ? n : null;
    });
    baseRows.push({
      label: 'WHIP',
      desc: undefined,
      lowerIsBetter: true,
      vals: whipNums.map((n) => (n != null ? n.toFixed(2) : '—')),
      nums: whipNums,
    });
    return baseRows;
  }, [activePlayers, isPremium]);

  const achievementRows = useMemo<StatRow[]>(() => {
    const hasPitching = activePlayers.some(
      (p) => (p.summary.careerPitching?.games ?? 0) > 0,
    );
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
    return defs
      .filter(([label]) => label !== 'Cy Young Awards' || hasPitching)
      .map(([label, desc, lowerIsBetter, ext]) => {
        const nums = activePlayers.map((p) => ext(p.summary));
        return {
          label,
          desc,
          lowerIsBetter,
          vals: nums.map(fmtCount),
          nums,
        };
      });
  }, [activePlayers]);

  const statGroups = useMemo<StatGroup[]>(() => {
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
  const nudgeIndex = selected.findIndex((p) => p !== null);

  // ---------- Not authenticated ----------

  if (!authLoading && !isAuthenticated) {
    return <SignInPrompt onSignIn={onSignIn} />;
  }

  // ---------- Main view ----------

  const containerStyle: StyleProp<ViewStyle> = {
    width: '100%',
    maxWidth: 1280,
    alignSelf: 'center',
    padding: 24,
    backgroundColor: BG_DARK,
  };

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
      <View style={containerStyle}>
        <PremiumBanner isPremium={isPremium} onUpgrade={onUpgrade} />
        <Masthead />

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

        {activePlayers.length === 0 ? <EmptyState /> : null}

        {showNudge ? (
          <View>
            <OnePlayerNudge />
            <SeasonBattingBlock
              player={activePlayers[0]}
              accentIndex={nudgeIndex}
              data={slotStats[nudgeIndex]?.data}
              loading={slotStats[nudgeIndex]?.loading ?? false}
            />
          </View>
        ) : null}

        {showTable ? (
          <View>
            <SectionHead
              title="Head-to-Head"
              meta="Gold ▲ marks the leader in each row · ties show no leader"
            />
            <ComparisonTable players={activePlayers} groups={statGroups} />

            <SectionHead
              title="Season by Season"
              meta="Four most recent per player · full log inside Player Detail"
            />
            {selected.map((player, idx) =>
              player ? (
                <SeasonBattingBlock
                  key={player.id}
                  player={player}
                  accentIndex={idx}
                  data={slotStats[idx]?.data}
                  loading={slotStats[idx]?.loading ?? false}
                />
              ) : null,
            )}
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

export default PlayerComparison;
