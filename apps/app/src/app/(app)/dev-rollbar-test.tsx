import React, { useState } from 'react';
import { ScrollView } from 'react-native';
import { Button, H1, Paragraph, Text, YStack } from 'tamagui';
import { LOGGER } from '@legacy-sports/logging';

/**
 * Dev-only smoke harness for Rollbar (LS-4777).
 *
 * Renders nothing outside development builds — Expo strips `__DEV__` branches
 * from production bundles, so this route is effectively a 404 in release.
 *
 * To verify: navigate to `/dev-rollbar-test` in a dev build, tap the buttons,
 * then check the Rollbar dashboard for the corresponding items. See
 * `lib/rollbar/README.md` for end-to-end verification steps.
 */
export default function DevRollbarTestScreen(): React.JSX.Element | null {
  const [lastAction, setLastAction] = useState<string>('');

  if (!__DEV__) {
    return null;
  }

  const fireLoggerError = () => {
    LOGGER.error(
      'LS-4777 Rollbar smoke test (LOGGER.error)',
      new Error('LS-4777 LOGGER.error smoke test'),
      { context: 'dev-rollbar-test', source: 'manual' },
    );
    setLastAction('LOGGER.error fired');
  };

  const throwUncaught = () => {
    setLastAction('Throwing uncaught error — should hit ErrorBoundary');
    setTimeout(() => {
      throw new Error('LS-4777 uncaught render error smoke test');
    }, 0);
  };

  return (
    <ScrollView>
      <YStack
        padding="$5"
        gap="$4"
        backgroundColor="$background"
        minHeight="100%"
      >
        <H1>Rollbar smoke test</H1>
        <Paragraph>
          Dev-only harness for LS-4777. Each button exercises a different path
          into Rollbar. Confirm items land in the Rollbar dashboard.
        </Paragraph>

        <Button onPress={fireLoggerError} testID="rollbar-test-logger-error">
          Fire LOGGER.error → Rollbar
        </Button>

        <Button onPress={throwUncaught} testID="rollbar-test-throw">
          Throw uncaught (hits ErrorBoundary)
        </Button>

        {lastAction ? (
          <Text testID="rollbar-test-last-action">
            Last action: {lastAction}
          </Text>
        ) : null}
      </YStack>
    </ScrollView>
  );
}
