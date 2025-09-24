// Web-specific error handling utilities
import { OAuthError } from '../types/auth';

export const handleOAuthError = (error: OAuthError): void => {
  // On web, we typically don't show alerts - let the parent component handle it
  // or rely on UI error states
  console.error('OAuth Error:', error);
};

export const getInteractiveButtonProps = (isDisabled: boolean) => ({
  cursor: isDisabled ? 'not-allowed' : 'pointer',
  userSelect: 'none' as const,
});

export const createAuthHandlers = () => {
  // Web-specific auth handler configurations can be added here
  return {
    platformSpecific: 'web',
  };
};
