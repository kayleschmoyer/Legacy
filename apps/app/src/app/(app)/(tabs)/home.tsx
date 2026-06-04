import { Text, YStack } from 'tamagui';

export default function HomeTab() {
  return (
    <YStack
      flex={1}
      alignItems="center"
      justifyContent="center"
      backgroundColor="$background"
    >
      <Text testID="tab-home-placeholder" fontSize="$6" color="$color">
        Home
      </Text>
    </YStack>
  );
}

export { ScreenErrorBoundary as ErrorBoundary } from '../_screenErrorBoundary';
