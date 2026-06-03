import React from 'react';
import { useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { MinigamesHub } from '@legacy-sports/shared-components';

export default function MinigamesHubScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();

  return (
    <MinigamesHub
      isNarrow={width <= 720}
      onNavigate={(id) => {
        if (id === 'season-draft') {
          router.push('/season-draft');
        } else if (id === 'disclosure') {
          router.push('/disclosure-game');
        }
      }}
    />
  );
}

export { ScreenErrorBoundary as ErrorBoundary } from '../_screenErrorBoundary';
