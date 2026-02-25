import React, { useMemo } from 'react';
import { Card, Separator, Text, XStack, YStack } from 'tamagui';
import {
  CalendarCheck,
  Clock,
  Play,
  TrendingUp,
  Trophy,
  Users,
  Zap,
} from '@tamagui/lucide-icons';
import { BRAND_GOLD_LIGHT } from '../../constants/colors';

interface ActivityItem {
  id: string;
  icon: React.ReactNode;
  title: string;
  detail: string;
  timestamp: string;
  color: string;
}

export interface LeagueActivityFeedProps {
  leagueId: number;
  draftStatus: string;
  currentMatchup?: number | null;
  teamCount: number;
}

/**
 * LeagueActivityFeed — Displays recent league activity and contextual status
 * updates based on the current state of the league (draft, matchups, etc.).
 *
 * In a full implementation this would pull from a league activity log API.
 * For now it synthesizes meaningful status items from league state.
 */
export function LeagueActivityFeed({
  leagueId,
  draftStatus,
  currentMatchup,
  teamCount,
}: LeagueActivityFeedProps): React.JSX.Element {
  const activities: ActivityItem[] = useMemo(() => {
    const items: ActivityItem[] = [];

    // Draft-related activity
    if (draftStatus === 'completed') {
      items.push({
        id: 'draft-complete',
        icon: <Trophy size={16} color="rgb(34, 197, 94)" />,
        title: 'Draft completed',
        detail: `All ${teamCount} teams have their rosters set.`,
        timestamp: 'Draft Day',
        color: '$green11',
      });
    } else if (draftStatus === 'in-progress') {
      items.push({
        id: 'draft-live',
        icon: <Zap size={16} color="rgb(59, 130, 246)" />,
        title: 'Draft in progress',
        detail: 'Managers are making their picks now.',
        timestamp: 'Live',
        color: BRAND_GOLD_LIGHT,
      });
    } else if (draftStatus === 'queued') {
      items.push({
        id: 'draft-queued',
        icon: <Clock size={16} color="rgb(245, 158, 11)" />,
        title: 'Draft queued',
        detail: 'The draft is scheduled and ready to start.',
        timestamp: 'Upcoming',
        color: '$amber11',
      });
    } else {
      items.push({
        id: 'draft-pending',
        icon: <CalendarCheck size={16} color="rgb(148, 163, 184)" />,
        title: 'Waiting for draft',
        detail:
          'The commissioner needs to start the draft before the season begins.',
        timestamp: 'Pre-season',
        color: '$gray11',
      });
    }

    // Matchup-related activity
    if (currentMatchup && currentMatchup > 0) {
      items.push({
        id: 'matchup-active',
        icon: <Play size={16} color="rgb(34, 197, 94)" />,
        title: `Week ${currentMatchup} is active`,
        detail: 'Check your matchup and make sure your lineup is set.',
        timestamp: `Week ${currentMatchup}`,
        color: '$green11',
      });

      if (currentMatchup > 1) {
        items.push({
          id: 'matchup-history',
          icon: <TrendingUp size={16} color="rgb(59, 130, 246)" />,
          title: `${currentMatchup - 1} week${currentMatchup - 1 > 1 ? 's' : ''} completed`,
          detail: 'Review past results in the Standings tab.',
          timestamp: 'Season',
          color: BRAND_GOLD_LIGHT,
        });
      }
    }

    // Team count info
    items.push({
      id: 'teams-joined',
      icon: <Users size={16} color="rgb(168, 85, 247)" />,
      title: `${teamCount} team${teamCount !== 1 ? 's' : ''} in the league`,
      detail:
        teamCount < 6
          ? 'Invite more managers to fill out the league.'
          : 'Your league is ready for competitive play.',
      timestamp: 'League',
      color: '$purple11',
    });

    return items;
  }, [draftStatus, currentMatchup, teamCount]);

  return (
    <Card
      backgroundColor="$surfacePanel"
      borderColor="$surfacePanelBorder"
      borderWidth={1}
      borderRadius="$6"
      padding="$5"
    >
      <XStack alignItems="center" gap="$2" marginBottom="$4">
        <Clock size={18} color="var(--color)" />
        <Text fontSize="$5" fontWeight="700" color="$color">
          League Activity
        </Text>
      </XStack>

      <YStack gap="$1">
        {activities.map((activity, idx) => (
          <React.Fragment key={activity.id}>
            <XStack gap="$3" paddingVertical="$3" alignItems="flex-start">
              <YStack
                width={32}
                height={32}
                borderRadius={16}
                backgroundColor="$surfaceSubtle"
                alignItems="center"
                justifyContent="center"
                flexShrink={0}
                marginTop="$0.5"
              >
                {activity.icon}
              </YStack>
              <YStack flex={1} gap="$1">
                <XStack
                  justifyContent="space-between"
                  alignItems="center"
                  gap="$2"
                >
                  <Text fontSize="$3" fontWeight="600" color="$color" flex={1}>
                    {activity.title}
                  </Text>
                  <Text
                    fontSize="$1"
                    color="$textMuted"
                    flexShrink={0}
                    textTransform="uppercase"
                    letterSpacing={0.5}
                  >
                    {activity.timestamp}
                  </Text>
                </XStack>
                <Text fontSize="$2" color="$textMuted" lineHeight="$3">
                  {activity.detail}
                </Text>
              </YStack>
            </XStack>
            {idx < activities.length - 1 && (
              <Separator borderColor="$outlineSubtle" marginLeft={44} />
            )}
          </React.Fragment>
        ))}
      </YStack>
    </Card>
  );
}
