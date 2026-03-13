import React, { useState } from 'react';
import {
  Button,
  Card,
  Dialog,
  H4,
  Input,
  Separator,
  Text,
  XStack,
  YStack,
} from 'tamagui';

export interface GameSelectionControlProps {
  leagueId: number;
  matchupId: number;
  gamesPerMatchup: number;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

/**
 * GameSelectionControl - Commissioner control for triggering game selection
 * Includes game number input, confirmation dialog, and progress indicator
 *
 * NOTE: Requires triggerGameSelection mutation to be implemented in GraphQL API
 */
export function GameSelectionControl({
  leagueId: _leagueId,
  matchupId,
  gamesPerMatchup,
  onSuccess,
  onError,
}: GameSelectionControlProps) {
  const [gameNumber, setGameNumber] = useState<string>('1');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTriggerSelection = async () => {
    const gameNum = parseInt(gameNumber, 10);

    if (isNaN(gameNum) || gameNum < 1 || gameNum > gamesPerMatchup) {
      setError(`Game number must be between 1 and ${gamesPerMatchup}`);
      onError?.(
        new Error(`Game number must be between 1 and ${gamesPerMatchup}`),
      );
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // const result = await triggerGameSelection({
      //   variables: { leagueId, matchupId, gameNumber: gameNum },
      // });

      // Placeholder for now
      await new Promise((resolve) => setTimeout(resolve, 1000));

      setShowConfirmDialog(false);
      setLoading(false);
      onSuccess?.();
    } catch (err) {
      setError((err as Error).message);
      onError?.(err as Error);
      setShowConfirmDialog(false);
      setLoading(false);
    }
  };

  return (
    <Card bordered padding="$4" backgroundColor="$blue2">
      <YStack space="$3">
        <XStack alignItems="center" space="$2">
          <H4>Game Selection</H4>
          <Text fontSize="$2" color="$blue10">
            (Commissioner Only)
          </Text>
        </XStack>

        <Separator />

        <YStack space="$2">
          <Text fontSize="$3" color="$gray11">
            Select which game number to trigger selection for (1-
            {gamesPerMatchup}):
          </Text>

          <XStack space="$2" alignItems="center" flexWrap="wrap">
            <Input
              placeholder="Game number"
              value={gameNumber}
              onChangeText={setGameNumber}
              width={120}
              size="$4"
              inputMode="numeric"
            />

            <Button
              theme="blue"
              onPress={() => setShowConfirmDialog(true)}
              disabled={loading}
            >
              {loading ? 'Selecting...' : 'Trigger Selection'}
            </Button>
          </XStack>

          {error && (
            <Text fontSize="$3" color="$red10">
              Error: {error}
            </Text>
          )}

          <Text fontSize="$2" color="$gray10">
            This will automatically select games for all teams in the matchup.
          </Text>
        </YStack>

        {/* Confirmation Dialog */}
        <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
          <Dialog.Portal>
            <Dialog.Overlay
              key="overlay"
              animation="quick"
              opacity={0.5}
              enterStyle={{ opacity: 0 }}
              exitStyle={{ opacity: 0 }}
            />
            <Dialog.Content
              bordered
              elevate
              key="content"
              animation={[
                'quick',
                {
                  opacity: {
                    overshootClamping: true,
                  },
                },
              ]}
              enterStyle={{ x: 0, y: -20, opacity: 0, scale: 0.9 }}
              exitStyle={{ x: 0, y: 10, opacity: 0, scale: 0.95 }}
              gap="$3"
              maxWidth={500}
            >
              <Dialog.Title>Confirm Game Selection</Dialog.Title>
              <Dialog.Description>
                Are you sure you want to trigger game selection #{gameNumber}?
                <Text display="block" marginTop="$2" fontWeight="bold">
                  This will select games for all teams in matchup {matchupId}.
                </Text>
              </Dialog.Description>

              <XStack gap="$3" justifyContent="flex-end">
                <Dialog.Close asChild>
                  <Button theme="alt2">Cancel</Button>
                </Dialog.Close>
                <Button
                  theme="blue"
                  onPress={handleTriggerSelection}
                  disabled={loading}
                >
                  {loading ? 'Selecting...' : 'Confirm'}
                </Button>
              </XStack>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog>
      </YStack>
    </Card>
  );
}
