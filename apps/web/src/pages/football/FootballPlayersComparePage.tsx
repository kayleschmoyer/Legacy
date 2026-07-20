import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Spinner, Text, XStack, YStack } from 'tamagui';
import { ArrowLeft } from '@tamagui/lucide-icons';
import {
  type FootballPlayerQuery,
  useFootballPlayerQuery,
} from '@legacy-sports/graphql';
import { ENTITLEMENTS } from '@legacy-sports/utils';
import { PageMeta } from '../../components/PageMeta';
import { PremiumGate } from '../../components/PremiumGate';
import { useHasEntitlement } from '../../hooks/useIsPremium';
import { FONT_BODY, FONT_DISPLAY } from '../../constants/typography';

type ComparePlayer = NonNullable<FootballPlayerQuery['footballPlayer']>;

/** Parses a positive integer search-param value, returning 0 when invalid. */
function parseId(raw: string | null): number {
  if (!raw || !/^\d+$/.test(raw)) return 0;
  return parseInt(raw, 10);
}

function playerName(player: ComparePlayer | undefined | null): string {
  if (!player) return 'Unknown Player';
  return (
    [player.firstName, player.lastName].filter(Boolean).join(' ') ||
    'Unknown Player'
  );
}

function fmt(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString();
}

function fmtFloat(n: number | null | undefined, decimals = 1): string {
  if (n == null) return '—';
  return n.toFixed(decimals);
}

/** A single stat row in the comparison table. `accessor` reads the value off a
 *  player's careerStats; the row is hidden when both players lack the value. */
interface StatRow {
  label: string;
  accessor: (player: ComparePlayer) => string;
}

const STAT_ROWS: StatRow[] = [
  { label: 'Pass YDS', accessor: (p) => fmt(p.careerStats?.passing?.yds) },
  { label: 'Pass TD', accessor: (p) => fmt(p.careerStats?.passing?.td) },
  { label: 'Pass INT', accessor: (p) => fmt(p.careerStats?.passing?.int) },
  {
    label: 'Pass RTG',
    accessor: (p) => fmtFloat(p.careerStats?.passing?.rating),
  },
  { label: 'Rush YDS', accessor: (p) => fmt(p.careerStats?.rushing?.yds) },
  { label: 'Rush TD', accessor: (p) => fmt(p.careerStats?.rushing?.td) },
  { label: 'Rec', accessor: (p) => fmt(p.careerStats?.receiving?.rec) },
  { label: 'Rec YDS', accessor: (p) => fmt(p.careerStats?.receiving?.yds) },
  { label: 'Rec TD', accessor: (p) => fmt(p.careerStats?.receiving?.td) },
  { label: 'FG Made', accessor: (p) => fmt(p.careerStats?.kicking?.fgm) },
  { label: 'FG Att', accessor: (p) => fmt(p.careerStats?.kicking?.fga) },
  {
    label: 'FG %',
    accessor: (p) =>
      p.careerStats?.kicking?.fgPct != null
        ? `${fmtFloat(p.careerStats.kicking.fgPct)}%`
        : '—',
  },
  { label: 'Sacks', accessor: (p) => fmtFloat(p.careerStats?.defense?.sacks) },
  { label: 'Def INT', accessor: (p) => fmt(p.careerStats?.defense?.int) },
  {
    label: 'Pts Allowed/G',
    accessor: (p) => fmtFloat(p.careerStats?.defense?.ptsAllowedPerG),
  },
  { label: 'Solo Tkl', accessor: (p) => fmt(p.careerStats?.idp?.soloTkl) },
  { label: 'IDP Sacks', accessor: (p) => fmtFloat(p.careerStats?.idp?.sacks) },
  { label: 'IDP INT', accessor: (p) => fmt(p.careerStats?.idp?.int) },
  { label: 'Forced Fum', accessor: (p) => fmt(p.careerStats?.idp?.ff) },
];

function PlayerColumnHeader({ player }: { player: ComparePlayer }) {
  return (
    <YStack flex={1} gap={4} alignItems="center">
      <Text
        fontSize={16}
        fontWeight="800"
        color="$color"
        fontFamily={FONT_DISPLAY}
        textAlign="center"
        numberOfLines={2}
      >
        {playerName(player)}
      </Text>
      <Text fontSize={12} color="$textMuted" fontFamily={FONT_BODY}>
        {[player.isDst ? 'DST' : player.position, player.nflTeam]
          .filter(Boolean)
          .join(' · ')}
      </Text>
    </YStack>
  );
}

export function FootballPlayersComparePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const idA = parseId(searchParams.get('a'));
  const idB = parseId(searchParams.get('b'));
  const isPremium = useHasEntitlement(ENTITLEMENTS.player_comparison);

  const queryA = useFootballPlayerQuery({
    variables: { id: idA },
    skip: idA === 0,
  });
  const queryB = useFootballPlayerQuery({
    variables: { id: idB },
    skip: idB === 0,
  });

  const playerA = queryA.data?.footballPlayer;
  const playerB = queryB.data?.footballPlayer;
  const loading = queryA.loading || queryB.loading;
  const error = queryA.error || queryB.error;

  const idsValid = idA > 0 && idB > 0;

  // Only show rows where at least one player has a meaningful value, so the
  // table doesn't fill with em-dashes for irrelevant stat categories.
  const visibleRows =
    playerA && playerB
      ? STAT_ROWS.filter(
          (row) =>
            row.accessor(playerA) !== '—' || row.accessor(playerB) !== '—',
        )
      : [];

  return (
    <YStack flex={1} backgroundColor="$background" minHeight="100vh">
      <PageMeta
        title="Compare Players"
        description="Side-by-side football player comparison"
      />

      {/* Header */}
      <YStack
        paddingHorizontal={24}
        paddingTop={24}
        paddingBottom={16}
        gap={8}
        style={{
          background:
            'linear-gradient(180deg, var(--accentMuted) 0%, transparent 100%)',
        }}
      >
        <XStack
          alignItems="center"
          gap={6}
          cursor="pointer"
          role="link"
          tabIndex={0}
          onPress={() => {
            if (window.history.length > 1) navigate(-1);
            else navigate('/football/players');
          }}
          onKeyDown={(e: { key: string; preventDefault: () => void }) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              if (window.history.length > 1) navigate(-1);
              else navigate('/football/players');
            }
          }}
          hoverStyle={{ opacity: 0.8 }}
        >
          <ArrowLeft size={16} color="$textMuted" />
          <Text fontSize={13} color="$textMuted" fontFamily={FONT_BODY}>
            Back to players
          </Text>
        </XStack>
        <Text
          fontSize={26}
          fontWeight="800"
          color="$color"
          fontFamily={FONT_DISPLAY}
          letterSpacing={-0.5}
        >
          Compare Players
        </Text>
      </YStack>

      <YStack flex={1} padding={16} gap={16}>
        {!idsValid && (
          <YStack
            flex={1}
            alignItems="center"
            justifyContent="center"
            padding={40}
            gap={8}
          >
            <Text fontSize={16} color="$textMuted" fontFamily={FONT_DISPLAY}>
              Select two players to compare
            </Text>
            <Text fontSize={13} color="$textMuted" fontFamily={FONT_BODY}>
              Go back to the players list and pick two.
            </Text>
          </YStack>
        )}

        {idsValid && error && (
          <YStack
            backgroundColor="$red2"
            borderWidth={1}
            borderColor="$red6"
            borderRadius={8}
            padding={16}
          >
            <Text color="$red11" fontSize={14}>
              Failed to load players. Please try again.
            </Text>
          </YStack>
        )}

        {idsValid && loading && (
          <YStack
            flex={1}
            alignItems="center"
            justifyContent="center"
            padding={40}
          >
            <Spinner size="large" color="$brandGold" />
          </YStack>
        )}

        {idsValid && !loading && !error && (!playerA || !playerB) && (
          <YStack
            flex={1}
            alignItems="center"
            justifyContent="center"
            padding={40}
            gap={8}
          >
            <Text fontSize={16} color="$textMuted" fontFamily={FONT_DISPLAY}>
              Player not found
            </Text>
            <Text fontSize={13} color="$textMuted" fontFamily={FONT_BODY}>
              One or both players could not be loaded.
            </Text>
          </YStack>
        )}

        {idsValid && !loading && !error && playerA && playerB && (
          <PremiumGate
            isPremium={isPremium}
            featureName="Player Comparison"
            featureDescription="Compare players side-by-side with a Premium subscription."
          >
            <YStack
              backgroundColor="$surfaceCard"
              borderWidth={1}
              borderColor="$outlineSubtle"
              borderRadius={10}
              overflow="hidden"
            >
              {/* Column headers */}
              <XStack
                paddingVertical={16}
                paddingHorizontal={12}
                backgroundColor="$surfacePanel"
                borderBottomWidth={1}
                borderBottomColor="$outlineSubtle"
                alignItems="center"
              >
                <PlayerColumnHeader player={playerA} />
                <YStack width={80} alignItems="center">
                  <Text
                    fontSize={12}
                    color="$brandGold"
                    fontWeight="700"
                    fontFamily={FONT_BODY}
                  >
                    VS
                  </Text>
                </YStack>
                <PlayerColumnHeader player={playerB} />
              </XStack>

              {/* Stat rows */}
              {visibleRows.length === 0 ? (
                <YStack padding={24} alignItems="center">
                  <Text fontSize={13} color="$textMuted" fontFamily={FONT_BODY}>
                    No comparable stats available for these players.
                  </Text>
                </YStack>
              ) : (
                visibleRows.map((row, idx) => (
                  <XStack
                    key={row.label}
                    paddingVertical={12}
                    paddingHorizontal={12}
                    alignItems="center"
                    backgroundColor={
                      idx % 2 === 0 ? 'transparent' : '$accentMuted'
                    }
                  >
                    <Text
                      flex={1}
                      fontSize={14}
                      color="$color"
                      fontWeight="700"
                      fontVariant={['tabular-nums']}
                      textAlign="center"
                    >
                      {row.accessor(playerA)}
                    </Text>
                    <Text
                      width={80}
                      fontSize={12}
                      color="$textMuted"
                      fontFamily={FONT_BODY}
                      textAlign="center"
                    >
                      {row.label}
                    </Text>
                    <Text
                      flex={1}
                      fontSize={14}
                      color="$color"
                      fontWeight="700"
                      fontVariant={['tabular-nums']}
                      textAlign="center"
                    >
                      {row.accessor(playerB)}
                    </Text>
                  </XStack>
                ))
              )}
            </YStack>
          </PremiumGate>
        )}
      </YStack>
    </YStack>
  );
}

export default FootballPlayersComparePage;
