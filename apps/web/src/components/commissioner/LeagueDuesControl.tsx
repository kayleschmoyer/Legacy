import React, { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  H4,
  Input,
  Separator,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { AlertTriangle, Check, DollarSign } from '@tamagui/lucide-icons';
import {
  useGetLeagueDuesSettingsQuery,
  useUpdateDuesSettingsMutation,
} from '../../api/db/graphql.generated';
import { BRAND_NAVY_LIGHT, withAlpha } from '../../constants/colors';

export interface LeagueDuesControlProps {
  leagueId: number;
  onSuccess?: (message: string) => void;
  onError?: (error: Error) => void;
}

const DAY_OF_WEEK_OPTIONS = [
  { label: 'Sunday', value: 0 },
  { label: 'Monday', value: 1 },
  { label: 'Tuesday', value: 2 },
  { label: 'Wednesday', value: 3 },
  { label: 'Thursday', value: 4 },
  { label: 'Friday', value: 5 },
  { label: 'Saturday', value: 6 },
] as const;

export function LeagueDuesControl({
  leagueId,
  onSuccess,
  onError,
}: LeagueDuesControlProps) {
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

  // Sync state from server data once query resolves
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
      // No settings yet — defaults are fine
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

  const handleEnabledToggle = useCallback(() => {
    setEnabled((prev) => !prev);
    setHasChanges(true);
  }, []);

  const handleAmountChange = useCallback((text: string) => {
    // Allow only digits and a single decimal point
    const cleaned = text.replace(/[^0-9.]/g, '');
    // Prevent multiple decimal points
    const parts = cleaned.split('.');
    const formatted =
      parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : cleaned;
    setAmountDollars(formatted);
    setHasChanges(true);
  }, []);

  const handleReminderToggle = useCallback(() => {
    setReminderEnabled((prev) => !prev);
    setHasChanges(true);
  }, []);

  const handleReminderDayChange = useCallback((day: number) => {
    setReminderDayOfWeek(day);
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
      <Card
        backgroundColor="$surfacePanel"
        borderColor="$surfacePanelBorder"
        padding="$5"
        borderRadius="$6"
      >
        <YStack gap="$3" alignItems="center">
          <Spinner size="large" />
          <Text color="$textMuted">Loading dues settings...</Text>
        </YStack>
      </Card>
    );
  }

  return (
    <Card
      backgroundColor="$surfacePanel"
      borderColor="$surfacePanelBorder"
      padding="$5"
      borderRadius="$6"
    >
      <YStack gap="$4">
        {/* Header */}
        <XStack alignItems="center" gap="$2">
          <DollarSign size={20} color={BRAND_NAVY_LIGHT} />
          <YStack>
            <H4>League Dues</H4>
            <Text fontSize="$2" color="$gray10">
              Collect and track league dues from all members
            </Text>
          </YStack>
        </XStack>

        {/* Enable/Disable Toggle */}
        <XStack
          alignItems="center"
          gap="$3"
          padding="$3"
          borderRadius="$4"
          borderWidth={1}
          borderColor={
            enabled ? withAlpha(BRAND_NAVY_LIGHT, 0.4) : '$borderColor'
          }
          backgroundColor={
            enabled ? withAlpha(BRAND_NAVY_LIGHT, 0.08) : '$color1'
          }
          cursor="pointer"
          onPress={handleEnabledToggle}
        >
          <YStack
            width={24}
            height={24}
            borderRadius={12}
            borderWidth={2}
            borderColor={enabled ? BRAND_NAVY_LIGHT : '$borderColor'}
            backgroundColor={enabled ? BRAND_NAVY_LIGHT : 'transparent'}
            alignItems="center"
            justifyContent="center"
          >
            {enabled && <Check size={14} color="white" />}
          </YStack>
          <YStack flex={1}>
            <Text fontWeight="600">Enable League Dues</Text>
            <Text fontSize="$2" color="$gray10">
              Track dues payments from league members
            </Text>
          </YStack>
        </XStack>

        {enabled && (
          <>
            <Separator />

            {/* Dues Amount */}
            <YStack gap="$2">
              <Text fontSize="$3" fontWeight="600">
                Dues Amount
              </Text>
              <XStack alignItems="center" gap="$2">
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
            <YStack gap="$3">
              <XStack
                alignItems="center"
                gap="$3"
                padding="$3"
                borderRadius="$4"
                borderWidth={1}
                borderColor={
                  reminderEnabled
                    ? withAlpha(BRAND_NAVY_LIGHT, 0.4)
                    : '$borderColor'
                }
                backgroundColor={
                  reminderEnabled
                    ? withAlpha(BRAND_NAVY_LIGHT, 0.08)
                    : '$color1'
                }
                cursor="pointer"
                onPress={handleReminderToggle}
              >
                <YStack
                  width={24}
                  height={24}
                  borderRadius={12}
                  borderWidth={2}
                  borderColor={
                    reminderEnabled ? BRAND_NAVY_LIGHT : '$borderColor'
                  }
                  backgroundColor={
                    reminderEnabled ? BRAND_NAVY_LIGHT : 'transparent'
                  }
                  alignItems="center"
                  justifyContent="center"
                >
                  {reminderEnabled && <Check size={14} color="white" />}
                </YStack>
                <YStack flex={1}>
                  <Text fontWeight="600">Auto-Reminders</Text>
                  <Text fontSize="$2" color="$gray10">
                    Automatically remind unpaid members in league chat
                  </Text>
                </YStack>
              </XStack>

              {reminderEnabled && (
                <YStack gap="$2">
                  <Text fontSize="$3" fontWeight="600">
                    Reminder Day
                  </Text>
                  <Text fontSize="$2" color="$gray10">
                    Choose which day of the week to send reminders
                  </Text>
                  <XStack gap="$2" flexWrap="wrap">
                    {DAY_OF_WEEK_OPTIONS.map((option) => {
                      const isSelected = reminderDayOfWeek === option.value;
                      return (
                        <Button
                          key={option.value}
                          size="$3"
                          theme={isSelected ? 'active' : 'alt2'}
                          backgroundColor={
                            isSelected
                              ? withAlpha(BRAND_NAVY_LIGHT, 0.35)
                              : '$gray3'
                          }
                          borderColor={isSelected ? BRAND_NAVY_LIGHT : '$gray6'}
                          borderWidth={1}
                          borderRadius="$3"
                          onPress={() => handleReminderDayChange(option.value)}
                          disabled={saving}
                          opacity={saving ? 0.5 : 1}
                          icon={isSelected ? <Check size={14} /> : undefined}
                          aria-pressed={isSelected}
                          aria-label={`Reminder day: ${option.label}`}
                          hoverStyle={
                            saving
                              ? undefined
                              : {
                                  backgroundColor: isSelected
                                    ? withAlpha(BRAND_NAVY_LIGHT, 0.5)
                                    : '$gray4',
                                }
                          }
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
          <Card
            backgroundColor="$yellow2"
            borderColor="$yellow6"
            padding="$3"
            borderRadius="$4"
          >
            <XStack alignItems="center" gap="$2">
              <AlertTriangle size={16} color="var(--yellow11)" />
              <Text fontSize="$3" color="$yellow11" fontWeight="600">
                {validationError}
              </Text>
            </XStack>
          </Card>
        )}
      </YStack>

      {/* Action buttons */}
      <XStack gap="$3" justifyContent="flex-end" flexWrap="wrap" marginTop="$4">
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
          theme="blue"
          size="$3"
          onPress={() => void handleSave()}
          disabled={!hasChanges || saving || !!validationError}
          opacity={!hasChanges || !!validationError ? 0.5 : 1}
          icon={saving ? <Spinner size="small" /> : undefined}
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </XStack>
    </Card>
  );
}
