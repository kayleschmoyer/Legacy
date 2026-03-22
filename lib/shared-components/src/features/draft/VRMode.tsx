import React from 'react';
import { Button, Text, YStack } from 'tamagui';

interface VRModeProps {
  onClose: () => void;
  sport: string;
}

export const VRMode: React.FC<VRModeProps> = ({ onClose, sport }) => {
  return (
    <YStack padding="$4" backgroundColor="$background" borderRadius="$4">
      <Text fontSize="$6" fontWeight="bold" marginBottom="$2">
        VR Draft Mode
      </Text>
      <Text>Immersive {sport} draft experience...</Text>
      <Button onPress={onClose}>
        <Text>Exit VR</Text>
      </Button>
    </YStack>
  );
};
