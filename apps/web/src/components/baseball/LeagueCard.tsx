import React from 'react';
import { Button, H3, HolographicCard, Paragraph, XStack, YStack } from '@legacy-sports/shared-components';

// Helper functions for draft status display
function formatDraftStatus(status?: string | null): string {
  if (!status) return 'Unknown';
  
  switch (status) {
    case 'not-started':
      return 'Not Started';
    case 'queued':
      return 'Queued';
    case 'in-progress':
      return 'In Progress';
    case 'completed':
      return 'Completed';
    default:
      return status.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase());
  }
}

function getDraftStatusColor(status?: string | null): string {
  switch (status) {
    case 'not-started':
      return '$gray11';
    case 'queued':
      return '$orange11';
    case 'in-progress':
      return '$blue11';
    case 'completed':
      return '$green11';
    default:
      return '$gray11';
  }
}

// Types for league data - based on actual GraphQL schema
export interface League {
  id?: number | null;
  name?: string | null;
  owner?: number | null;
  maxRosterSize?: number | null;
  currentMatchup?: number | null;
  draftStatus?: string | null;
}

interface LeagueCardProps {
  league: League;
  onViewLeague?: (leagueId: number) => void;
  animationDelay?: number;
}

export function LeagueCard({ league, onViewLeague, animationDelay = 0 }: LeagueCardProps) {
  const handleViewLeague = () => {
    if (league.id) {
      onViewLeague?.(league.id);
    }
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleViewLeague();
    }
  };

  return (
    <YStack
      minWidth={350}
      maxWidth={420}
      minHeight={260}
      flex={0}
      flexShrink={0}
    >
      <HolographicCard
        variant="aurora"
        intensity="normal"
        enableHover={true}
        className="league-card"
        onPress={handleViewLeague}
        animationDelay={animationDelay}
      >
      <YStack space="$5">
        {/* League Header */}
        <YStack space="$2" marginBottom="$3">
          <H3 
            fontSize="$8"
            fontWeight="800"
            textAlign="center"
            color="$color"
          >
            {league.name || 'Unnamed League'}
          </H3>
          <Paragraph 
            fontSize="$4"
            color="$orange10"
            fontWeight="600"
            textAlign="center"
            opacity={0.9}
          >
            {league.maxRosterSize ? `${league.maxRosterSize} player rosters` : 'Fantasy Baseball League'}
          </Paragraph>
        </YStack>

        {/* Stats Row */}
        <XStack 
          justifyContent="space-between"
          alignItems="center"
          padding="$5"
          borderRadius="$6"
          backgroundColor="rgba(255, 165, 0, 0.05)"
          borderWidth={1}
          borderColor="rgba(255, 165, 0, 0.2)"
        >
          <YStack alignItems="center" flex={1}>
            <Paragraph 
              fontSize="$3"
              color="$orange9"
              fontWeight="600"
              textTransform="uppercase"
              letterSpacing={0.8}
              opacity={0.8}
            >
              Teams
            </Paragraph>
            <Paragraph 
              fontSize="$6"
              color="$color"
              fontWeight="700"
              marginTop="$2"
            >
              12
            </Paragraph>
          </YStack>
          
          <YStack alignItems="center" flex={1}>
            <Paragraph 
              fontSize="$3"
              color="$orange9"
              fontWeight="600"
              textTransform="uppercase"
              letterSpacing={0.8}
              opacity={0.8}
            >
              Week
            </Paragraph>
            <Paragraph 
              fontSize="$6"
              color="$color"
              fontWeight="700"
              marginTop="$2"
            >
              {league.currentMatchup || 1}
            </Paragraph>
          </YStack>
          
          <YStack alignItems="center" flex={1}>
            <Paragraph 
              fontSize="$3"
              color="$orange9"
              fontWeight="600"
              textTransform="uppercase"
              letterSpacing={0.8}
              opacity={0.8}
            >
              Draft
            </Paragraph>
            <Paragraph 
              fontSize="$5"
              color={getDraftStatusColor(league.draftStatus)}
              fontWeight="700"
              marginTop="$2"
              textAlign="center"
            >
              {formatDraftStatus(league.draftStatus)}
            </Paragraph>
          </YStack>
        </XStack>

        {/* Action Button */}
        <Button
          onPress={handleViewLeague}
          width="100%"
          marginTop="$4"
          borderRadius="$6"
          height="$6"
          fontSize="$4"
          fontWeight="700"
          backgroundColor="rgba(59, 130, 246, 0.2)"
          borderColor="rgba(59, 130, 246, 0.4)"
          borderWidth={1}
          color="$blue11"
          accessible
          accessibilityLabel={`View ${league.name || 'Unnamed League'}`}
          accessibilityRole="button"
          hoverStyle={{
            backgroundColor: "rgba(59, 130, 246, 0.3)",
            borderColor: "rgba(59, 130, 246, 0.6)",
            transform: 'scale(1.02)',
          }}
          pressStyle={{
            backgroundColor: "rgba(59, 130, 246, 0.25)",
            transform: 'scale(1.01)',
          }}
          animation="quick"
        >
          <span role="img" aria-label="baseball">⚾</span>
          {' '}View League
        </Button>
      </YStack>
    </HolographicCard>
    </YStack>
  );
}
