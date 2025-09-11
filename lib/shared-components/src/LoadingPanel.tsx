import React from 'react';
import { PlatformUtils } from './platform-components/wrappers/PlatformUtils';
import { Spinner } from 'tamagui';

// For React Native
const RNLoadingPanel = () => {
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

// For Web
const WebLoadingPanel = () => {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: 'var(--bg-primary, #1E1E1E)',
      }}
    >
      <div
        style={{
          border: '4px solid #f3f3f3',
          borderTop: '4px solid var(--color-primary-500, #3366FF)',
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

export function LoadingPanel(): JSX.Element {
  if (PlatformUtils.isWeb) {
    return <WebLoadingPanel />;
  }
  return <RNLoadingPanel />;
}
