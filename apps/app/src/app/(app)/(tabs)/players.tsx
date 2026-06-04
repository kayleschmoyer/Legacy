import { Text, YStack } from 'tamagui';

export default function PlayersTab() {
  return (
    <YStack
      flex={1}
      alignItems="center"
      justifyContent="center"
      backgroundColor="$background"
    >
      <Text testID="tab-players-placeholder" fontSize="$6" color="$color">
        Players
      </Text>
    </YStack>
  );
}

export { ScreenErrorBoundary as ErrorBoundary } from '../_screenErrorBoundary';
