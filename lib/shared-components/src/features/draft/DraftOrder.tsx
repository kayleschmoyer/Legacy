import React from 'react';
import { ScrollView, Text, YStack } from 'tamagui';

interface Team {
  id: string;
  name: string;
}

interface DraftOrderProps {
  order: Team[];
  currentPick: number;
}

export const DraftOrder: React.FC<DraftOrderProps> = ({
  order,
  currentPick,
}) => {
  return (
    <YStack flex={1}>
      <Text fontSize="$6" fontWeight="bold" marginBottom="$2">
        Draft Order
      </Text>
      <ScrollView>
        {order.map((team, index) => (
          <YStack
            key={team.id}
            padding="$2"
            backgroundColor={
              index === currentPick - 1 ? '$accentBackground' : '$background'
            }
          >
            <Text>
              {index + 1}. {team.name}
            </Text>
          </YStack>
        ))}
      </ScrollView>
    </YStack>
  );
};
