import React, { useCallback, useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { Button, Card, Input, Spinner, Text, XStack, YStack } from 'tamagui';
import { ChevronLeft, UserPlus, Users } from '@tamagui/lucide-icons';
import { LOGGER } from '@legacy-sports/logging';
import {
  type FreeAgentClaimPlayer,
  LeagueDetailFreeAgentsTab,
} from '@legacy-sports/shared-components';

import {
  useClaimFreeAgentMutation,
  useGetLeagueByIdQuery,
  useGetTeamMembersQuery,
  useGetUserLeaguesQuery,
  useGetUserTeamIdQuery,
} from '../../api/db/graphql.generated';
import { useAuthorizedUserInfo } from '../../common/auth/AuthorizedUserContext';
import { useIsMounted } from '../../common/hooks/useIsMounted';

/**
 * Native league free-agents view (LS-7818).
 *
 * Wraps the cross-platform `LeagueDetailFreeAgentsTab`
 * (`@legacy-sports/shared-components`) so native matches web v2 at parity:
 * paginated pool, position/name filters, full stat columns, member/spectator
 * banners. Native supplies the waiver-claim flow via `renderClaimAction` — an
 * inline FAAB cluster (web uses a modal instead). This component is consumed by
 * both the league-detail Free Agents tab and the standalone Free Agents screen
 * below, so there is a single free-agent UI on native.
 */
export function LeagueFreeAgents({
  leagueId,
  leagueName,
  onBack,
}: {
  leagueId: number;
  leagueName: string;
  onBack?: () => void;
}) {
  const [claimingPlayerId, setClaimingPlayerId] = useState<number | null>(null);
  const [faabBid, setFaabBid] = useState('');

  const { data: teamData } = useGetUserTeamIdQuery({
    variables: { leagueId },
  });
  const userTeamId = teamData?.userTeamId ?? null;

  const { data: leagueData } = useGetLeagueByIdQuery({
    variables: { id: leagueId },
  });
  const league = leagueData?.league;
  const waiverEnabled = league?.waiverEnabled ?? false;
  const maxRosterSize = league?.maxRosterSize ?? Infinity;
  // FAAB (Free Agent Acquisition Budget) leagues require a bid amount on every
  // waiver claim; standard/priority waiver leagues do not. The inline bid input
  // and the required-bid validation below are gated on this flag.
  const waiverType = league?.waiverType ?? 'standard';
  const isFaab = waiverEnabled && waiverType === 'faab';

  const { data: rosterData } = useGetTeamMembersQuery({
    variables: { teamId: userTeamId ?? 0 },
    skip: !userTeamId,
  });
  const userRosterSize = rosterData?.teamMembers?.length ?? 0;

  const isMounted = useIsMounted();

  const [claimFreeAgent, { loading: claiming }] = useClaimFreeAgentMutation({
    onCompleted: () => {
      Alert.alert('Success', 'Waiver claim submitted successfully.');
      if (!isMounted()) return;
      setClaimingPlayerId(null);
      setFaabBid('');
    },
    onError: (error) => {
      // Pass the Error instance (not just its message) so Rollbar captures the
      // full stack trace (LS-7818 review).
      LOGGER.error('Failed to claim free agent:', error);
      Alert.alert('Error', error.message);
    },
  });

  const handleClaim = useCallback(
    (playerId: number) => {
      // Block the claim when the user's roster is already at max capacity.
      // The server requires a `dropPlayerId` in this case, but the UI does
      // not yet support selecting a player to drop.
      if (userRosterSize >= maxRosterSize) {
        Alert.alert(
          'Roster Full',
          `Your roster is at the maximum size (${maxRosterSize}). ` +
            'You must drop a player before claiming a new one. ' +
            'Visit your roster to release a player first.',
        );
        return;
      }

      // FAAB leagues require a whole, non-negative bid on every claim — the
      // server rejects a missing or negative bid with a UserInputError. Enforce
      // it client-side so the user gets clear guidance. Require a whole integer
      // string: parseInt would otherwise silently truncate inputs like "15.5".
      let bidAmount: number | undefined;
      if (isFaab) {
        const trimmedBid = faabBid.trim();
        if (!/^\d+$/.test(trimmedBid)) {
          Alert.alert(
            'FAAB Bid Required',
            'Enter a whole FAAB bid amount (0 or more) to submit a waiver claim in this league.',
          );
          return;
        }
        bidAmount = parseInt(trimmedBid, 10);
      }
      void claimFreeAgent({
        variables: { leagueId, playerId, faabBid: bidAmount },
      });
    },
    [claimFreeAgent, leagueId, faabBid, isFaab, userRosterSize, maxRosterSize],
  );

  const handleAddDirectly = useCallback(
    (playerId: number) => {
      // Direct free-agent adds are not yet supported on the backend, and
      // claimFreeAgent rejects when waivers are disabled — so surface guidance
      // instead of attempting a claim.
      Alert.alert(
        'Add Player',
        'Direct free-agent adds are not yet supported. Ask your commissioner to enable waivers.',
      );
      LOGGER.warn('Attempted direct add with waivers disabled', {
        playerId,
        leagueId,
      });
    },
    [leagueId],
  );

  // The inline FAAB claim cluster, supplied to the shared tab via
  // `renderClaimAction`. Only rendered for a viewer on a team.
  const renderClaimAction = useCallback(
    (player: FreeAgentClaimPlayer) => {
      const isClaimingThis = claimingPlayerId === player.id;
      if (isClaimingThis) {
        return (
          <YStack gap="$1" alignItems="flex-end">
            {isFaab && (
              <Input
                size="$2"
                width={80}
                placeholder="FAAB $"
                value={faabBid}
                onChangeText={setFaabBid}
                keyboardType="numeric"
                accessibilityLabel="FAAB bid amount"
              />
            )}
            <XStack gap="$1">
              <Button
                size="$2"
                backgroundColor="$green3"
                borderColor="$green7"
                borderWidth={1}
                borderRadius="$2"
                disabled={claiming}
                onPress={() => handleClaim(player.id)}
                icon={claiming ? <Spinner size="small" /> : undefined}
              >
                <Text fontSize="$1" color="$green10" fontWeight="600">
                  Confirm
                </Text>
              </Button>
              <Button
                size="$2"
                backgroundColor="$gray3"
                borderRadius="$2"
                onPress={() => {
                  setClaimingPlayerId(null);
                  setFaabBid('');
                }}
              >
                <Text fontSize="$1" color="$textMuted">
                  Cancel
                </Text>
              </Button>
            </XStack>
          </YStack>
        );
      }
      return (
        <Button
          size="$2"
          backgroundColor="$blue3"
          borderColor="$blue7"
          borderWidth={1}
          borderRadius="$2"
          onPress={() => {
            if (!waiverEnabled) {
              // Waivers disabled — direct add (no claim mutation).
              handleAddDirectly(player.id);
              return;
            }
            if (player.id !== claimingPlayerId) setFaabBid('');
            setClaimingPlayerId(player.id);
          }}
          icon={<UserPlus size={12} color="$blue10" />}
        >
          <Text fontSize="$1" color="$blue10" fontWeight="600">
            {waiverEnabled ? 'Claim' : 'Add'}
          </Text>
        </Button>
      );
    },
    [
      claimingPlayerId,
      faabBid,
      isFaab,
      claiming,
      waiverEnabled,
      handleClaim,
      handleAddDirectly,
    ],
  );

  return (
    <YStack flex={1}>
      {onBack != null && (
        <XStack alignItems="center" gap="$2" padding="$4" paddingBottom="$2">
          <Text
            onPress={onBack}
            tabIndex={0}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') onBack?.();
            }}
            color="$blue10"
            fontSize="$4"
            pressStyle={{ opacity: 0.7 }}
            accessibilityRole="button"
            accessibilityLabel={`Back to ${leagueName}`}
          >
            <ChevronLeft size={16} color="$blue10" /> {leagueName}
          </Text>
        </XStack>
      )}

      <LeagueDetailFreeAgentsTab
        league={{
          id: leagueId,
          sport: league?.sport ?? 'baseball',
          waiverEnabled,
          waiverType,
          gamesPerMatchup: league?.gamesPerMatchup,
        }}
        isMember
        myTeamId={userTeamId}
        renderClaimAction={renderClaimAction}
      />
    </YStack>
  );
}

export default function FreeAgentsScreen() {
  const userInfo = useAuthorizedUserInfo();
  const [selectedLeague, setSelectedLeague] = useState<{
    id: number;
    name: string;
  } | null>(null);

  const { data, loading } = useGetUserLeaguesQuery({
    skip: !userInfo?.id,
  });

  if (selectedLeague != null) {
    return (
      <LeagueFreeAgents
        leagueId={selectedLeague.id}
        leagueName={selectedLeague.name}
        onBack={() => setSelectedLeague(null)}
      />
    );
  }

  const leagues = data?.userLeagues ?? [];

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <YStack flex={1} padding="$4" gap="$4">
        <XStack alignItems="center" gap="$2">
          <Users size={20} color="$color" />
          <Text fontSize="$6" fontWeight="700" color="$color">
            Free Agents &amp; Waivers
          </Text>
        </XStack>

        <Text color="$textMuted" fontSize="$3">
          Select a league to browse free agents and submit waiver claims.
        </Text>

        {loading && (
          <YStack alignItems="center" padding="$6">
            <Spinner size="large" color="$color" />
          </YStack>
        )}

        {!loading && leagues.length === 0 && (
          <YStack alignItems="center" justifyContent="center" flex={1} gap="$3">
            <Users size={32} color="$textMuted" />
            <Text color="$textMuted" fontSize="$4" textAlign="center">
              No leagues found.
            </Text>
          </YStack>
        )}

        {leagues.map((league) => {
          const leagueId = league.id;
          if (leagueId == null) return null;
          return (
            <Card
              key={leagueId}
              backgroundColor="$surfacePanel"
              borderColor="$surfacePanelBorder"
              borderWidth={1}
              borderRadius="$5"
              padding="$4"
              pressStyle={{ opacity: 0.8, scale: 0.98 }}
              onPress={() =>
                setSelectedLeague({
                  id: leagueId,
                  name: league.name ?? 'League',
                })
              }
              accessibilityRole="button"
              accessibilityLabel={`Browse free agents for ${league.name ?? 'League'}`}
            >
              <XStack alignItems="center" gap="$3">
                <YStack
                  width={40}
                  height={40}
                  borderRadius={20}
                  backgroundColor="$surfaceSubtle"
                  alignItems="center"
                  justifyContent="center"
                >
                  <Users size={18} color="$color" />
                </YStack>
                <YStack flex={1}>
                  <Text
                    fontSize="$4"
                    fontWeight="600"
                    color="$color"
                    numberOfLines={1}
                  >
                    {league.name}
                  </Text>
                </YStack>
              </XStack>
            </Card>
          );
        })}
      </YStack>
    </ScrollView>
  );
}
export { ScreenErrorBoundary as ErrorBoundary } from './_screenErrorBoundary';
