import React, { useMemo, useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import {
  Button,
  Card,
  Separator,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import {
  AlertTriangle,
  ChevronLeft,
  Settings,
  Shield,
} from '@tamagui/lucide-icons';
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
} from '../../api/db/graphql.generated';
import { useAuthorizedUserInfo } from '../../common/auth/AuthorizedUserContext';

function LeagueCommissionerTools({
  leagueId,
  leagueName,
  onBack,
}: {
  leagueId: number;
  leagueName: string;
  onBack: () => void;
}) {
  const userInfo = useAuthorizedUserInfo();

  const {
    data: leagueData,
    loading,
    error,
  } = useGetLeagueByIdQuery({
    variables: { id: leagueId },
  });

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
        <Text
          onPress={onBack}
          color="$blue10"
          fontSize="$4"
          pressStyle={{ opacity: 0.7 }}
        >
          Go back
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
        <XStack alignItems="center" gap="$2">
          <Text
            onPress={onBack}
            color="$blue10"
            fontSize="$4"
            pressStyle={{ opacity: 0.7 }}
          >
            <ChevronLeft size={16} color="$blue10" /> {leagueName}
          </Text>
        </XStack>

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
              onSuccess={handleSuccess}
              onError={handleError}
            />

            <Separator />

            {/* Delete League */}
            <DeleteLeagueControl
              leagueId={leagueId}
              leagueName={leagueName}
              onDeleted={onBack}
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

  const { data, loading, error, refetch } = useGetUserLeaguesQuery({
    skip: !userInfo?.id,
  });

  if (selectedLeague != null) {
    return (
      <LeagueCommissionerTools
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
                      isCommissioner ? '$blue3' : '$surfaceSubtle'
                    }
                    alignItems="center"
                    justifyContent="center"
                  >
                    {isCommissioner ? (
                      <Shield size={18} color="$blue10" />
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
