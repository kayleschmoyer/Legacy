/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-misused-promises */
import React from 'react';
import { Card, H5, Label, Separator, Switch, Text, XStack, YStack } from 'tamagui';
import { Settings } from '@tamagui/lucide-icons';
import { type NotificationPreference } from '../../../api/db/graphql.generated';

export interface NotificationSettingsProps {
  preferences: NotificationPreference;
  onUpdate: (preferences: Partial<NotificationPreference>) => Promise<void>;
  loading?: boolean;
}

/**
 * NotificationSettings - Component for managing notification preferences
 * Allows users to enable/disable different notification types and channels
 * 
 * Note: GraphQL fragments are type-safe but ESLint detects them as error types
 * in some contexts. Suppressing with eslint-disable where appropriate.
 */
export function NotificationSettings({
  preferences,
  onUpdate,
  loading = false,
}: NotificationSettingsProps) {
  const handleToggle = async (key: keyof NotificationPreference, value: boolean) => {
    await onUpdate({ [key]: value });
  };

  return (
    <Card elevate size="$4" bordered animation="bouncy">
      <Card.Header padded>
        <XStack space="$2" alignItems="center">
          <Settings size="$1" />
          <H5>Notification Preferences</H5>
        </XStack>
      </Card.Header>

      <YStack padding="$3" space="$3">
        {/* Notification Types */}
        <YStack space="$2">
          <Text fontSize="$3" fontWeight="600" color="$gray11">
            Notification Types
          </Text>
          
          <XStack justifyContent="space-between" alignItems="center" paddingVertical="$2">
            <Label htmlFor="matchup-started" flex={1}>
              <Text>Matchup Started</Text>
              <Text fontSize="$2" color="$gray11">
                Get notified when your matchup begins
              </Text>
            </Label>
            <Switch
              id="matchup-started"
              checked={preferences.matchupStartedEnabled ?? false}
              onCheckedChange={(checked) => handleToggle('matchupStartedEnabled', checked)}
              disabled={loading}
            />
          </XStack>

          <XStack justifyContent="space-between" alignItems="center" paddingVertical="$2">
            <Label htmlFor="matchup-ended" flex={1}>
              <Text>Matchup Completed</Text>
              <Text fontSize="$2" color="$gray11">
                Get results when your matchup ends
              </Text>
            </Label>
            <Switch
              id="matchup-ended"
              checked={preferences.matchupEndedEnabled ?? false}
              onCheckedChange={(checked) => handleToggle('matchupEndedEnabled', checked)}
              disabled={loading}
            />
          </XStack>

          <XStack justifyContent="space-between" alignItems="center" paddingVertical="$2">
            <Label htmlFor="close-game" flex={1}>
              <Text>Close Game Alerts</Text>
              <Text fontSize="$2" color="$gray11">
                Get notified when matchup is close
              </Text>
            </Label>
            <Switch
              id="close-game"
              checked={preferences.matchupCloseGameEnabled ?? false}
              onCheckedChange={(checked) => handleToggle('matchupCloseGameEnabled', checked)}
              disabled={loading}
            />
          </XStack>

          <XStack justifyContent="space-between" alignItems="center" paddingVertical="$2">
            <Label htmlFor="reminders" flex={1}>
              <Text>Matchup Reminders</Text>
              <Text fontSize="$2" color="$gray11">
                Reminder notifications before matchups
              </Text>
            </Label>
            <Switch
              id="reminders"
              checked={preferences.matchupReminderEnabled ?? false}
              onCheckedChange={(checked) => handleToggle('matchupReminderEnabled', checked)}
              disabled={loading}
            />
          </XStack>
        </YStack>

        <Separator />

        {/* Notification Channels */}
        <YStack space="$2">
          <Text fontSize="$3" fontWeight="600" color="$gray11">
            Notification Channels
          </Text>

          <XStack justifyContent="space-between" alignItems="center" paddingVertical="$2">
            <Label htmlFor="push-enabled" flex={1}>
              <Text>Push Notifications</Text>
              <Text fontSize="$2" color="$gray11">
                Receive push notifications on your device
              </Text>
            </Label>
            <Switch
              id="push-enabled"
              checked={preferences.pushEnabled ?? false}
              onCheckedChange={(checked) => handleToggle('pushEnabled', checked)}
              disabled={loading}
            />
          </XStack>

          <XStack justifyContent="space-between" alignItems="center" paddingVertical="$2">
            <Label htmlFor="email-enabled" flex={1}>
              <Text>Email Notifications</Text>
              <Text fontSize="$2" color="$gray11">
                Receive email notifications (coming soon)
              </Text>
            </Label>
            <Switch
              id="email-enabled"
              checked={preferences.emailEnabled ?? false}
              onCheckedChange={(checked) => handleToggle('emailEnabled', checked)}
              disabled={true} // Keep disabled for now
            />
          </XStack>
        </YStack>

        {loading && (
          <Text fontSize="$2" color="$blue10" textAlign="center">
            Saving preferences...
          </Text>
        )}
      </YStack>
    </Card>
  );
}
