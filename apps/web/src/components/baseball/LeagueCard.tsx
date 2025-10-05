import React from 'react';
import { Button, H3, Paragraph, XStack, YStack, HolographicCard } from '@legacy-sports/shared-components';

// Types for league data - based on actual GraphQL schema
export interface League {
  id?: number | null;
  name?: string | null;
  owner?: number | null;
  maxRosterSize?: number | null;
  currentMatchup?: number | null;
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
        padding="$7"
        borderRadius="$8"
        width="100%"
        height="100%"
        cursor="pointer"
        onPress={handleViewLeague}
        role="button"
        tabIndex={0}
        accessible
        accessibilityRole="button"
        accessibilityLabel={`View ${league.name || 'Unnamed League'} details`}
        accessibilityHint="Double-tap to view league details and statistics"
        onKeyDown={handleKeyPress}
        style={{
          animationDelay: `${animationDelay}ms`,
        }}
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
              Format
            </Paragraph>
            <Paragraph 
              fontSize="$6"
              color="$color"
              fontWeight="700"
              marginTop="$2"
            >
              H2H
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
