import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Paragraph, YStack } from '@legacy-sports/shared-components/ui';
import { Spinner } from 'tamagui';
import { AuthService, useAuth } from '@legacy-sports/shared-components/auth';
import { LOGGER } from '@legacy-sports/logging';
import { BRAND_GOLD_LIGHT } from '../../constants/colors';

/**
 * Handles the Discord OAuth callback for authenticated users linking their
 * Discord account from profile settings.
 *
 * Flow:
 * 1. User clicks "Connect Discord" in profile settings -> browser navigates to
 *    `/oauth/discord/authorize` on the backend, which sets an HttpOnly state
 *    cookie and 302s to Discord.
 * 2. Discord redirects here with ?code=...&state=<nonce>
 * 3. This page forwards code+state to the backend; the backend verifies
 *    state against the cookie (single-use), then links the account.
 * 4. On success: redirects to /profile/settings
 * 5. On error: shows error with a link back to profile settings, an actionable
 *    next step for the already-linked case, and a "Contact support" affordance
 *    so the user never hits a dead end (LS-6659).
 */

/** Address used for the "Contact support" affordance on the error state. */
const SUPPORT_EMAIL = 'support@legacysports.com';

/**
 * The oauth-proxy Discord handler returns this intentionally-vague 409 when the
 * Discord account is already linked to a *different* Legacy Sports user. The
 * message is kept generic on the server to prevent account enumeration
 * (LS-2549), so we cannot make the server message more specific. Instead we
 * detect it here and surface an actionable next step (LS-6659).
 */
const DISCORD_ALREADY_LINKED_MESSAGE = 'Could not link Discord account';

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

    if (!code || !state) {
      setErrorMessage(
        'Discord authorization failed: the security check did not pass. Please try again from your profile settings.',
      );
      return;
    }

    const linkAccount = async () => {
      try {
        await authService.linkDiscordAccount(code, state);
        LOGGER.info('Discord account linked successfully');
        navigate('/profile/settings?discord_linked=1', { replace: true });
      } catch (err) {
        LOGGER.error(
          'Discord link failed',
          err instanceof Error ? err : new Error(String(err)),
        );
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
    const isAlreadyLinkedConflict =
      errorMessage === DISCORD_ALREADY_LINKED_MESSAGE;
    const displayMessage = isAlreadyLinkedConflict
      ? 'This Discord account can’t be linked to your profile.'
      : errorMessage;

    return (
      <YStack
        flex={1}
        alignItems="center"
        justifyContent="center"
        gap="$4"
        padding="$6"
      >
        <Paragraph size="$5" color="$brandSeamRed" textAlign="center">
          {displayMessage}
        </Paragraph>
        {isAlreadyLinkedConflict ? (
          <Paragraph size="$4" color="$colorPress" textAlign="center">
            It may already be connected to another Legacy Sports account. Try
            signing in with that Discord account in a fresh browser session, or
            contact support below.
          </Paragraph>
        ) : null}
        <Paragraph
          size="$4"
          color="$brandGoldLight"
          style={{ cursor: 'pointer', textDecorationLine: 'underline' }}
          onPress={() => navigate('/profile/settings')}
        >
          Back to Profile Settings
        </Paragraph>
        <a
          href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
            'Discord account linking issue',
          )}`}
          style={{
            color: BRAND_GOLD_LIGHT,
            fontSize: 15,
            textDecorationLine: 'underline',
          }}
        >
          Need help? Contact support
        </a>
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
