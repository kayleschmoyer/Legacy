import { Text, YStack } from 'tamagui';

export default function LeaguesTab() {
  return (
    <YStack
      flex={1}
      alignItems="center"
      justifyContent="center"
      backgroundColor="$background"
    >
      <Text testID="tab-leagues-placeholder" fontSize="$6" color="$color">
        Leagues
      </Text>
    </YStack>
  );
}

export { ScreenErrorBoundary as ErrorBoundary } from '../_screenErrorBoundary';
