import React from 'react';
import { Spinner } from 'tamagui';

export function LoadingPanel(): JSX.Element {
  try {
    return <Spinner />;
  } catch (error) {
    // Fallback if Tamagui is not available
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '20px',
        }}
      >
        <div>Loading...</div>
      </div>
    );
  }
}
