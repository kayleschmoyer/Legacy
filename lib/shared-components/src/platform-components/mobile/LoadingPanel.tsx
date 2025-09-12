import React from 'react';
import { Spinner } from 'tamagui';

export interface Props {
  loading?: boolean;
  message?: string;
}

export const LoadingPanel: React.FC<Props> = () => {
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
};
