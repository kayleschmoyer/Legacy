import React, { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  H4,
  Separator,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { Check, RefreshCw, Scale, Settings } from '@tamagui/lucide-icons';
import { LOGGER } from '@legacy-sports/logging';
import {
  TiebreakerMethod,
  useCreateTiebreakerRulesMutation,
  useGetTiebreakerRulesQuery,
} from '../../api/db/graphql.generated';
import { BRAND_NAVY_LIGHT, withAlpha } from '../../utils/colors';

export interface TiebreakerConfigProps {
  leagueId: number;
  isCommissioner?: boolean;
  onSuccess?: (message: string) => void;
  onError?: (error: Error) => void;
}

const TIEBREAKER_METHOD_OPTIONS: {
  label: string;
  value: TiebreakerMethod;
  description: string;
}[] = [
  {
    label: 'Highest Category',
    value: TiebreakerMethod.HighestCategory,
    description: 'Team with the highest single statistical category wins',
  },
  {
    label: 'Total Season Points',
    value: TiebreakerMethod.TotalSeasonPoints,
    description: 'Team with the most cumulative season points wins',
  },
  {
    label: 'Head-to-Head Record',
    value: TiebreakerMethod.HeadToHeadRecord,
    description: 'Team with the better head-to-head record wins',
  },
  {
    label: 'Random',
    value: TiebreakerMethod.Random,
    description: 'Winner is chosen randomly (coin flip)',
  },
  {
    label: 'Co-Champion',
    value: TiebreakerMethod.CoChampion,
    description: 'Both teams share the win — no tiebreaker applied',
  },
];

function MethodSelector({
  label,
  description,
  value,
  onChange,
  disabled,
  excludeMethods,
  allowNone = false,
}: {
  label: string;
  description: string;
  value: TiebreakerMethod | null;
  onChange: (method: TiebreakerMethod | null) => void;
  disabled: boolean;
  excludeMethods?: TiebreakerMethod[];
  allowNone?: boolean;
}) {
  const availableOptions = TIEBREAKER_METHOD_OPTIONS.filter(
    (opt) => !excludeMethods?.includes(opt.value) || opt.value === value,
  );

  return (
    <YStack gap="$2">
      <YStack gap="$1">
        <Text fontSize="$3" fontWeight="600" color="$color">
          {label}
        </Text>
        <Text fontSize="$2" color="$gray10">
          {description}
        </Text>
      </YStack>
      <XStack gap="$2" flexWrap="wrap">
        {allowNone && (
          <Button
            size="$3"
            theme={value === null ? 'active' : 'alt2'}
            backgroundColor={
              value === null ? withAlpha(BRAND_NAVY_LIGHT, 0.35) : '$gray3'
            }
            borderColor={value === null ? BRAND_NAVY_LIGHT : '$gray6'}
            borderWidth={1}
            borderRadius="$3"
            onPress={() => onChange(null)}
            disabled={disabled}
            opacity={disabled ? 0.5 : 1}
            icon={value === null ? <Check size={14} /> : undefined}
            aria-pressed={value === null}
            aria-label={`${label}: None`}
            hoverStyle={
              disabled
                ? undefined
                : {
                    backgroundColor:
                      value === null
                        ? withAlpha(BRAND_NAVY_LIGHT, 0.5)
                        : '$gray4',
                  }
            }
          >
            <Text
              fontSize="$2"
              fontWeight={value === null ? '700' : '400'}
              color={value === null ? 'white' : '$color'}
            >
              None
            </Text>
          </Button>
        )}
        {availableOptions.map((option) => {
          const isSelected = value === option.value;
          return (
            <Button
              key={option.value}
              size="$3"
              theme={isSelected ? 'active' : 'alt2'}
              backgroundColor={
                isSelected ? withAlpha(BRAND_NAVY_LIGHT, 0.35) : '$gray3'
              }
              borderColor={isSelected ? BRAND_NAVY_LIGHT : '$gray6'}
              borderWidth={1}
              borderRadius="$3"
              onPress={() => onChange(option.value)}
              disabled={disabled}
              opacity={disabled ? 0.5 : 1}
              icon={isSelected ? <Check size={14} /> : undefined}
              aria-pressed={isSelected}
              aria-label={`${label}: ${option.label}`}
              hoverStyle={
                disabled
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
      {value && (
        <Text fontSize="$1" color="$gray9" fontStyle="italic">
          {TIEBREAKER_METHOD_OPTIONS.find((o) => o.value === value)
            ?.description ?? ''}
        </Text>
      )}
    </YStack>
  );
}

/**
 * TiebreakerConfig — Commissioner control for configuring tiebreaker rules.
 *
 * Supports cascading primary/secondary/tertiary method selection,
 * commissioner override toggle, and persists via GraphQL mutation.
 * Cross-platform: Tamagui only, no web-specific APIs.
 */
export function TiebreakerConfig({
  leagueId,
  isCommissioner = false,
  onSuccess,
  onError,
}: TiebreakerConfigProps) {
  const { data, loading: queryLoading } = useGetTiebreakerRulesQuery({
    variables: { leagueId },
  });

  const existingRules = data?.getTiebreakerRules;

  const [primaryMethod, setPrimaryMethod] = useState<TiebreakerMethod>(
    TiebreakerMethod.HighestCategory,
  );
  const [secondaryMethod, setSecondaryMethod] =
    useState<TiebreakerMethod | null>(null);
  const [tertiaryMethod, setTertiaryMethod] = useState<TiebreakerMethod | null>(
    null,
  );
  const [allowOverride, setAllowOverride] = useState(true);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (existingRules) {
      setPrimaryMethod(
        existingRules.primaryMethod ?? TiebreakerMethod.HighestCategory,
      );
      setSecondaryMethod(existingRules.secondaryMethod ?? null);
      setTertiaryMethod(existingRules.tertiaryMethod ?? null);
      setAllowOverride(existingRules.allowCommissionerOverride ?? true);
      setHasChanges(false);
    } else if (!queryLoading && data) {
      // Query finished but no existing rules — enable save so commissioners
      // can persist the default configuration without extra clicks.
      setHasChanges(true);
    }
  }, [existingRules, queryLoading, data]);

  const [createRules, { loading: saving }] = useCreateTiebreakerRulesMutation();

  const checkChanges = useCallback(
    (
      primary: TiebreakerMethod,
      secondary: TiebreakerMethod | null,
      tertiary: TiebreakerMethod | null,
      override: boolean,
    ) => {
      if (!existingRules) {
        setHasChanges(true);
        return;
      }
      setHasChanges(
        primary !== (existingRules.primaryMethod ?? null) ||
          secondary !== (existingRules.secondaryMethod ?? null) ||
          tertiary !== (existingRules.tertiaryMethod ?? null) ||
          override !== (existingRules.allowCommissionerOverride ?? true),
      );
    },
    [existingRules],
  );

  const handlePrimaryChange = useCallback(
    (method: TiebreakerMethod | null) => {
      const m = method ?? TiebreakerMethod.HighestCategory;
      setPrimaryMethod(m);
      // Clear secondary/tertiary if they conflict
      const newSecondary = secondaryMethod === m ? null : secondaryMethod;
      const newTertiary =
        tertiaryMethod === m || tertiaryMethod === newSecondary
          ? null
          : tertiaryMethod;
      setSecondaryMethod(newSecondary);
      setTertiaryMethod(newTertiary);
      checkChanges(m, newSecondary, newTertiary, allowOverride);
    },
    [secondaryMethod, tertiaryMethod, allowOverride, checkChanges],
  );

  const handleSecondaryChange = useCallback(
    (method: TiebreakerMethod | null) => {
      setSecondaryMethod(method);
      // Clear tertiary if no secondary or if it conflicts
      const newTertiary =
        method === null || tertiaryMethod === method ? null : tertiaryMethod;
      setTertiaryMethod(newTertiary);
      checkChanges(primaryMethod, method, newTertiary, allowOverride);
    },
    [primaryMethod, tertiaryMethod, allowOverride, checkChanges],
  );

  const handleTertiaryChange = useCallback(
    (method: TiebreakerMethod | null) => {
      setTertiaryMethod(method);
      checkChanges(primaryMethod, secondaryMethod, method, allowOverride);
    },
    [primaryMethod, secondaryMethod, allowOverride, checkChanges],
  );

  const handleOverrideToggle = useCallback(() => {
    const newValue = !allowOverride;
    setAllowOverride(newValue);
    checkChanges(primaryMethod, secondaryMethod, tertiaryMethod, newValue);
  }, [
    primaryMethod,
    secondaryMethod,
    tertiaryMethod,
    allowOverride,
    checkChanges,
  ]);

  const handleSave = async () => {
    try {
      await createRules({
        variables: {
          leagueId,
          primaryMethod,
          secondaryMethod,
          tertiaryMethod,
          allowCommissionerOverride: allowOverride,
        },
        refetchQueries: ['GetTiebreakerRules'],
        awaitRefetchQueries: true,
      });
      setHasChanges(false);
      onSuccess?.('Tiebreaker rules saved successfully!');
    } catch (err) {
      const error =
        err instanceof Error
          ? err
          : new Error('Failed to save tiebreaker rules');
      LOGGER.error('Failed to save tiebreaker rules', error);
      onError?.(error);
    }
  };

  const handleReset = () => {
    if (existingRules) {
      setPrimaryMethod(
        existingRules.primaryMethod ?? TiebreakerMethod.HighestCategory,
      );
      setSecondaryMethod(existingRules.secondaryMethod ?? null);
      setTertiaryMethod(existingRules.tertiaryMethod ?? null);
      setAllowOverride(existingRules.allowCommissionerOverride ?? true);
    } else {
      setPrimaryMethod(TiebreakerMethod.HighestCategory);
      setSecondaryMethod(null);
      setTertiaryMethod(null);
      setAllowOverride(true);
    }
    setHasChanges(false);
  };

  if (queryLoading) {
    return (
      <Card
        backgroundColor="$surfacePanel"
        borderColor="$surfacePanelBorder"
        padding="$5"
        borderRadius="$6"
      >
        <YStack alignItems="center" justifyContent="center" padding="$6">
          <Spinner size="large" />
          <Text fontSize="$3" color="$gray10" marginTop="$2">
            Loading tiebreaker rules...
          </Text>
        </YStack>
      </Card>
    );
  }

  const selectedMethods = [
    primaryMethod,
    secondaryMethod,
    tertiaryMethod,
  ].filter(Boolean) as TiebreakerMethod[];

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
          <Scale size={20} color={BRAND_NAVY_LIGHT} />
          <YStack>
            <H4 margin={0}>Tiebreaker Rules</H4>
            <Text fontSize="$2" color="$gray10">
              {isCommissioner
                ? 'Configure how tied matchups are resolved. Rules cascade from primary to tertiary.'
                : 'How tied matchups are resolved in this league.'}
            </Text>
          </YStack>
        </XStack>

        {!isCommissioner ? (
          /* Read-only view for non-commissioners */
          <YStack gap="$3">
            <YStack gap="$1">
              <Text fontSize="$2" fontWeight="600" color="$gray11">
                Primary
              </Text>
              <Text fontSize="$3" color="$color">
                {TIEBREAKER_METHOD_OPTIONS.find(
                  (o) => o.value === primaryMethod,
                )?.label ?? 'Not configured'}
              </Text>
            </YStack>
            {secondaryMethod && (
              <YStack gap="$1">
                <Text fontSize="$2" fontWeight="600" color="$gray11">
                  Secondary
                </Text>
                <Text fontSize="$3" color="$color">
                  {TIEBREAKER_METHOD_OPTIONS.find(
                    (o) => o.value === secondaryMethod,
                  )?.label ?? ''}
                </Text>
              </YStack>
            )}
            {tertiaryMethod && (
              <YStack gap="$1">
                <Text fontSize="$2" fontWeight="600" color="$gray11">
                  Tertiary
                </Text>
                <Text fontSize="$3" color="$color">
                  {TIEBREAKER_METHOD_OPTIONS.find(
                    (o) => o.value === tertiaryMethod,
                  )?.label ?? ''}
                </Text>
              </YStack>
            )}
            {allowOverride && (
              <Text fontSize="$2" color="$gray9" fontStyle="italic">
                Commissioner may manually override tiebreaker results.
              </Text>
            )}
          </YStack>
        ) : (
          /* Editable view for commissioners */
          <YStack gap="$4">
            {/* Primary Method */}
            <MethodSelector
              label="Primary Method"
              description="First tiebreaker applied when a matchup ends in a tie."
              value={primaryMethod}
              onChange={handlePrimaryChange}
              disabled={saving}
              excludeMethods={[]}
            />

            <Separator />

            {/* Secondary Method */}
            <MethodSelector
              label="Secondary Method"
              description="Applied if the primary method also results in a tie. Optional."
              value={secondaryMethod}
              onChange={handleSecondaryChange}
              disabled={saving}
              excludeMethods={[primaryMethod]}
              allowNone
            />

            {secondaryMethod && (
              <>
                <Separator />

                {/* Tertiary Method */}
                <MethodSelector
                  label="Tertiary Method"
                  description="Last resort if both primary and secondary methods tie. Optional."
                  value={tertiaryMethod}
                  onChange={handleTertiaryChange}
                  disabled={saving}
                  excludeMethods={selectedMethods.slice(0, 2)}
                  allowNone
                />
              </>
            )}

            <Separator />

            {/* Commissioner Override Toggle */}
            <XStack
              alignItems="center"
              gap="$3"
              padding="$3"
              borderRadius="$4"
              borderWidth={1}
              borderColor={
                allowOverride
                  ? withAlpha(BRAND_NAVY_LIGHT, 0.4)
                  : '$borderColor'
              }
              backgroundColor={
                allowOverride ? withAlpha(BRAND_NAVY_LIGHT, 0.08) : '$color1'
              }
              cursor="pointer"
              onPress={handleOverrideToggle}
              disabled={saving}
              opacity={saving ? 0.5 : 1}
            >
              <YStack
                width={24}
                height={24}
                borderRadius={12}
                borderWidth={2}
                borderColor={allowOverride ? BRAND_NAVY_LIGHT : '$borderColor'}
                backgroundColor={
                  allowOverride ? BRAND_NAVY_LIGHT : 'transparent'
                }
                alignItems="center"
                justifyContent="center"
              >
                {allowOverride && <Check size={14} color="white" />}
              </YStack>
              <YStack flex={1}>
                <Text fontWeight="600">Commissioner Override</Text>
                <Text fontSize="$2" color="$gray10">
                  Allow the commissioner to manually resolve tied matchups,
                  bypassing automatic tiebreaker rules.
                </Text>
              </YStack>
            </XStack>

            {/* Action buttons */}
            <XStack gap="$3" justifyContent="flex-end" flexWrap="wrap">
              <Button
                theme="alt2"
                size="$3"
                onPress={handleReset}
                disabled={!hasChanges || saving}
                opacity={!hasChanges ? 0.5 : 1}
                icon={<RefreshCw size={14} />}
              >
                Reset
              </Button>
              <Button
                theme="blue"
                size="$3"
                onPress={() => void handleSave()}
                disabled={!hasChanges || saving}
                opacity={!hasChanges ? 0.5 : 1}
                icon={
                  saving ? <Spinner size="small" /> : <Settings size={14} />
                }
              >
                {saving ? 'Saving...' : 'Save Rules'}
              </Button>
            </XStack>
          </YStack>
        )}
      </YStack>
    </Card>
  );
}
