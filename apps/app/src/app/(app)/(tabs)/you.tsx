import { Text, YStack } from 'tamagui';

export default function YouTab() {
  return (
    <YStack
      flex={1}
      alignItems="center"
      justifyContent="center"
      backgroundColor="$background"
    >
      <Text testID="tab-you-placeholder" fontSize="$6" color="$color">
        You
      </Text>
    </YStack>
  );
}

export { ScreenErrorBoundary as ErrorBoundary } from '../_screenErrorBoundary';
