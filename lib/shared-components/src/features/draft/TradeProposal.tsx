import React from 'react';
import { Button, Text, YStack } from 'tamagui';

interface TradeProposalProps {
  onClose: () => void;
  leagueId: string;
  teamId: string;
}

export const TradeProposal: React.FC<TradeProposalProps> = ({ onClose, leagueId, teamId }) => {
  return (
    <YStack padding="$4" backgroundColor="$background" borderRadius="$4">
      <Text fontSize="$6" fontWeight="bold" marginBottom="$2">Trade Proposal</Text>
      <Text>Trade interface here...</Text>
      <Button onPress={onClose}>Close</Button>
    </YStack>
  );
};
