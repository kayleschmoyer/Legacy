import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  type StyleProp,
  Text,
  TextInput,
  type TextStyle,
  useWindowDimensions,
  View,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { Info, Lock, Plus, X } from '@tamagui/lucide-icons';
// Structural table elements use a Tamagui stack: on web the `tag` prop renders
// a real <table>/<thead>/<tbody>/<tr>/<th>/<td> host element (with `role` kept
// for native screen readers, since the optimizer strips `role` from the web
// build). React Native's `View` has no `tag` prop. See StandingsTable (LS-7860).
import { Tooltip, XStack, YStack } from 'tamagui';
import { LOGGER } from '@legacy-sports/logging';
import {
  type GetComparisonSeasonStatsQuery,
  type GetPlayersWithStatsQuery,
  useGetComparisonSeasonStatsQuery,
  useGetPlayersWithStatsQuery,
} from '@legacy-sports/graphql';
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
import { formatEligiblePositions } from '../../utils/playerFormatting';

// RN's Role type omits 'listbox' (a valid WAI-ARIA 1.2 role). This local alias
// widens the role prop so the combobox dropdown can carry role="listbox" on web.
const ListboxView = View as React.ComponentType<
  Omit<ViewProps, 'role'> & { role?: string }
>;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PlayerSummary = NonNullable<
  NonNullable<GetPlayersWithStatsQuery['players']>[number]
>;

// Per-slot view of the batched comparison season query. Each slot's batting and
// pitching rows are sliced out of the single GetComparisonSeasonStats response so
// SeasonBattingBlock can keep consuming a `{ playerSeasonBatting, playerSeasonPitching }`
// shape unchanged.
type SeasonStatsData =
  | {
      playerSeasonBatting?: GetComparisonSeasonStatsQuery['slot0Batting'];
      playerSeasonPitching?: GetComparisonSeasonStatsQuery['slot0Pitching'];
    }
  | undefined;

export interface SelectedPlayer {
  id: number;
  name: string;
  position: string;
  summary: PlayerSummary;
}

/**
 * Pure state updater: insert `entry` into the first empty slot.
 * Returns `prev` unchanged if the ID is already present or all slots are full.
 * Exported for unit testing; used by `handleAdd` inside `PlayerComparison`.
 */
export function addPlayerToSlots(
  prev: (SelectedPlayer | null)[],
  entry: SelectedPlayer,
): (SelectedPlayer | null)[] {
  if (prev.some((s) => s?.id === entry.id)) return prev;
  const firstEmpty = prev.findIndex((s) => s === null);
  if (firstEmpty === -1) return prev;
  const next = [...prev];
  next[firstEmpty] = entry;
  return next;
}

/**
 * Pure state updater: restore a previously-removed `player` to its original
 * `idx` (LS-7040 undo). Returns `prev` unchanged if that slot is no longer
 * empty (the user filled it again before clicking Undo) or the player's ID is
 * already present in another slot — so undo never duplicates or clobbers.
 * Exported for unit testing; used by `handleUndo` inside `PlayerComparison`.
 */
export function restorePlayerToSlot(
  prev: (SelectedPlayer | null)[],
  idx: number,
  player: SelectedPlayer,
): (SelectedPlayer | null)[] {
  if (idx < 0 || idx >= prev.length || prev[idx] !== null) return prev;
  if (prev.some((s) => s?.id === player.id)) return prev;
  const next = [...prev];
  next[idx] = player;
  return next;
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

// How long the undo toast stays visible after a chip is removed (LS-7040).
const UNDO_TOAST_MS = 5000;

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

// Formats an entire scoring row with adaptive precision: uses 2 decimal places
// when all non-null values in the row are <1, so micro-differences like 0.04 vs
// 0.00 aren't both collapsed to "0.0".
export function fmtScoreRow(nums: (number | null | undefined)[]): string[] {
  const nonNull = nums.filter((n): n is number => n != null);
  const decimals = nonNull.length > 0 && Math.max(...nonNull) < 1 ? 2 : 1;
  return nums.map((n) => (n == null ? '—' : n.toFixed(decimals)));
}

// ERA arrives from the API as an optional decimal string. Parse it behind an
// explicit `!= null` check (not a truthy test) so a legitimate '0.00' is kept
// as 0 rather than dropped (LS-7037); absent values and non-finite parses
// (e.g. an empty string → NaN) still render the em dash.
export function fmtEra(value: string | null | undefined): string {
  if (value == null) return '—';
  const era = parseFloat(value);
  return Number.isFinite(era) ? era.toFixed(2) : '—';
}

export function bestIndex(
  values: (number | null | undefined)[],
  lowerIsBetter = false,
): number | null {
  const valid = values.filter((v) => v != null);
  if (valid.length === 0) return null;
  const best = lowerIsBetter ? Math.min(...valid) : Math.max(...valid);
  const bests = values.filter((v) => v === best);
  if (bests.length > 1) return null; // tied — no leader
  return values.findIndex((v) => v === best);
}

/**
 * Returns the indices of all values tied for best when there is no single
 * leader. An empty array means either a unique leader exists (use bestIndex)
 * or fewer than two valid values are present.
 */
export function tiedIndices(
  values: (number | null | undefined)[],
  lowerIsBetter = false,
): number[] {
  const valid = values.filter((v): v is number => v != null);
  if (valid.length < 2) return [];
  const best = lowerIsBetter ? Math.min(...valid) : Math.max(...valid);
  const tied = values.reduce<number[]>((acc, v, i) => {
    if (v === best) acc.push(i);
    return acc;
  }, []);
  return tied.length > 1 ? tied : [];
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
// Premium inline banner — free-user upsell only.
// Premium subscribers do not see this banner; the persistent "Subscribed" pill
// was redundant chrome above the masthead (LS-7032). The banner is rendered
// solely as the inline upgrade CTA for free users (LS-7012).
// ---------------------------------------------------------------------------

function PremiumBanner({ onUpgrade }: { onUpgrade?: () => void }) {
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
        aria-label="Upgrade"
        onPress={onUpgrade}
        style={{
          paddingVertical: 10,
          paddingHorizontal: 14,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: BRAND_GOLD_DARK,
          backgroundColor: SURFACE_PANEL,
        }}
      >
        <Text
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: '700',
            fontSize: 11,
            letterSpacing: 1.1,
            textTransform: 'uppercase',
            color: WHITE,
          }}
        >
          Upgrade
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
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const searchInputRef = React.useRef<TextInput>(null);

  React.useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(id);
  }, [query]);

  const { data, loading, error } = useGetPlayersWithStatsQuery({
    variables: { search: debouncedQuery, limit: 8 },
    skip: debouncedQuery.trim().length < 2,
  });

  React.useEffect(() => {
    if (error) {
      LOGGER.error('Failed to fetch players', error, { query: debouncedQuery });
    }
  }, [error, debouncedQuery]);

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

  const showDropdown = open && debouncedQuery.trim().length >= 2;

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
            ref={searchInputRef}
            aria-label="Search players to compare"
            accessibilityLabel="Search players to compare"
            role="combobox"
            aria-expanded={showDropdown}
            aria-controls="player-search-listbox"
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
          <ListboxView
            role="listbox"
            nativeID="player-search-listbox"
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
              const pos = formatEligiblePositions(p.eligiblePositions);
              return (
                <Pressable
                  key={p.id}
                  role="option"
                  aria-label={name}
                  onPressIn={() => {
                    onSelect(p);
                    setQuery('');
                    setOpen(false);
                  }}
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
          </ListboxView>
        ) : null}

        {/* Slot-ceiling changes are announced politely to screen readers (LS-7026). */}
        <View aria-live="polite" accessibilityLiveRegion="polite">
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
          {Array.from({ length: MAX_PLAYERS - usedCount }).map((_, i) => {
            const slotNumber = usedCount + i + 1;
            // The dashed pill reads as clickable, so make it genuinely
            // actionable rather than de-emphasizing it: pressing or pressing
            // Enter/Space focuses the search input so the user can fill the
            // slot. The button label announces this affordance to screen
            // readers instead of presenting static "empty" text (PCM-046).
            return (
              <Pressable
                key={`empty-${i}`}
                role="button"
                tabIndex={0}
                aria-label={`Slot ${slotNumber} empty — add a player`}
                accessibilityLabel={`Slot ${slotNumber} empty — add a player`}
                onPress={() => searchInputRef.current?.focus()}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  paddingVertical: 6,
                  paddingLeft: 8,
                  paddingRight: 10,
                  borderWidth: 1,
                  borderStyle: 'dashed',
                  borderColor: withAlpha(BRAND_NAVY_LIGHT, pressed ? 0.6 : 0.3),
                  borderRadius: 9999,
                  cursor: 'pointer',
                })}
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
                  aria-hidden
                  style={{
                    fontFamily: FONT_BODY,
                    fontWeight: '500',
                    fontStyle: 'italic',
                    fontSize: 12,
                    color: TEXT_MUTED,
                  }}
                >
                  Slot {slotNumber} · empty
                </Text>
              </Pressable>
            );
          })}
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
// Undo toast (LS-7040) — non-destructive feedback after a chip is removed
// ---------------------------------------------------------------------------

/**
 * Transient "Removed [name] · Undo" toast surfaced after a player chip is
 * removed. Removal is destructive (the slot, its stats, and column position are
 * lost), so this gives a 5s window to restore the player. Built from RN
 * primitives so it renders on both web and native; `role="alert"` +
 * `aria-live="assertive"` announce the removal to screen readers.
 */
function UndoToast({ name, onUndo }: { name: string; onUndo: () => void }) {
  return (
    <View
      testID="undo-remove-toast"
      role="alert"
      aria-live="assertive"
      style={{
        position: 'absolute',
        bottom: 24,
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 10,
        paddingLeft: 16,
        paddingRight: 8,
        borderWidth: 1,
        borderColor: withAlpha(BRAND_GOLD, 0.5),
        borderRadius: 9999,
        backgroundColor: SURFACE_PANEL,
      }}
    >
      <Text
        style={{
          fontFamily: FONT_BODY,
          fontWeight: '500',
          fontSize: 13,
          color: WHITE,
        }}
      >
        Removed {name}
      </Text>
      <Text
        style={{
          fontFamily: FONT_BODY,
          fontSize: 13,
          color: TEXT_MUTED,
        }}
      >
        ·
      </Text>
      <Pressable
        testID="undo-remove-button"
        role="button"
        aria-label={`Undo removing ${name}`}
        accessibilityLabel={`Undo removing ${name}`}
        onPress={onUndo}
        style={{
          paddingVertical: 4,
          paddingHorizontal: 10,
          borderRadius: 9999,
        }}
      >
        <Text
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: '700',
            fontSize: 13,
            letterSpacing: 0.7,
            color: BRAND_GOLD,
          }}
        >
          Undo
        </Text>
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
  tooltip?: string;
  vals: string[];
  nums: (number | null | undefined)[];
  lowerIsBetter?: boolean;
}

interface StatGroup {
  title: string;
  rows: StatRow[];
  disclaimer?: string;
}

function ComparisonTable({
  players,
  groups,
  isPremium,
}: {
  players: SelectedPlayer[];
  groups: StatGroup[];
  isPremium: boolean;
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
                  {g.disclaimer ? (
                    <Text
                      style={{
                        fontFamily: FONT_BODY,
                        fontSize: 10,
                        fontStyle: 'italic',
                        color: withAlpha(TEXT_MUTED, 0.6),
                        marginTop: 2,
                      }}
                    >
                      {g.disclaimer}
                    </Text>
                  ) : null}
                </YStack>
              </YStack>
              {g.rows.map((row, ri) => {
                const bi = isPremium
                  ? bestIndex(row.nums, row.lowerIsBetter)
                  : null;
                const tieIdxs = isPremium
                  ? tiedIndices(row.nums, row.lowerIsBetter)
                  : [];
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
                      <XStack alignItems="center" gap={4}>
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
                        {row.tooltip ? (
                          <Tooltip placement="top" delay={0}>
                            <Tooltip.Trigger aria-label="Projection methodology">
                              <Info
                                size={12}
                                color={withAlpha(TEXT_MUTED, 0.6)}
                              />
                            </Tooltip.Trigger>
                            <Tooltip.Content
                              backgroundColor="$gray9"
                              borderRadius="$3"
                              padding="$2"
                              enterStyle={{ opacity: 0, scale: 0.9 }}
                              exitStyle={{ opacity: 0, scale: 0.9 }}
                              animation="quick"
                            >
                              <Tooltip.Arrow />
                              <Text
                                style={{
                                  fontFamily: FONT_BODY,
                                  fontSize: 12,
                                  color: WHITE,
                                }}
                              >
                                {row.tooltip}
                              </Text>
                            </Tooltip.Content>
                          </Tooltip>
                        ) : null}
                      </XStack>
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
                      const isTied = tieIdxs.includes(vi);
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
                          {isBest || isTied ? (
                            <Text style={{ color: BRAND_GOLD, fontSize: 9 }}>
                              ▲
                            </Text>
                          ) : null}
                          <Text
                            style={{
                              fontFamily: FONT_DISPLAY,
                              fontWeight: '600',
                              fontSize: 16,
                              color:
                                isBest || isTied ? BRAND_GOLD_LIGHT : WHITE,
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
                          ) : isTied ? (
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
                              TIE
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

// Below this viewport width the season tables (which need ~580/480px to lay out
// without truncation) are rendered as a stacked card list instead of a
// horizontally-scrolling table. Inner horizontal scroll inside the outer-scroll
// page is a known mobile-touch pain point; on iPhone SE width (~375px) the table
// is unreadable without scrolling (LS-7035). The 480px threshold matches the
// ticket's "stack table vertically below ~480px" recommendation.
export const SEASON_STACK_BREAKPOINT = 480;

/**
 * Whether the season breakdown should render as a stacked card list rather than
 * a horizontally-scrolling table. Pure so the layout decision is unit-testable.
 */
export function isNarrowSeasonViewport(width: number): boolean {
  return width < SEASON_STACK_BREAKPOINT;
}

/**
 * Card-list rendering of season stats for narrow viewports. Each season is a
 * card with the year as its heading and the remaining stats as wrapping
 * label/value pairs, removing the inner horizontal scroll the table requires.
 */
function SeasonCardList({
  rows,
  headers,
  accent,
  label,
}: {
  rows: string[][];
  headers: readonly string[];
  accent: string;
  label: string;
}) {
  return (
    <View role="list" aria-label={label} style={{ gap: 10 }}>
      {rows.map((cells, idx) => (
        <View
          key={`${cells[0]}-${idx}`}
          role="listitem"
          style={{
            borderWidth: 1,
            borderColor: withAlpha(BRAND_NAVY_LIGHT, 0.25),
            borderRadius: 12,
            padding: 12,
            backgroundColor: withAlpha(BG_DARK, 0.35),
          }}
        >
          <Text
            style={{
              fontFamily: FONT_DISPLAY,
              fontWeight: '800',
              fontSize: 16,
              color: accent,
              marginBottom: 8,
            }}
          >
            {cells[0]}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {headers.slice(1).map((header, i) => (
              <View key={header} style={{ minWidth: 56 }}>
                <Text
                  style={{
                    fontFamily: FONT_DISPLAY,
                    fontWeight: '700',
                    fontSize: 10,
                    letterSpacing: 1.4,
                    textTransform: 'uppercase',
                    color: TEXT_MUTED,
                    marginBottom: 2,
                  }}
                >
                  {header}
                </Text>
                <Text
                  style={{
                    fontFamily: FONT_DISPLAY,
                    fontWeight: '600',
                    fontSize: 14,
                    color: WHITE,
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {cells[i + 1]}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

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

export type SeasonBattingRow = NonNullable<
  NonNullable<GetComparisonSeasonStatsQuery['slot0Batting']>[number]
>;

export type SeasonPitchingRow = NonNullable<
  NonNullable<GetComparisonSeasonStatsQuery['slot0Pitching']>[number]
>;

/**
 * Batting rows for the season breakdown: keep only seasons with a real plate
 * presence (`(atBats ?? 0) > 0`), newest first, capped at the 4 most recent.
 * A pitcher with no batting AB yields an empty list, so the batting table is
 * suppressed — symmetric with {@link selectSeasonPitchingRows} so the "No
 * season data" fallback fires only when both tables are empty (LS-7036).
 */
export function selectSeasonBattingRows(
  data: SeasonStatsData,
): SeasonBattingRow[] {
  if (!data?.playerSeasonBatting) return [];
  return [...data.playerSeasonBatting]
    .filter((r) => r?.season != null && (r.atBats ?? 0) > 0)
    .sort((a, b) => (b?.season ?? 0) - (a?.season ?? 0))
    .slice(0, 4);
}

/**
 * Pitching rows for the season breakdown: keep only seasons with real innings
 * (`(inningsPitched ?? 0) > 0`), newest first, capped at the 4 most recent.
 * Mirrors {@link selectSeasonBattingRows}; a position player with no innings
 * yields an empty list so the pitching table is suppressed (LS-7036).
 */
export function selectSeasonPitchingRows(
  data: SeasonStatsData,
): SeasonPitchingRow[] {
  if (!data?.playerSeasonPitching) return [];
  return [...data.playerSeasonPitching]
    .filter((r) => r?.season != null && (r.inningsPitched ?? 0) > 0)
    .sort((a, b) => (b?.season ?? 0) - (a?.season ?? 0))
    .slice(0, 4);
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

  const rows = useMemo(() => selectSeasonBattingRows(data), [data]);

  const pitchingRows = useMemo(() => selectSeasonPitchingRows(data), [data]);

  // Pre-format each season into a flat cell array so the table and the
  // narrow-viewport card list share one source of values (LS-7035).
  const battingCellRows = useMemo(
    () =>
      rows.map((r) => [
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
      ]),
    [rows],
  );

  const pitchingCellRows = useMemo(
    () =>
      pitchingRows.map((r) => [
        String(r?.season ?? '—'),
        fmt(r?.games),
        fmt(r?.wins),
        fmt(r?.losses),
        fmtEra(r?.earnedRunAverage),
        r?.inningsPitched != null ? r.inningsPitched.toFixed(1) : '—',
        fmt(r?.strikeouts),
        fmt(r?.baseOnBalls),
        r?.whip != null ? r.whip.toFixed(2) : '—',
      ]),
    [pitchingRows],
  );

  const { width } = useWindowDimensions();
  const stack = isNarrowSeasonViewport(width);

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

      {!loading && battingCellRows.length > 0 ? (
        stack ? (
          <SeasonCardList
            label={`Season batting for ${player.name}`}
            headers={SEASON_BATTING_HEADERS}
            rows={battingCellRows}
            accent={accent}
          />
        ) : (
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
                {battingCellRows.map((cells, idx) => (
                  <SeasonRow
                    key={`${cells[0]}-${idx}`}
                    accent={accent}
                    cells={cells}
                  />
                ))}
              </YStack>
            </YStack>
          </ScrollView>
        )
      ) : null}

      {!loading && pitchingCellRows.length > 0 ? (
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
          {stack ? (
            <SeasonCardList
              label={`Season pitching for ${player.name}`}
              headers={SEASON_PITCHING_HEADERS}
              rows={pitchingCellRows}
              accent={accent}
            />
          ) : (
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
                  {pitchingCellRows.map((cells, idx) => (
                    <SeasonRow
                      key={`${cells[0]}-${idx}`}
                      accent={accent}
                      cells={cells}
                    />
                  ))}
                </YStack>
              </YStack>
            </ScrollView>
          )}
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
        Nobody on deck yet
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

  // Single batched query for every filled slot (LS-7033). One roundtrip fetches
  // all selected players' season stats via aliased, `@include`-gated fields,
  // replacing the previous four per-slot queries. Adding/removing a player
  // changes the variables, so fall back to `previousData` while the refetch is
  // in flight — this keeps already-loaded slots rendered instead of blanking
  // them on every slot change.
  const {
    data: currentSeasonData,
    previousData: previousSeasonData,
    loading: seasonLoading,
  } = useGetComparisonSeasonStatsQuery({
    variables: {
      id0: selected[0]?.id ?? 0,
      has0: selected[0] != null,
      id1: selected[1]?.id ?? 0,
      has1: selected[1] != null,
      id2: selected[2]?.id ?? 0,
      has2: selected[2] != null,
      id3: selected[3]?.id ?? 0,
      has3: selected[3] != null,
    },
    skip: activePlayers.length === 0,
  });
  const seasonData = currentSeasonData ?? previousSeasonData;

  // Re-slice the batched response into the per-slot shape SeasonBattingBlock
  // expects. `loading` is computed per slot: a slot only counts as loading when
  // the query is in flight AND that slot has no data yet, so an already-loaded
  // slot keeps its table (rather than flashing a spinner) while a newly added
  // slot's data is fetched.
  const slotStats = useMemo(() => {
    const buildSlot = (
      batting: GetComparisonSeasonStatsQuery['slot0Batting'],
      pitching: GetComparisonSeasonStatsQuery['slot0Pitching'],
    ) => {
      const hasData = batting !== undefined || pitching !== undefined;
      return {
        data: seasonData
          ? { playerSeasonBatting: batting, playerSeasonPitching: pitching }
          : undefined,
        loading: seasonLoading && !hasData,
      };
    };
    return [
      buildSlot(seasonData?.slot0Batting, seasonData?.slot0Pitching),
      buildSlot(seasonData?.slot1Batting, seasonData?.slot1Pitching),
      buildSlot(seasonData?.slot2Batting, seasonData?.slot2Pitching),
      buildSlot(seasonData?.slot3Batting, seasonData?.slot3Pitching),
    ];
  }, [seasonData, seasonLoading]);

  const handleAdd = useCallback((p: PlayerSummary) => {
    const id = p.id;
    if (id == null) return;
    const name = `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim();
    const position = formatEligiblePositions(p.eligiblePositions);
    setSelected((prev) =>
      addPlayerToSlots(prev, { id, name, position, summary: p }),
    );
  }, []);

  // Undo toast state (LS-7040): the most recently removed player plus the slot
  // it occupied, so an accidental removal can be restored within a 5s window.
  const [removed, setRemoved] = useState<{
    player: SelectedPlayer;
    index: number;
  } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const clearUndoTimer = useCallback(() => {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = undefined;
    }
  }, []);

  const handleRemove = useCallback(
    (idx: number) => {
      const player = selected[idx];
      setSelected((prev) => {
        const next = [...prev];
        next[idx] = null;
        return next;
      });
      if (!player) return;
      setRemoved({ player, index: idx });
      clearUndoTimer();
      undoTimerRef.current = setTimeout(() => {
        setRemoved(null);
        undoTimerRef.current = undefined;
      }, UNDO_TOAST_MS);
    },
    [selected, clearUndoTimer],
  );

  const handleUndo = useCallback(() => {
    clearUndoTimer();
    if (removed) {
      setSelected((prev) =>
        restorePlayerToSlot(prev, removed.index, removed.player),
      );
    }
    setRemoved(null);
  }, [removed, clearUndoTimer]);

  // Clear any pending undo timer on unmount to avoid setState-after-unmount.
  useEffect(() => clearUndoTimer, [clearUndoTimer]);

  // ---------- Build stat groups ----------

  const scoringRows = useMemo<StatRow[]>(() => {
    const defs: [
      string,
      string | undefined,
      boolean,
      (p: PlayerSummary) => number | null | undefined,
      string | undefined,
    ][] = [
      [
        'Fantasy Score',
        'Projected season total',
        false,
        (p) => p.scoring?.totalScore,
        'Standard scoring system. Projections are statistical estimates based on career performance. Actual results may vary.',
      ],
      [
        'Avg Pts / Game',
        'Across all seasons',
        false,
        (p) => p.scoring?.avgPointsPerGame,
        undefined,
      ],
      [
        'Hitter Score',
        undefined,
        false,
        (p) => p.scoring?.hitterScore,
        undefined,
      ],
      [
        'Pitcher Score',
        undefined,
        false,
        (p) => p.scoring?.pitchingScore,
        undefined,
      ],
      [
        'Field Score',
        undefined,
        false,
        (p) => p.scoring?.fieldingScore,
        undefined,
      ],
    ];
    return defs.map(([label, desc, lowerIsBetter, ext, tooltip]) => {
      const nums = activePlayers.map((p) => ext(p.summary));
      return {
        label,
        desc,
        tooltip,
        lowerIsBetter,
        vals: fmtScoreRow(nums),
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
      'avg' | 'war' | 'count',
    ][] = [
      ['Games', undefined, false, (p) => p.careerBatting?.games, 'count'],
      ['Hits', undefined, false, (p) => p.careerBatting?.hits, 'count'],
      [
        'Home Runs',
        undefined,
        false,
        (p) => p.careerBatting?.homeRuns,
        'count',
      ],
      ['RBI', undefined, false, (p) => p.careerBatting?.rbi, 'count'],
      ['Runs', undefined, false, (p) => p.careerBatting?.runs, 'count'],
      [
        'Stolen Bases',
        undefined,
        false,
        (p) => p.careerBatting?.stolenBases,
        'count',
      ],
      [
        'Walks Drawn',
        undefined,
        false,
        (p) => p.careerBatting?.baseOnBalls,
        'count',
      ],
      [
        'Strikeouts',
        undefined,
        true,
        (p) => p.careerBatting?.strikeouts,
        'count',
      ],
      [
        'Total Bases',
        undefined,
        false,
        (p) => p.careerBatting?.totalBases,
        'count',
      ],
      [
        'oWAR',
        'Offensive Wins Above Replacement',
        false,
        (p) => p.careerBatting?.offensiveWAR,
        'war',
      ],
      [
        'dWAR',
        'Defensive Wins Above Replacement',
        false,
        (p) => p.careerBatting?.defensiveWAR,
        'war',
      ],
      [
        'WAR',
        'Total Wins Above Replacement',
        false,
        (p) => p.careerBatting?.totalWAR,
        'war',
      ],
      [
        'Avg Season AVG',
        undefined,
        false,
        (p) => p.averageSeasonBatting?.battingAverage,
        'avg',
      ],
      [
        'Avg Season OBP',
        undefined,
        false,
        (p) => p.averageSeasonBatting?.onBasePercentage,
        'avg',
      ],
      [
        'Avg Season SLG',
        undefined,
        false,
        (p) => p.averageSeasonBatting?.sluggingPercentage,
        'avg',
      ],
    ];
    return defs.map(([label, desc, lowerIsBetter, ext, format]) => {
      const nums = activePlayers.map((p) => ext(p.summary));
      const vals = nums.map((n) => {
        if (n == null) return '—';
        if (format === 'avg') return fmtAvg(n);
        if (format === 'war') return n.toFixed(1);
        return fmt(n);
      });
      return { label, desc, lowerIsBetter, vals, nums };
    });
  }, [activePlayers]);

  const careerPitchingRows = useMemo<StatRow[]>(() => {
    if (!isPremium) return [];
    const hasPitching = activePlayers.some(
      (p) => p.summary.careerPitching != null,
    );
    if (!hasPitching) return [];

    activePlayers.forEach((p) => {
      if (p.summary.careerPitching != null && !p.summary.careerPitching.games) {
        LOGGER.debug(
          '[PCM-018] careerPitching present but games is null/0 — two-way player data gap',
          { playerId: p.id, games: p.summary.careerPitching.games },
        );
      }
    });

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

    // 50 IP is the conventional sabermetric qualifier for ERA leaderboards
    const ERA_MIN_OUTS = 150;
    const eraNums = activePlayers.map((p) => {
      const cp = p.summary.careerPitching;
      if ((cp?.outsRecorded ?? 0) < ERA_MIN_OUTS) return null;
      const s = cp?.era;
      if (!s) return null;
      const n = parseFloat(s);
      return Number.isFinite(n) ? n : null;
    });
    baseRows.push({
      label: 'ERA',
      desc: 'Min. 50 IP required',
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
      (p) => p.summary.careerPitching != null,
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
      {
        title: 'Fantasy Scoring',
        rows: scoringRows,
        disclaimer: 'Projections are estimates',
      },
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
    <YStack flex={1}>
      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        <View style={containerStyle}>
          {!isPremium && onUpgrade != null && (
            <PremiumBanner onUpgrade={onUpgrade} />
          )}
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
                meta={
                  isPremium
                    ? 'Gold ▲ marks the leader in each row · ties show no leader'
                    : undefined
                }
              />
              <ComparisonTable
                players={activePlayers}
                groups={statGroups}
                isPremium={isPremium}
              />

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
      {removed ? (
        <UndoToast name={removed.player.name} onUndo={handleUndo} />
      ) : null}
    </YStack>
  );
}

export default PlayerComparison;
