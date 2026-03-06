// Mobile-specific error handling utilities
import { Alert } from 'react-native';
import { OAuthError } from '../types/auth';

export const handleOAuthError = (error: OAuthError): void => {
  // On mobile, show native alert
  Alert.alert('Sign In Failed', error.message, [{ text: 'OK' }]);
};

export const getInteractiveButtonProps = (_isDisabled: boolean) => ({
  // Mobile buttons don't need cursor styles
});

export const createAuthHandlers = () => {
  // Mobile-specific auth handler configurations can be added here
  return {
    platformSpecific: 'mobile',
  };
};
