import React, { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  Input,
  Separator,
  Spinner,
  Switch,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { LOGGER } from '@legacy-sports/logging';
import {
  useGetLeagueDuesSettingsQuery,
  useUpdateDuesSettingsMutation,
} from '../../api/db/graphql.generated';

export interface LeagueDuesSetupProps {
  leagueId: number;
  onSuccess?: (message: string) => void;
  onError?: (error: Error) => void;
}

const DAY_OF_WEEK_OPTIONS = [
  { label: 'Sun', value: 0 },
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
] as const;

export function LeagueDuesSetup({
  leagueId,
  onSuccess,
  onError,
}: LeagueDuesSetupProps) {
  const { data, loading: queryLoading } = useGetLeagueDuesSettingsQuery({
    variables: { leagueId },
    fetchPolicy: 'cache-and-network',
  });

  const settings = data?.leagueDuesSettings;

  const [enabled, setEnabled] = useState(false);
  const [amountDollars, setAmountDollars] = useState('');
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderDayOfWeek, setReminderDayOfWeek] = useState<number>(1);
  const [initialized, setInitialized] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (initialized) return;
    if (settings) {
      setEnabled(settings.enabled ?? false);
      const cents = settings.amountCents ?? 0;
      setAmountDollars(cents > 0 ? (cents / 100).toString() : '');
      setReminderEnabled(settings.reminderEnabled ?? false);
      setReminderDayOfWeek(settings.reminderDayOfWeek ?? 1);
      setInitialized(true);
    } else if (!queryLoading) {
      setInitialized(true);
    }
  }, [settings, queryLoading, initialized]);

  const [updateDuesSettings, { loading: saving }] =
    useUpdateDuesSettingsMutation();

  const amountCents = Math.round(parseFloat(amountDollars || '0') * 100);
  const validationError =
    enabled && (isNaN(amountCents) || amountCents <= 0)
      ? 'Please enter a valid dues amount greater than $0'
      : null;

  const handleAmountChange = useCallback((text: string) => {
    const cleaned = text.replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    const formatted =
      parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : cleaned;
    setAmountDollars(formatted);
    setHasChanges(true);
  }, []);

  const handleSave = async () => {
    if (validationError) return;

    try {
      await updateDuesSettings({
        variables: {
          input: {
            leagueId,
            enabled,
            amountCents: enabled ? amountCents : 0,
            reminderEnabled: enabled ? reminderEnabled : false,
            reminderDayOfWeek:
              enabled && reminderEnabled ? reminderDayOfWeek : null,
          },
        },
        refetchQueries: ['GetLeagueDuesSettings'],
        awaitRefetchQueries: true,
      });

      setHasChanges(false);
      onSuccess?.('Dues settings saved successfully!');
    } catch (err) {
      LOGGER.error('Failed to update dues settings', { err });
      const errorMessage =
        err instanceof Error ? err.message : 'Unknown error occurred';
      onError?.(new Error(errorMessage));
    }
  };

  const handleReset = useCallback(() => {
    if (settings) {
      setEnabled(settings.enabled ?? false);
      const cents = settings.amountCents ?? 0;
      setAmountDollars(cents > 0 ? (cents / 100).toString() : '');
      setReminderEnabled(settings.reminderEnabled ?? false);
      setReminderDayOfWeek(settings.reminderDayOfWeek ?? 1);
    } else {
      setEnabled(false);
      setAmountDollars('');
      setReminderEnabled(false);
      setReminderDayOfWeek(1);
    }
    setHasChanges(false);
  }, [settings]);

  if (queryLoading && !initialized) {
    return (
      <Card backgroundColor="$blue2" borderColor="$blue6" padding="$4">
        <YStack space="$3" alignItems="center">
          <Spinner size="large" />
          <Text color="$gray10">Loading dues settings...</Text>
        </YStack>
      </Card>
    );
  }

  return (
    <Card backgroundColor="$blue2" borderColor="$blue6" padding="$4">
      <YStack space="$4">
        {/* Header */}
        <YStack>
          <Text fontSize="$5" fontWeight="600" color="$blue11">
            League Dues
          </Text>
          <Text color="$gray11" fontSize="$3">
            Collect and track league dues from all members
          </Text>
        </YStack>

        {/* Enable/Disable Toggle */}
        <XStack
          justifyContent="space-between"
          alignItems="center"
          padding="$3"
          borderRadius="$4"
          backgroundColor={enabled ? '$blue3' : '$gray3'}
        >
          <YStack flex={1}>
            <Text fontWeight="600">Enable League Dues</Text>
            <Text fontSize="$2" color="$gray10">
              Track dues payments from league members
            </Text>
          </YStack>
          <Switch
            checked={enabled}
            onCheckedChange={(checked) => {
              setEnabled(checked);
              setHasChanges(true);
            }}
            disabled={saving}
          >
            <Switch.Thumb animation="quick" />
          </Switch>
        </XStack>

        {enabled && (
          <>
            <Separator />

            {/* Dues Amount */}
            <YStack space="$2">
              <Text fontSize="$3" fontWeight="600">
                Dues Amount
              </Text>
              <XStack alignItems="center" space="$2">
                <Text fontSize="$4" fontWeight="600" color="$gray10">
                  $
                </Text>
                <Input
                  flex={1}
                  value={amountDollars}
                  onChangeText={handleAmountChange}
                  placeholder="e.g. 50.00"
                  keyboardType="decimal-pad"
                  disabled={saving}
                />
              </XStack>
              <Text fontSize="$2" color="$gray10">
                Amount each member owes for the season
              </Text>
            </YStack>

            <Separator />

            {/* Auto-Reminders */}
            <YStack space="$3">
              <XStack
                justifyContent="space-between"
                alignItems="center"
                padding="$3"
                borderRadius="$4"
                backgroundColor={reminderEnabled ? '$blue3' : '$gray3'}
              >
                <YStack flex={1}>
                  <Text fontWeight="600">Auto-Reminders</Text>
                  <Text fontSize="$2" color="$gray10">
                    Remind unpaid members in league chat
                  </Text>
                </YStack>
                <Switch
                  checked={reminderEnabled}
                  onCheckedChange={(checked) => {
                    setReminderEnabled(checked);
                    setHasChanges(true);
                  }}
                  disabled={saving}
                >
                  <Switch.Thumb animation="quick" />
                </Switch>
              </XStack>

              {reminderEnabled && (
                <YStack space="$2">
                  <Text fontSize="$3" fontWeight="600">
                    Reminder Day
                  </Text>
                  <Text fontSize="$2" color="$gray10">
                    Choose which day of the week to send reminders
                  </Text>
                  <XStack space="$1" flexWrap="wrap">
                    {DAY_OF_WEEK_OPTIONS.map((option) => {
                      const isSelected = reminderDayOfWeek === option.value;
                      return (
                        <Button
                          key={option.value}
                          size="$3"
                          backgroundColor={isSelected ? '$blue9' : '$gray4'}
                          borderColor={isSelected ? '$blue10' : '$gray6'}
                          borderWidth={1}
                          borderRadius="$3"
                          onPress={() => {
                            setReminderDayOfWeek(option.value);
                            setHasChanges(true);
                          }}
                          disabled={saving}
                          opacity={saving ? 0.5 : 1}
                          pressStyle={{ opacity: 0.8 }}
                        >
                          <Text
                            fontSize="$2"
                            fontWeight={isSelected ? '700' : '400'}
                            color={isSelected ? 'white' : '$color'}
                          >
                            {option.label}
                          </Text>
                        </Button>
                      );
                    })}
                  </XStack>
                </YStack>
              )}
            </YStack>
          </>
        )}

        {/* Validation warning */}
        {validationError && (
          <Card backgroundColor="$yellow2" borderColor="$yellow6" padding="$3">
            <Text fontSize="$3" color="$yellow11" fontWeight="600">
              {validationError}
            </Text>
          </Card>
        )}

        {/* Action buttons */}
        <XStack space="$3" justifyContent="flex-end" flexWrap="wrap">
          <Button
            theme="alt2"
            size="$3"
            onPress={handleReset}
            disabled={!hasChanges || saving}
            opacity={!hasChanges ? 0.5 : 1}
          >
            Reset
          </Button>
          <Button
            backgroundColor="$blue9"
            color="white"
            size="$3"
            onPress={() => void handleSave()}
            disabled={!hasChanges || saving || !!validationError}
            opacity={!hasChanges || !!validationError ? 0.5 : 1}
            icon={saving ? <Spinner size="small" /> : undefined}
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </XStack>
      </YStack>
    </Card>
  );
}
