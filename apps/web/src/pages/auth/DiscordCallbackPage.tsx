import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Paragraph, YStack } from '@legacy-sports/shared-components/ui';
import { Spinner } from 'tamagui';
import { AuthService, useAuth } from '@legacy-sports/shared-components/auth';
import { LOGGER } from '@legacy-sports/logging';

const DISCORD_OAUTH_STATE_STORAGE_KEY = 'discord_oauth_link_state';

/**
 * Handles the Discord OAuth callback for authenticated users linking their
 * Discord account from profile settings.
 *
 * Flow:
 * 1. User clicks "Connect Discord" in profile settings (random state nonce stored in sessionStorage)
 * 2. Discord redirects here with ?code=...&state=<nonce>
 * 3. This page validates the state nonce, then delegates to AuthService.linkDiscordAccount
 * 4. On success: redirects to /profile/settings
 * 5. On error: shows error with a link back to profile settings
 */
export function DiscordCallbackPage(): React.JSX.Element {
  const { config } = useAuth();
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState('');

  const authService = useMemo(() => new AuthService(config), [config]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const error = params.get('error');

    if (error) {
      setErrorMessage('Discord authorization was cancelled or denied.');
      return;
    }

    // Validate state nonce to prevent link-CSRF attacks
    let storedState: string | null = null;
    try {
      if (typeof sessionStorage !== 'undefined') {
        storedState = sessionStorage.getItem(DISCORD_OAUTH_STATE_STORAGE_KEY);
        sessionStorage.removeItem(DISCORD_OAUTH_STATE_STORAGE_KEY);
      }
    } catch {
      // sessionStorage unavailable
    }

    if (!code || !state || state !== storedState) {
      setErrorMessage(
        'Discord authorization failed: the security check did not pass. Please try again from your profile settings.',
      );
      return;
    }

    const linkAccount = async () => {
      try {
        await authService.linkDiscordAccount(code);
        LOGGER.info('Discord account linked successfully');
        navigate('/profile/settings', { replace: true });
      } catch (err) {
        LOGGER.error('Discord link failed:', String(err));
        setErrorMessage(
          err instanceof Error
            ? err.message
            : 'Failed to link Discord account. Please try again.',
        );
      }
    };

    void linkAccount();
  }, [authService, navigate]);

  if (errorMessage) {
    return (
      <YStack
        flex={1}
        alignItems="center"
        justifyContent="center"
        gap="$4"
        padding="$6"
      >
        <Paragraph size="$5" color="$brandSeamRed" textAlign="center">
          {errorMessage}
        </Paragraph>
        <Paragraph
          size="$4"
          color="$brandGoldLight"
          style={{ cursor: 'pointer', textDecorationLine: 'underline' }}
          onPress={() => navigate('/profile/settings')}
        >
          Back to Profile Settings
        </Paragraph>
      </YStack>
    );
  }

  return (
    <YStack flex={1} alignItems="center" justifyContent="center" gap="$4">
      <Spinner size="large" />
      <Paragraph size="$4" color="$colorPress">
        Linking your Discord account…
      </Paragraph>
    </YStack>
  );
}

export default DiscordCallbackPage;
