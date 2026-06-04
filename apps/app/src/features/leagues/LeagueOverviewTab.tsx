import React from 'react';
import { Alert, ScrollView } from 'react-native';
import { Button, Card, Text, XStack, YStack } from 'tamagui';
import {
  LeagueActivityFeed,
  OnThisDayFeed,
} from '@legacy-sports/shared-components';
import { LeagueDuesPaymentStatus } from '../commissioner/LeagueDuesPaymentStatus';
import { Sport } from '../../api/db/graphql.generated';

interface RankedStanding {
  rank: number;
  teamId: number | null;
  name: string;
  record: string;
  isMine: boolean;
}

interface OverviewLeague {
  lmNotes?: string | null;
  maxRosterSize?: number | null;
  gamesPerMatchup?: number | null;
  currentWeekNumber?: number | null;
  inviteCode?: string | null;
  sport?: string | null;
}

interface LeagueOverviewTabProps {
  league: OverviewLeague;
  leagueId: number;
  isCommissioner: boolean;
  isDrafting: boolean;
  rankedStandings: RankedStanding[];
  startersCount: number;
  inviteCode: string;
  onJoinDraft: () => void;
  onViewAllStandings: () => void;
  onInviteShare: () => void;
  onPlayerPress: (playerId: number) => void;
}

export function LeagueOverviewTab({
  league,
  leagueId,
  isCommissioner,
  isDrafting,
  rankedStandings,
  startersCount,
  inviteCode,
  onJoinDraft,
  onViewAllStandings,
  onInviteShare,
  onPlayerPress,
}: LeagueOverviewTabProps): React.JSX.Element {
  const isFootball = league.sport === Sport.Football;

  const stats = [
    { label: 'Teams', value: String(rankedStandings.length || '—') },
    { label: 'Roster Size', value: String(league.maxRosterSize ?? '—') },
    isFootball
      ? {
          label: 'Weeks / Season',
          value: String(league.gamesPerMatchup ?? '—'),
        }
      : {
          label: 'Games / Matchup',
          value: String(league.gamesPerMatchup ?? '—'),
        },
    isFootball
      ? { label: 'Format', value: 'H2H' }
      : { label: 'Matchup', value: '7 days' },
    { label: 'My Starters', value: String(startersCount) },
  ];

  return (
    <ScrollView>
      <YStack padding="$3" space="$3">
        {/* Draft Live Banner */}
        {isDrafting ? (
          <Card backgroundColor="$yellow2" borderColor="$yellow7" padding="$3">
            <XStack space="$2" alignItems="center">
              <YStack flex={1}>
                <Text fontSize="$4" fontWeight="700" color="$yellow11">
                  Draft Is Live
                </Text>
                <Text fontSize="$2" color="$yellow10">
                  Join the draft room to make your picks.
                </Text>
              </YStack>
              <Button
                size="$3"
                backgroundColor="$yellow9"
                color="white"
                onPress={onJoinDraft}
              >
                Join Draft
              </Button>
            </XStack>
          </Card>
        ) : null}

        {/* Commissioner Announcement */}
        {league.lmNotes ? (
          <Card backgroundColor="$yellow2" borderColor="$yellow6" padding="$3">
            <YStack space="$1">
              <Text
                fontSize="$2"
                fontWeight="700"
                color="$yellow10"
                textTransform="uppercase"
                letterSpacing={1}
              >
                Commissioner Announcement
              </Text>
              <Text fontSize="$3" color="$yellow11">
                {league.lmNotes}
              </Text>
            </YStack>
          </Card>
        ) : null}

        {/* Snapshot Stats */}
        <Card backgroundColor="$gray2" borderColor="$gray6" padding="$3">
          <XStack flexWrap="wrap">
            {stats.map((stat) => (
              <YStack
                key={stat.label}
                width="33.33%"
                paddingVertical="$2"
                alignItems="center"
              >
                <Text fontSize="$5" fontWeight="800" color="$color">
                  {stat.value}
                </Text>
                <Text
                  fontSize="$1"
                  color="$gray10"
                  textTransform="uppercase"
                  letterSpacing={1}
                >
                  {stat.label}
                </Text>
              </YStack>
            ))}
          </XStack>
        </Card>

        {/* Quick Standings */}
        {rankedStandings.length > 0 ? (
          <YStack space="$2">
            <XStack justifyContent="space-between" alignItems="center">
              <YStack>
                <Text fontSize="$4" fontWeight="700">
                  Standings
                </Text>
                <Text fontSize="$2" color="$gray10">
                  Top {Math.min(6, rankedStandings.length)}
                  {league.currentWeekNumber
                    ? ` · Week ${league.currentWeekNumber}`
                    : ''}
                </Text>
              </YStack>
              <Button size="$2" chromeless onPress={onViewAllStandings}>
                <Text fontSize="$2" color="$blue9">
                  View All →
                </Text>
              </Button>
            </XStack>
            <Card backgroundColor="$gray2" borderColor="$gray6" padding="$2">
              <YStack>
                {rankedStandings.slice(0, 6).map((row) => (
                  <XStack
                    key={row.teamId ?? row.rank}
                    paddingVertical="$2"
                    paddingHorizontal="$2"
                    alignItems="center"
                    space="$2"
                    backgroundColor={row.isMine ? '$blue2' : 'transparent'}
                    borderRadius="$2"
                  >
                    <Text
                      fontSize="$2"
                      fontWeight="700"
                      color="$gray10"
                      width={20}
                      textAlign="center"
                    >
                      {row.rank}
                    </Text>
                    <Text
                      fontSize="$3"
                      flex={1}
                      fontWeight={row.isMine ? '700' : '400'}
                      color="$color"
                    >
                      {row.name}
                    </Text>
                    <Text
                      fontSize="$2"
                      color="$gray11"
                      fontVariant={['tabular-nums']}
                    >
                      {row.record}
                    </Text>
                  </XStack>
                ))}
              </YStack>
            </Card>
            {rankedStandings.length > 6 ? (
              <Text fontSize="$2" color="$gray10" textAlign="center">
                + {rankedStandings.length - 6} more teams
              </Text>
            ) : null}
          </YStack>
        ) : null}

        {/* League Dues Payment Status */}
        <LeagueDuesPaymentStatus
          leagueId={leagueId}
          isCommissioner={isCommissioner}
          onSuccess={(msg) => Alert.alert('Success', msg)}
          onError={(err) => Alert.alert('Error', err.message)}
        />

        {/* Activity Feed */}
        <YStack>
          <Text fontSize="$5" fontWeight="600" marginBottom="$2">
            Recent Activity
          </Text>
          <LeagueActivityFeed leagueId={leagueId} limit={15} />
        </YStack>

        {/* On This Day */}
        <OnThisDayFeed onPlayerPress={onPlayerPress} />

        {/* Invite (commissioner only) */}
        {isCommissioner ? (
          <Card backgroundColor="$blue2" borderColor="$blue6" padding="$3">
            <YStack space="$3">
              <XStack justifyContent="space-between" alignItems="center">
                <YStack flex={1}>
                  <Text fontSize="$4" fontWeight="600">
                    Invite Friends
                  </Text>
                  <Text fontSize="$2" color="$gray11">
                    Share your league with new managers
                  </Text>
                </YStack>
                <Button
                  size="$3"
                  backgroundColor="$blue9"
                  color="white"
                  onPress={onInviteShare}
                >
                  Share
                </Button>
              </XStack>
              {inviteCode ? (
                <YStack space="$2">
                  <Text
                    fontSize="$2"
                    color="$gray10"
                    fontWeight="600"
                    textTransform="uppercase"
                    letterSpacing={1}
                  >
                    Invite Code
                  </Text>
                  <Card
                    backgroundColor="$gray2"
                    padding="$3"
                    bordered
                    alignItems="center"
                  >
                    <Text
                      fontSize="$6"
                      fontWeight="800"
                      letterSpacing={4}
                      fontFamily="$mono"
                    >
                      {inviteCode}
                    </Text>
                  </Card>
                </YStack>
              ) : null}
            </YStack>
          </Card>
        ) : null}
      </YStack>
    </ScrollView>
  );
}
