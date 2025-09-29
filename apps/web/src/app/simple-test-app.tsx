import React from 'react';
import { H2, YStack } from '@legacy-sports/shared-components';
import { WebHomeScreen } from '../components/WebHomeScreen';

export function SimpleTestApp() {
  return (
    <YStack padding="$6" space="$4" backgroundColor="$background">
      <H2 color="$color">Testing WebHomeScreen:</H2>
      <WebHomeScreen />
    </YStack>
  );
}

export default SimpleTestApp;
