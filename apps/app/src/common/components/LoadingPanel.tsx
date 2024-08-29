import { Spinner, YStack } from 'tamagui';

export function LoadingPanel(): JSX.Element {
  return (
    <YStack padding="$3" space="$4" alignItems="center">
      <Spinner size="large" color="$orange10" />
    </YStack>
  );
}
