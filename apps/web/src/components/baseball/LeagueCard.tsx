import React from 'react';
import {
  Button,
  formatDraftStatusForCard,
  getDraftNextActionCopy,
  getDraftStatusColors,
  getDraftStatusDescription,
  H3,
  HolographicCard,
  Paragraph,
  XStack,
  YStack,
} from '@legacy-sports/shared-components';
import { Text } from 'tamagui';

export interface League {
  id?: number | null;
  name?: string | null;
  owner?: number | null;
  maxRosterSize?: number | null;
  currentMatchup?: number | null;
  currentWeekNumber?: number | null;
  draftStatus?: string | null;
  weekAdvanceStatus?: string | null;
}

interface LeagueCardProps {
  league: League;
  onViewLeague?: (leagueId: number) => void;
  animationDelay?: number;
}

export function LeagueCard({
  league,
  onViewLeague,
  animationDelay = 0,
}: LeagueCardProps) {
  const handleViewLeague = () => {
    if (league.id) {
      onViewLeague?.(league.id);
    }
  };

  const statusColors = getDraftStatusColors(league.draftStatus);
  const statusDescription = getDraftStatusDescription(league.draftStatus);
  const nextActionCopy = getDraftNextActionCopy(league.draftStatus);

  const summaryParts = [
    league.maxRosterSize ? `${league.maxRosterSize}-slot rosters` : undefined,
    league.currentWeekNumber ? `Week ${league.currentWeekNumber}` : undefined,
  ].filter(Boolean);

  const summary = summaryParts.join(' • ');

  const metrics = [
    {
      label: 'Matchup',
      value: league.currentWeekNumber
        ? `Week ${league.currentWeekNumber}`
        : 'Preseason Slate',
      accentColor: '$blue11',
    },
    {
      label: 'Roster Limit',
      value: league.maxRosterSize
        ? `${league.maxRosterSize} slots`
        : 'Flexible Rosters',
      accentColor: '$orange11',
    },
    {
      label: 'Draft Status',
      value: formatDraftStatusForCard(league.draftStatus),
      accentColor: statusColors.text,
    },
  ];

  return (
    <YStack minWidth={320} maxWidth={440} flexShrink={0}>
      <HolographicCard
        variant="aurora"
        intensity="normal"
        enableHover
        className="league-card"
        onPress={handleViewLeague}
        animationDelay={animationDelay}
      >
        <YStack space="$5" padding="$5">
          <YStack space="$3">
            <XStack
              justifyContent="space-between"
              alignItems="flex-start"
              gap="$4"
            >
              <YStack space="$2" flex={1}>
                <H3 fontSize="$7" fontWeight="800" color="$color">
                  {league.name || 'Unnamed League'}
                </H3>
                {summary ? (
                  <Paragraph fontSize="$4" color="rgba(203, 213, 225, 0.92)">
                    {summary}
                  </Paragraph>
                ) : (
                  <Paragraph fontSize="$4" color="rgba(203, 213, 225, 0.92)">
                    Seasonal dashboard for draft prep, matchups, and standings.
                  </Paragraph>
                )}
              </YStack>
              <YStack alignItems="flex-end">
                <XStack
                  backgroundColor={statusColors.bg}
                  borderColor={statusColors.border}
                  borderWidth={1}
                  borderRadius="$5"
                  paddingHorizontal="$3"
                  paddingVertical="$1"
                >
                  <Text
                    fontSize={12}
                    fontWeight="700"
                    color={statusColors.text}
                    textTransform="uppercase"
                  >
                    {formatDraftStatusForCard(league.draftStatus)}
                  </Text>
                </XStack>
              </YStack>
            </XStack>

            <Paragraph fontSize="$3" color="rgba(148, 163, 184, 0.95)">
              {statusDescription}
            </Paragraph>
          </YStack>

          <XStack gap="$3" flexWrap="wrap">
            {metrics.map((metric) => (
              <YStack
                key={metric.label}
                backgroundColor="rgba(15, 23, 42, 0.55)"
                borderColor="rgba(148, 163, 184, 0.2)"
                borderWidth={1}
                borderRadius="$6"
                paddingHorizontal="$4"
                paddingVertical="$3"
                flexGrow={1}
                minWidth={140}
              >
                <Paragraph
                  fontSize="$2"
                  textTransform="uppercase"
                  letterSpacing={0.6}
                  color="rgba(148, 163, 184, 0.8)"
                >
                  {metric.label}
                </Paragraph>
                <Paragraph
                  fontSize="$5"
                  fontWeight="700"
                  color={metric.accentColor}
                  marginTop="$1"
                >
                  {metric.value}
                </Paragraph>
              </YStack>
            ))}
          </XStack>

          <XStack
            justifyContent="space-between"
            alignItems="center"
            gap="$3"
            flexWrap="wrap"
          >
            <Paragraph
              fontSize="$3"
              color="rgba(148, 163, 184, 0.95)"
              flexShrink={1}
              maxWidth={300}
            >
              {nextActionCopy}
            </Paragraph>

            <Button
              onPress={handleViewLeague}
              size="$4"
              borderRadius="$6"
              paddingHorizontal="$5"
              backgroundColor="rgba(37, 99, 235, 0.16)"
              borderColor="rgba(59, 130, 246, 0.45)"
              borderWidth={1}
              color="$blue11"
              accessible
              accessibilityLabel={`View ${league.name || 'Unnamed League'}`}
              accessibilityRole="button"
              hoverStyle={{
                backgroundColor: 'rgba(37, 99, 235, 0.22)',
                borderColor: 'rgba(59, 130, 246, 0.6)',
                transform: 'translateY(-2px)',
              }}
              pressStyle={{
                backgroundColor: 'rgba(37, 99, 235, 0.2)',
                transform: 'scale(0.99)',
              }}
              animation="quick"
            >
              <Text fontWeight="700" color="$blue11">
                View League
              </Text>
            </Button>
          </XStack>
        </YStack>
      </HolographicCard>
    </YStack>
  );
}
