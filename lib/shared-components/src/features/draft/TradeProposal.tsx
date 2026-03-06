import React from 'react';
import { Button, Text, YStack } from 'tamagui';

interface TradeProposalProps {
  onClose: () => void;
  leagueId: string;
  teamId: string;
}

export const TradeProposal: React.FC<TradeProposalProps> = ({
  onClose,
  leagueId: _leagueId,
  teamId: _teamId,
}) => {
  return (
    <YStack padding="$4" backgroundColor="$background" borderRadius="$4">
      <Text fontSize="$6" fontWeight="bold" marginBottom="$2">
        Trade Proposal
      </Text>
      <Text>Trade interface here...</Text>
      <Button onPress={onClose}>
        <Text>Close</Text>
      </Button>
    </YStack>
  );
};
