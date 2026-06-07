import React from 'react';
import { H3, Paragraph, Text, XStack, YStack } from 'tamagui';
import { Button } from '../Button';
import {
  formatDraftStatusForCard,
  getDraftNextActionCopy,
  getDraftStatusColors,
  getDraftStatusDescription,
} from '../utils/draftStatus';
import {
  BLUE,
  BLUE_DEEP,
  SLATE_400,
  SURFACE_CARD,
  SURFACE_SUBTLE,
  WHITE,
  withAlpha,
} from '../utils/colors';

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

export interface LeagueCardProps {
  league: League;
  onViewLeague?: (leagueId: number) => void;
  /** Stagger delay (ms) for list entrance animations. */
  animationDelay?: number;
}

export function LeagueCard({
  league,
  onViewLeague,
  animationDelay = 0,
}: LeagueCardProps): React.JSX.Element {
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
      <YStack
        accessibilityRole="button"
        accessibilityLabel={`View ${league.name || 'Unnamed League'}`}
        tabIndex={0}
        onPress={handleViewLeague}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleViewLeague();
          }
        }}
        cursor="pointer"
        backgroundColor={SURFACE_CARD}
        borderWidth={1}
        borderColor={withAlpha(WHITE, 0.08)}
        borderRadius={16}
        overflow="hidden"
        animation="quick"
        hoverStyle={{ borderColor: withAlpha(WHITE, 0.16) }}
        pressStyle={{ scale: 0.99 }}
        style={{ animationDelay: `${animationDelay}ms` } as never}
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
                  <Paragraph fontSize="$4" color="$glassTextSubdued">
                    {summary}
                  </Paragraph>
                ) : (
                  <Paragraph fontSize="$4" color="$glassTextSubdued">
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

            <Paragraph fontSize="$3" color="$glassTextMuted">
              {statusDescription}
            </Paragraph>
          </YStack>

          <XStack gap="$3" flexWrap="wrap">
            {metrics.map((metric) => (
              <YStack
                key={metric.label}
                backgroundColor={withAlpha(SURFACE_SUBTLE, 0.55)}
                borderColor={withAlpha(SLATE_400, 0.2)}
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
                  color="$glassTextMuted"
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
              color="$glassTextMuted"
              flexShrink={1}
              maxWidth={300}
            >
              {nextActionCopy}
            </Paragraph>

            <Button
              size="$4"
              borderRadius="$6"
              paddingHorizontal="$5"
              backgroundColor={withAlpha(BLUE_DEEP, 0.16)}
              borderColor={withAlpha(BLUE, 0.45)}
              borderWidth={1}
              color="$blue11"
              hoverStyle={{
                backgroundColor: withAlpha(BLUE_DEEP, 0.22),
                borderColor: withAlpha(BLUE, 0.6),
                y: -2,
              }}
              pressStyle={{
                backgroundColor: withAlpha(BLUE_DEEP, 0.2),
                scale: 0.99,
              }}
              animation="quick"
            >
              <Text fontWeight="700" color="$blue11">
                View League
              </Text>
            </Button>
          </XStack>
        </YStack>
      </YStack>
    </YStack>
  );
}
