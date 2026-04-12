import React from 'react';
import { Spinner } from 'tamagui';
import { PlatformUtils } from './platform-components/wrappers/PlatformUtils';

export interface Props {
  loading?: boolean;
  message?: string;
}

// For React Native
const RNLoadingPanel = () => {
  try {
    return <Spinner />;
  } catch {
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

// For Web
const WebLoadingPanel = () => {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: 'var(--background, #0A0F1A)',
      }}
    >
      <div
        style={{
          border: '4px solid var(--borderColor, #2F3B53)',
          borderTop: '4px solid var(--blue9, #3B82F6)',
          borderRadius: '50%',
          width: '40px',
          height: '40px',
          animation: 'spin 1s linear infinite',
        }}
      />
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export const LoadingPanel: React.FC<Props> = () => {
  if (PlatformUtils.isWeb) {
    return <WebLoadingPanel />;
  }
  return <RNLoadingPanel />;
};
