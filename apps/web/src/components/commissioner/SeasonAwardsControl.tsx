import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Button,
  Card,
  H4,
  Separator,
  Spinner,
  Text,
  TextArea,
  XStack,
  YStack,
} from 'tamagui';
import { Award, Check, Trash2 } from '@tamagui/lucide-icons';
import {
  BRAND_GOLD,
  BRAND_NAVY_LIGHT,
  SURFACE_CARD,
  SURFACE_PANEL,
  withAlpha,
} from '../../constants/colors';
import {
  LeagueSeasonAwardFragment,
  useDeleteLeagueSeasonAwardMutation,
  useGetLeagueSeasonAwardsQuery,
  useGetPlayersWithStatsQuery,
  useUpsertLeagueSeasonAwardMutation,
} from '../../api/db/graphql.generated';

// ─── Award definitions ─────────────────────────────────────────────────────────

interface AwardMeta {
  key: string;
  label: string;
  description: string;
  icon: string;
}

const SEASON_AWARD_TYPES: AwardMeta[] = [
  {
    key: 'mvp',
    label: 'Most Valuable Player',
    description: 'The player who contributed most to their fantasy team',
    icon: '🏆',
  },
  {
    key: 'cy_young',
    label: 'Cy Young Award',
    description: 'The top-performing pitcher of the season',
    icon: '⚾',
  },
  {
    key: 'rookie_of_the_year',
    label: 'Rookie of the Year',
    description: 'The best first-season player in the league',
    icon: '🌟',
  },
  {
    key: 'gold_glove',
    label: 'Gold Glove',
    description: 'The standout defensive player of the season',
    icon: '🥇',
  },
  {
    key: 'silver_slugger',
    label: 'Silver Slugger',
    description: 'The top offensive performer of the season',
    icon: '🏏',
  },
];

// ─── Player search dropdown ────────────────────────────────────────────────────

interface PlayerSearchResult {
  id: number;
  firstName?: string | null;
  lastName?: string | null;
}

function PlayerSearchInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (player: PlayerSearchResult) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data, loading } = useGetPlayersWithStatsQuery({
    variables: { search: query, limit: 8 },
    skip: query.trim().length < 2,
  });

  const results = useMemo(() => data?.players ?? [], [data]);

  const handleBlur = useCallback(() => {
    blurTimeout.current = setTimeout(() => setOpen(false), 150);
  }, []);

  const handleSelect = useCallback(
    (p: PlayerSearchResult) => {
      if (blurTimeout.current) clearTimeout(blurTimeout.current);
      onChange(p);
      setQuery('');
      setOpen(false);
    },
    [onChange],
  );

  return (
    <YStack position="relative" zIndex={10}>
      <XStack
        backgroundColor="$background"
        borderWidth={1}
        borderColor={
          open ? BRAND_NAVY_LIGHT : withAlpha(BRAND_NAVY_LIGHT, 0.35)
        }
        borderRadius="$3"
        alignItems="center"
        paddingHorizontal="$2"
        opacity={disabled ? 0.5 : 1}
      >
        <input
          disabled={disabled}
          value={value && !open ? value : query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={handleBlur}
          placeholder="Search for a player…"
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'inherit',
            fontSize: 13,
            padding: '8px 6px',
            fontFamily: 'inherit',
            width: '100%',
          }}
          aria-label="Search for award recipient"
          aria-autocomplete="list"
        />
        {loading && <Spinner size="small" color={BRAND_NAVY_LIGHT} />}
      </XStack>

      {open && results.length > 0 && (
        <YStack
          position="absolute"
          top="105%"
          left={0}
          right={0}
          backgroundColor={SURFACE_PANEL}
          borderWidth={1}
          borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.4)}
          borderRadius="$3"
          overflow="hidden"
          elevation={20}
        >
          {results.map((p) => {
            const id = p.id;
            if (id == null) return null;
            const name = `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim();
            const pos = (p.eligiblePositions ?? []).join(', ') || '—';
            return (
              <XStack
                key={id}
                paddingHorizontal="$3"
                paddingVertical="$2"
                borderBottomWidth={1}
                borderBottomColor={withAlpha(BRAND_NAVY_LIGHT, 0.15)}
                cursor="pointer"
                hoverStyle={{
                  backgroundColor: withAlpha(BRAND_NAVY_LIGHT, 0.12),
                }}
                onPress={() =>
                  handleSelect({
                    id,
                    firstName: p.firstName,
                    lastName: p.lastName,
                  })
                }
              >
                <Text fontSize="$2" color="$color" flex={1}>
                  {name}
                </Text>
                <Text fontSize="$1" color="$gray10">
                  {pos}
                </Text>
              </XStack>
            );
          })}
        </YStack>
      )}
    </YStack>
  );
}

// ─── Award row ─────────────────────────────────────────────────────────────────

interface AwardRowProps {
  meta: AwardMeta;
  existing: LeagueSeasonAwardFragment | undefined;
  season: number;
  leagueId: number;
  onSuccess?: (msg: string) => void;
  onError?: (err: Error) => void;
}

function AwardRow({
  meta,
  existing,
  season,
  leagueId,
  onSuccess,
  onError,
}: AwardRowProps) {
  const [selectedPlayer, setSelectedPlayer] =
    useState<PlayerSearchResult | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  // Reset local state when existing award changes (e.g. season switch)
  useEffect(() => {
    setSelectedPlayer(null);
    setNotes(existing?.notes ?? '');
  }, [existing]);

  const [upsert] = useUpsertLeagueSeasonAwardMutation({
    refetchQueries: ['GetLeagueSeasonAwards'],
    awaitRefetchQueries: true,
  });

  const [remove] = useDeleteLeagueSeasonAwardMutation({
    refetchQueries: ['GetLeagueSeasonAwards'],
    awaitRefetchQueries: true,
  });

  const handleSave = useCallback(async () => {
    const playerId = selectedPlayer?.id ?? existing?.playerId;
    if (!playerId) return;
    setSaving(true);
    try {
      await upsert({
        variables: {
          input: {
            leagueId,
            season,
            playerId,
            awardType: meta.key,
            notes: notes || undefined,
          },
        },
      });
      setJustSaved(true);
      setSelectedPlayer(null);
      setTimeout(() => setJustSaved(false), 2500);
      onSuccess?.(`${meta.label} saved`);
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setSaving(false);
    }
  }, [
    selectedPlayer,
    existing,
    leagueId,
    season,
    notes,
    meta.key,
    meta.label,
    upsert,
    onSuccess,
    onError,
  ]);

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    try {
      await remove({ variables: { leagueId, season, awardType: meta.key } });
      setNotes('');
      onSuccess?.(`${meta.label} removed`);
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setDeleting(false);
    }
  }, [leagueId, season, meta.key, meta.label, remove, onSuccess, onError]);

  const recipientName = selectedPlayer
    ? `${selectedPlayer.firstName ?? ''} ${selectedPlayer.lastName ?? ''}`.trim()
    : existing
      ? `${existing.playerFirstName} ${existing.playerLastName}`
      : '';

  const canSave = !!(selectedPlayer?.id ?? existing?.playerId);

  return (
    <Card
      backgroundColor={existing ? withAlpha(BRAND_GOLD, 0.04) : '$surfaceCard'}
      borderColor={
        existing ? withAlpha(BRAND_GOLD, 0.3) : '$surfacePanelBorder'
      }
      borderWidth={1}
      padding="$4"
      borderRadius="$5"
    >
      <YStack gap="$3">
        {/* Title row */}
        <XStack alignItems="center" gap="$2">
          <Text fontSize="$4">{meta.icon}</Text>
          <YStack flex={1}>
            <Text fontSize="$3" fontWeight="700" color="$color">
              {meta.label}
            </Text>
            <Text fontSize="$2" color="$gray10">
              {meta.description}
            </Text>
          </YStack>
          {existing && (
            <Button
              size="$2"
              circular
              icon={deleting ? <Spinner size="small" /> : <Trash2 size={14} />}
              onPress={() => void handleDelete()}
              disabled={deleting}
              backgroundColor="transparent"
              borderColor="transparent"
              color="$red10"
              hoverStyle={{ backgroundColor: withAlpha('#C41E3A', 0.12) }}
              aria-label={`Remove ${meta.label}`}
            />
          )}
        </XStack>

        {/* Current recipient badge */}
        {existing && !selectedPlayer && (
          <XStack
            backgroundColor={withAlpha(BRAND_GOLD, 0.08)}
            borderColor={withAlpha(BRAND_GOLD, 0.25)}
            borderWidth={1}
            borderRadius="$3"
            paddingHorizontal="$3"
            paddingVertical="$2"
            alignItems="center"
            gap="$2"
          >
            <Award size={14} color={BRAND_GOLD} />
            <Text fontSize="$2" color={BRAND_GOLD} fontWeight="600">
              {recipientName}
            </Text>
          </XStack>
        )}

        {/* Player select */}
        <YStack gap="$1">
          <Text fontSize="$2" color="$gray10">
            {existing ? 'Replace recipient' : 'Assign recipient'}
          </Text>
          <PlayerSearchInput
            value={recipientName}
            onChange={setSelectedPlayer}
          />
        </YStack>

        {/* Notes */}
        <YStack gap="$1">
          <Text fontSize="$2" color="$gray10">
            Notes (optional)
          </Text>
          <TextArea
            value={notes}
            onChangeText={setNotes}
            placeholder="Add a note about this award…"
            minHeight={60}
            maxLength={500}
            borderColor="$borderColor"
            backgroundColor="$background"
            color="$color"
            fontSize="$2"
            aria-label={`Notes for ${meta.label}`}
          />
        </YStack>

        {/* Save button */}
        <Button
          size="$3"
          onPress={() => void handleSave()}
          disabled={!canSave || saving}
          icon={
            saving ? (
              <Spinner size="small" />
            ) : justSaved ? (
              <Check size={14} color="rgb(34,197,94)" />
            ) : undefined
          }
          backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.85)}
          borderColor={withAlpha(BRAND_NAVY_LIGHT, 1)}
          color="white"
          alignSelf="flex-end"
        >
          {justSaved
            ? 'Saved!'
            : existing && !selectedPlayer
              ? 'Update Notes'
              : 'Assign Award'}
        </Button>
      </YStack>
    </Card>
  );
}

// ─── Props ─────────────────────────────────────────────────────────────────────

export interface SeasonAwardsControlProps {
  leagueId: number;
  currentSeason?: number;
  onSuccess?: (message: string) => void;
  onError?: (error: Error) => void;
}

// ─── Component ─────────────────────────────────────────────────────────────────

/**
 * SeasonAwardsControl — Commissioner UI for assigning season-long fantasy awards.
 *
 * Commissioners select a season, then assign award recipients (MVP, Cy Young,
 * Rookie of the Year, Gold Glove, Silver Slugger) by searching for players.
 * Awards are per-league and per-season — they reflect fantasy performance, not
 * real MLB awards.
 */
export function SeasonAwardsControl({
  leagueId,
  currentSeason,
  onSuccess,
  onError,
}: SeasonAwardsControlProps) {
  const thisYear = new Date().getFullYear();
  const [season, setSeason] = useState(currentSeason ?? thisYear);

  const { data, loading } = useGetLeagueSeasonAwardsQuery({
    variables: { leagueId, season },
  });

  const existingByType = useMemo(() => {
    const map = new Map<string, LeagueSeasonAwardFragment>();
    for (const award of data?.leagueSeasonAwards ?? []) {
      if (award?.awardType) map.set(award.awardType, award);
    }
    return map;
  }, [data]);

  // Season selector: current year ± 5
  const seasonOptions: number[] = [];
  for (let y = thisYear + 1; y >= thisYear - 4; y--) {
    seasonOptions.push(y);
  }

  return (
    <Card
      backgroundColor="$surfacePanel"
      borderColor="$surfacePanelBorder"
      padding="$5"
      borderRadius="$6"
    >
      <YStack gap="$5">
        {/* Header */}
        <XStack alignItems="flex-start" gap="$3">
          <Award size={22} color={BRAND_GOLD} marginTop={2} />
          <YStack flex={1}>
            <H4 margin={0}>Season Awards</H4>
            <Text fontSize="$2" color="$gray10">
              Assign end-of-season fantasy awards to recognize standout players
              in your league. These awards are based on in-league performance.
            </Text>
          </YStack>
        </XStack>

        {/* Season picker */}
        <YStack gap="$1">
          <Text fontSize="$2" color="$gray10">
            Season
          </Text>
          <select
            value={season}
            onChange={(e) => setSeason(Number(e.target.value))}
            style={{
              backgroundColor: SURFACE_CARD,
              border: `1px solid ${withAlpha(BRAND_NAVY_LIGHT, 0.5)}`,
              borderRadius: 6,
              padding: '8px 12px',
              color: 'inherit',
              fontSize: 14,
              fontFamily: 'inherit',
              width: '100%',
              maxWidth: 160,
            }}
            aria-label="Select season"
          >
            {seasonOptions.map((y) => (
              <option key={y} value={y}>
                {y} Season
              </option>
            ))}
          </select>
        </YStack>

        <Separator />

        {/* Award rows */}
        {loading ? (
          <XStack alignItems="center" gap="$3">
            <Spinner size="small" />
            <Text color="$gray10">Loading awards…</Text>
          </XStack>
        ) : (
          <YStack gap="$4">
            {SEASON_AWARD_TYPES.map((meta) => (
              <AwardRow
                key={meta.key}
                meta={meta}
                existing={existingByType.get(meta.key)}
                season={season}
                leagueId={leagueId}
                onSuccess={onSuccess}
                onError={onError}
              />
            ))}
          </YStack>
        )}
      </YStack>
    </Card>
  );
}
