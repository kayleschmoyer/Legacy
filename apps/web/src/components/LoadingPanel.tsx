import React from 'react';
import { YStack } from '@legacy-sports/shared-components';
import { styled } from 'tamagui';
import { BRAND_NAVY_LIGHT } from '../constants/colors';

const SpinnerContainer = styled(YStack, {
  justifyContent: 'center',
  alignItems: 'center',
  height: '100vh',
  backgroundColor: '$background',
});

const Spinner = styled(YStack, {
  width: 40,
  height: 40,
  borderRadius: 50,
  borderWidth: 4,
  borderColor: '$borderColor',
  borderTopColor: BRAND_NAVY_LIGHT,
  animation: 'spin 1s linear infinite',
});

export function LoadingPanel(): React.JSX.Element {
  console.log('LoadingPanel - Rendering loading panel');

  return (
    <SpinnerContainer>
      <YStack alignItems="center" gap="$4">
        <Spinner />
        <div
          style={{
            color: 'white',
            fontSize: '18px',
            fontFamily: 'Inter, sans-serif',
          }}
        >
          Loading Legacy Sports...
        </div>
      </YStack>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </SpinnerContainer>
  );
}
