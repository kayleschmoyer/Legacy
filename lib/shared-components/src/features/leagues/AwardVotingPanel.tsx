import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Card,
  H4,
  Input,
  Separator,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { Award, Check } from '@tamagui/lucide-icons';
import {
  BRAND_GOLD,
  BRAND_NAVY_LIGHT,
  GREEN,
  withAlpha,
} from '../../utils/colors';
import {
  useCastAwardVoteMutation,
  useGetAwardVoteResultsQuery,
  useGetAwardVotingPeriodQuery,
  useGetMyAwardVotesQuery,
  useGetPlayersWithStatsQuery,
} from '../../api/db/graphql.generated';

// ─── Award definitions (same as commissioner) ────────────────────────────────

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
    icon: '\u{1F3C6}',
  },
  {
    key: 'cy_young',
    label: 'Cy Young Award',
    description: 'The top-performing pitcher of the season',
    icon: '\u26BE',
  },
  {
    key: 'rookie_of_the_year',
    label: 'Rookie of the Year',
    description: 'The best first-season player in the league',
    icon: '\u{1F31F}',
  },
  {
    key: 'gold_glove',
    label: 'Gold Glove',
    description: 'The standout defensive player of the season',
    icon: '\u{1F947}',
  },
  {
    key: 'silver_slugger',
    label: 'Silver Slugger',
    description: 'The top offensive performer of the season',
    icon: '\u{1F3CF}',
  },
];

// ─── Player search (simplified for voting) ────────────────────────────────────

interface PlayerSearchResult {
  id: number;
  firstName?: string | null;
  lastName?: string | null;
}

function VotePlayerSearch({
  onSelect,
}: {
  onSelect: (player: PlayerSearchResult) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (blurTimer.current) clearTimeout(blurTimer.current);
    };
  }, []);

  const { data, loading } = useGetPlayersWithStatsQuery({
    variables: { search: query, limit: 8 },
    skip: query.trim().length < 2,
  });

  const results = useMemo(() => data?.players ?? [], [data]);

  return (
    <YStack position="relative" zIndex={10}>
      <XStack
        backgroundColor="$background"
        borderWidth={1}
        borderColor={
          open ? '$brandNavyLight' : withAlpha(BRAND_NAVY_LIGHT, 0.35)
        }
        borderRadius="$3"
        alignItems="center"
        paddingHorizontal="$2"
      >
        <Input
          unstyled
          flex={1}
          value={query}
          onChangeText={(v: string) => {
            setQuery(v);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            blurTimer.current = setTimeout(() => setOpen(false), 150);
          }}
          placeholder="Search for a player\u2026"
          fontSize={13}
          paddingHorizontal="$2"
          paddingVertical="$1"
          color="$color"
          accessibilityLabel="Search for a player to vote for"
        />
        {loading && <Spinner size="small" color="$brandNavyLight" />}
      </XStack>

      {open && results.length > 0 && (
        <YStack
          position="absolute"
          top="105%"
          left={0}
          right={0}
          backgroundColor="$surfaceCard"
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
                onPress={() => {
                  onSelect({
                    id,
                    firstName: p.firstName,
                    lastName: p.lastName,
                  });
                  setQuery('');
                  setOpen(false);
                }}
              >
                <Text fontSize="$2" color="$color">
                  {name}
                </Text>
              </XStack>
            );
          })}
        </YStack>
      )}
    </YStack>
  );
}

// ─── Vote row per award type ──────────────────────────────────────────────────

function VoteRow({
  meta,
  currentVote,
  leagueId,
  season,
  onSuccess,
  onError,
}: {
  meta: AwardMeta;
  currentVote: { playerId: number; name: string } | null;
  leagueId: number;
  season: number;
  onSuccess?: (msg: string) => void;
  onError?: (err: Error) => void;
}) {
  const [voting, setVoting] = useState(false);
  const [justVoted, setJustVoted] = useState(false);
  const justVotedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (justVotedTimer.current) clearTimeout(justVotedTimer.current);
    };
  }, []);

  const [castVote] = useCastAwardVoteMutation({
    refetchQueries: ['GetMyAwardVotes', 'GetAwardVoteResults'],
    awaitRefetchQueries: true,
  });

  const handleVote = useCallback(
    async (player: PlayerSearchResult) => {
      setVoting(true);
      try {
        await castVote({
          variables: {
            leagueId,
            season,
            awardType: meta.key,
            playerId: player.id,
          },
        });
        setJustVoted(true);
        justVotedTimer.current = setTimeout(() => setJustVoted(false), 2500);
        onSuccess?.(
          `Vote cast for ${meta.label}: ${player.firstName ?? ''} ${player.lastName ?? ''}`.trim(),
        );
      } catch (err) {
        onError?.(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setVoting(false);
      }
    },
    [leagueId, season, meta.key, meta.label, castVote, onSuccess, onError],
  );

  return (
    <Card
      backgroundColor={
        currentVote ? withAlpha(BRAND_GOLD, 0.04) : '$surfaceCard'
      }
      borderColor={
        currentVote ? withAlpha(BRAND_GOLD, 0.3) : '$surfacePanelBorder'
      }
      borderWidth={1}
      padding="$4"
      borderRadius="$5"
    >
      <YStack gap="$3">
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
          {justVoted && <Check size={16} color="$green10" />}
        </XStack>

        {currentVote && (
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
            <Award size={14} color="$brandGold" />
            <Text fontSize="$2" color="$brandGold" fontWeight="600">
              Your vote: {currentVote.name}
            </Text>
          </XStack>
        )}

        <YStack gap="$1">
          <Text fontSize="$2" color="$gray10">
            {currentVote ? 'Change your vote' : 'Cast your vote'}
          </Text>
          {voting ? (
            <XStack alignItems="center" gap="$2" padding="$2">
              <Spinner size="small" />
              <Text fontSize="$2" color="$gray10">
                Submitting vote...
              </Text>
            </XStack>
          ) : (
            <VotePlayerSearch onSelect={(p) => void handleVote(p)} />
          )}
        </YStack>
      </YStack>
    </Card>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface AwardVotingPanelProps {
  leagueId: number;
  season: number;
  onSuccess?: (message: string) => void;
  onError?: (error: Error) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * AwardVotingPanel — League member UI for casting anonymous votes on season awards.
 *
 * Only rendered when voting is open for the current season. Shows each enabled
 * award type with player search for voting. Votes are anonymous — the voter
 * identity is never displayed.
 */
export function AwardVotingPanel({
  leagueId,
  season,
  onSuccess,
  onError,
}: AwardVotingPanelProps) {
  const { data: votingData, loading: votingLoading } =
    useGetAwardVotingPeriodQuery({ variables: { leagueId, season } });

  const votingPeriod = votingData?.awardVotingPeriod;
  const isVotingOpen = votingPeriod?.status === 'open';

  const { data: myVotesData } = useGetMyAwardVotesQuery({
    variables: { leagueId, season },
    skip: !isVotingOpen,
  });
  const { data: resultsData } = useGetAwardVoteResultsQuery({
    variables: { leagueId, season },
    skip: !isVotingOpen,
  });

  // Don't render if no open voting period
  if (votingLoading || !votingPeriod || votingPeriod.status !== 'open') {
    return null;
  }

  const includedTypes = votingPeriod.awardTypes ?? [];
  const enabledAwards = SEASON_AWARD_TYPES.filter((a) =>
    includedTypes.includes(a.key),
  );

  // Map my votes by award type
  const myVotesByType = new Map<string, { playerId: number; name: string }>();
  for (const v of myVotesData?.myAwardVotes ?? []) {
    if (!v.awardType || v.playerId == null) continue;
    myVotesByType.set(v.awardType, {
      playerId: v.playerId,
      name: `${v.playerFirstName ?? ''} ${v.playerLastName ?? ''}`.trim(),
    });
  }

  // Vote results grouped by award type
  const resultsByType = new Map<
    string,
    { playerId: number; name: string; voteCount: number }[]
  >();
  for (const r of resultsData?.awardVoteResults ?? []) {
    if (!r.awardType || r.playerId == null) continue;
    const list = resultsByType.get(r.awardType) ?? [];
    list.push({
      playerId: r.playerId,
      name: `${r.playerFirstName ?? ''} ${r.playerLastName ?? ''}`.trim(),
      voteCount: r.voteCount ?? 0,
    });
    resultsByType.set(r.awardType, list);
  }

  return (
    <Card
      backgroundColor="$surfacePanel"
      borderColor={withAlpha(GREEN, 0.3)}
      borderWidth={1}
      padding="$5"
      borderRadius="$6"
    >
      <YStack gap="$5">
        {/* Header */}
        <XStack alignItems="flex-start" gap="$3">
          <Award size={22} color="$brandGold" marginTop={2} />
          <YStack flex={1}>
            <H4 margin={0}>Season Awards Voting</H4>
            <Text fontSize="$2" color="$gray10">
              Vote for your picks for this season{"'"}s awards. Your votes are
              anonymous — no one will see who you voted for.
            </Text>
          </YStack>
        </XStack>

        <Separator />

        {/* Vote rows */}
        <YStack gap="$4">
          {enabledAwards.map((meta) => (
            <VoteRow
              key={meta.key}
              meta={meta}
              currentVote={myVotesByType.get(meta.key) ?? null}
              leagueId={leagueId}
              season={season}
              onSuccess={onSuccess}
              onError={onError}
            />
          ))}
        </YStack>

        {/* Results preview (anonymous counts only) */}
        {resultsByType.size > 0 && (
          <>
            <Separator />
            <YStack gap="$3">
              <Text fontSize="$3" fontWeight="700" color="$color">
                Current Standings
              </Text>
              {enabledAwards.map((meta) => {
                const results = resultsByType.get(meta.key);
                if (!results || results.length === 0) return null;
                return (
                  <YStack key={meta.key} gap="$1">
                    <Text fontSize="$2" color="$gray10" fontWeight="600">
                      {meta.icon} {meta.label}
                    </Text>
                    {results.map((r) => (
                      <XStack key={r.playerId} paddingLeft="$4" gap="$2">
                        <Text fontSize="$2" color="$color" flex={1}>
                          {r.name}
                        </Text>
                        <Text fontSize="$2" color="$brandGold" fontWeight="600">
                          {r.voteCount} {r.voteCount === 1 ? 'vote' : 'votes'}
                        </Text>
                      </XStack>
                    ))}
                  </YStack>
                );
              })}
            </YStack>
          </>
        )}
      </YStack>
    </Card>
  );
}
