import React from 'react';
import {
  Button,
  Paragraph,
  useAuth,
  type UseAuthResult,
  YStack,
} from '@legacy-sports/shared-components';
import { useLocation, useNavigate } from 'react-router-dom';
import { Text } from 'tamagui';
import { LOGGER } from '@legacy-sports/logging';

export function AuthDebugger() {
  const auth: UseAuthResult = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  LOGGER.info('Auth Debug - Current state:', {
    isAuthenticated: auth.isAuthenticated,
    isLoading: auth.isLoading,
    user: auth.user,
    location: location.pathname,
    hash: window.location.hash,
    fullUrl: window.location.href,
  });

  return (
    <YStack
      padding="$4"
      gap="$4"
      backgroundColor="$background"
      minHeight="100vh"
    >
      <Paragraph color="$color" size="$6" fontWeight="bold">
        <span role="img" aria-label="bug">
          🐛
        </span>{' '}
        Authentication Debug Info
      </Paragraph>

      <YStack gap="$2">
        <Paragraph color="$color">
          <strong>Current Path:</strong> {location.pathname}
        </Paragraph>
        <Paragraph color="$color">
          <strong>Full URL:</strong> {window.location.href}
        </Paragraph>
        <Paragraph color="$color">
          <strong>Hash:</strong> {window.location.hash}
        </Paragraph>
        <Paragraph color="$color">
          <strong>Is Loading:</strong> {String(auth.isLoading)}
        </Paragraph>
        <Paragraph color="$color">
          <strong>Is Authenticated:</strong> {String(auth.isAuthenticated)}
        </Paragraph>
        <Paragraph color="$color">
          <strong>User:</strong>{' '}
          {auth.user ? JSON.stringify(auth.user, null, 2) : 'null'}
        </Paragraph>
      </YStack>

      <Button onPress={() => navigate('/login')}>
        <Text>Go to Login (React Router)</Text>
      </Button>

      <Button onPress={() => (window.location.hash = '#/login')}>
        <Text>Go to Login (Hash)</Text>
      </Button>
    </YStack>
  );
}
