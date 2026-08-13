import React, { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  Button,
  Card,
  Separator,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { AlertTriangle } from '@tamagui/lucide-icons/icons/AlertTriangle';
import { Settings } from '@tamagui/lucide-icons/icons/Settings';
import { Shield } from '@tamagui/lucide-icons/icons/Shield';
import {
  CommissionerAuditLog,
  CommissionerNoteControl,
  DeleteLeagueControl,
  DraftOrderControl,
  DraftSettingsControl,
} from '@legacy-sports/shared-components';
import { LOGGER } from '@legacy-sports/logging';

import {
  useGetLeagueByIdQuery,
  useGetUserLeaguesQuery,
} from '@legacy-sports/graphql';
import { useAuthorizedUserInfo } from '../../common/auth/AuthorizedUserContext';
import { useSystemBackAction } from '../../common/hooks/useSystemBackAction';
import { useSubscription } from '../subscription/useSubscription';

function LeagueCommissionerTools({
  leagueId,
  leagueName,
  onDeleted,
}: {
  leagueId: number;
  leagueName: string;
  /**
   * Returns to the league list after the league is deleted. This screen renders
   * no back affordance (LS-8766) — ordinary back navigation is system back.
   */
  onDeleted: () => void;
}) {
  const userInfo = useAuthorizedUserInfo();
  const { isPremium } = useSubscription();

  const {
    data: leagueData,
    loading,
    error,
    refetch: refetchLeague,
  } = useGetLeagueByIdQuery({
    variables: { id: leagueId },
  });

  // Commissioner actions taken on another platform (e.g. web) don't push to
  // this client, so re-pull league state whenever this screen regains focus
  // rather than relying on a stale cache (LS-6857).
  useFocusEffect(
    useCallback(() => {
      void refetchLeague();
    }, [refetchLeague]),
  );

  const league = leagueData?.league;
  const isCommissioner = useMemo(() => {
    if (!league || !userInfo) return false;
    return league.owner === userInfo.id || userInfo.isAdmin;
  }, [league, userInfo]);

  if (loading) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" padding="$4">
        <Spinner size="large" color="$color" />
      </YStack>
    );
  }

  if (error || !league) {
    return (
      <YStack
        flex={1}
        alignItems="center"
        justifyContent="center"
        padding="$4"
        gap="$3"
      >
        <Text color="$red10" fontSize="$4" textAlign="center">
          {error ? 'Failed to load league data.' : 'League not found.'}
        </Text>
      </YStack>
    );
  }

  const handleSuccess = (message: string) => {
    Alert.alert('Success', message);
  };

  const handleError = (error: Error) => {
    LOGGER.error('Commissioner action failed:', error);
    Alert.alert('Error', error.message);
  };

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 16 }}>
      <YStack gap="$4">
        {!isCommissioner && (
          <Card
            backgroundColor="$yellow3"
            borderColor="$yellow7"
            borderWidth={1}
            borderRadius="$5"
            padding="$4"
          >
            <XStack alignItems="center" gap="$2">
              <Shield size={16} color="$yellow10" />
              <Text color="$yellow11" fontSize="$3">
                You are not the commissioner of this league. Some actions may be
                restricted.
              </Text>
            </XStack>
          </Card>
        )}

        {/* Audit Log (visible to all members) */}
        <CommissionerAuditLog leagueId={leagueId} limit={20} />

        {isCommissioner && (
          <>
            <Separator />

            {/* Commissioner Notes */}
            <CommissionerNoteControl
              leagueId={leagueId}
              currentNote={league.lmNotes}
              onSuccess={handleSuccess}
              onError={handleError}
            />

            <Separator />

            {/* Draft Order */}
            <DraftOrderControl
              leagueId={leagueId}
              draftStatus={league.draftStatus}
              onSuccess={handleSuccess}
              onError={handleError}
            />

            <Separator />

            {/* Draft Settings */}
            <DraftSettingsControl
              leagueId={leagueId}
              draftStatus={league.draftStatus}
              playerPool={league.playerPool}
              rosterContinuity={league.rosterContinuity}
              isPremium={isPremium}
              onSuccess={handleSuccess}
              onError={handleError}
            />

            <Separator />

            {/* Delete League */}
            <DeleteLeagueControl
              leagueId={leagueId}
              leagueName={leagueName}
              onDeleted={onDeleted}
              onError={handleError}
            />
          </>
        )}
      </YStack>
    </ScrollView>
  );
}

export const LeagueManagement: React.FC = () => {
  const userInfo = useAuthorizedUserInfo();
  const [selectedLeague, setSelectedLeague] = useState<{
    id: number;
    name: string;
  } | null>(null);

  const clearSelectedLeague = useCallback(() => setSelectedLeague(null), []);

  const { data, loading, error, refetch } = useGetUserLeaguesQuery({
    skip: !userInfo?.id,
  });

  // No in-content back affordance is rendered any more (LS-8766), so system
  // back has to unwind the league selection before it pops the screen.
  useSystemBackAction(selectedLeague != null, clearSelectedLeague);

  // Commissioner actions on another platform (e.g. deleting a league on web)
  // don't push to this client, so re-pull the league list whenever this
  // screen regains focus rather than relying on a stale cache (LS-6857).
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  if (selectedLeague != null) {
    return (
      <LeagueCommissionerTools
        leagueId={selectedLeague.id}
        leagueName={selectedLeague.name}
        onDeleted={clearSelectedLeague}
      />
    );
  }

  const leagues = data?.userLeagues ?? [];

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <YStack flex={1} padding="$4" gap="$4">
        <XStack alignItems="center" gap="$2">
          <Settings size={20} color="$color" />
          <Text fontSize="$6" fontWeight="700" color="$color">
            League Management
          </Text>
        </XStack>

        <Text color="$textMuted" fontSize="$3">
          Select a league to manage settings and commissioner tools.
        </Text>

        {loading && (
          <YStack alignItems="center" padding="$6">
            <Spinner size="large" color="$color" />
          </YStack>
        )}

        {!loading && error != null && (
          <YStack alignItems="center" justifyContent="center" flex={1} gap="$3">
            <AlertTriangle size={32} color="$red10" />
            <Text color="$red10" fontSize="$4" textAlign="center">
              Failed to load leagues.
            </Text>
            <Text color="$textMuted" fontSize="$3" textAlign="center">
              {error.message}
            </Text>
            <Button
              size="$3"
              theme="active"
              onPress={() => {
                refetch().catch(() => {
                  /* refetch error is captured by the hook */
                });
              }}
            >
              Retry
            </Button>
          </YStack>
        )}

        {!loading && error == null && leagues.length === 0 && (
          <YStack alignItems="center" justifyContent="center" flex={1} gap="$3">
            <Settings size={32} color="$textMuted" />
            <Text color="$textMuted" fontSize="$4" textAlign="center">
              No leagues found.
            </Text>
            <Text color="$textMuted" fontSize="$3" textAlign="center">
              Join or create a league to manage it.
            </Text>
          </YStack>
        )}

        {leagues.map((league) => {
          const leagueId = league.id;
          if (leagueId == null) return null;

          const isCommissioner =
            league.owner === userInfo?.id || userInfo?.isAdmin === true;

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
            >
              <XStack alignItems="center" justifyContent="space-between">
                <XStack alignItems="center" gap="$3" flex={1}>
                  <YStack
                    width={40}
                    height={40}
                    borderRadius={20}
                    backgroundColor={
                      isCommissioner ? '$surfaceInteractive' : '$surfaceSubtle'
                    }
                    alignItems="center"
                    justifyContent="center"
                  >
                    {isCommissioner ? (
                      <Shield size={18} color="$brandGoldLight" />
                    ) : (
                      <Settings size={18} color="$color" />
                    )}
                  </YStack>
                  <YStack flex={1}>
                    <Text
                      fontSize="$4"
                      fontWeight="600"
                      color="$color"
                      numberOfLines={1}
                    >
                      {league.name ?? 'League'}
                    </Text>
                    <Text fontSize="$2" color="$textMuted">
                      {isCommissioner ? 'Commissioner' : 'Member'}
                    </Text>
                  </YStack>
                </XStack>
              </XStack>
            </Card>
          );
        })}
      </YStack>
    </ScrollView>
  );
};

export default LeagueManagement;
