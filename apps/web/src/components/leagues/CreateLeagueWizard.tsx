import React, { useCallback, useReducer, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScrollView, Text, XStack, YStack } from 'tamagui';
import { ChevronLeft } from '@tamagui/lucide-icons';
import { LOGGER } from '@legacy-sports/logging';
import { StepConfirmation } from './wizard/StepConfirmation';
import {
  type DefensiveFormat,
  StepDefensiveFormat,
} from './wizard/StepDefensiveFormat';
import {
  type LeagueSettings,
  StepLeagueSettings,
} from './wizard/StepLeagueSettings';
import {
  DST_ROSTER_DEFAULTS,
  IDP_ROSTER_DEFAULTS,
  StepRosterSettings,
} from './wizard/StepRosterSettings';
import { type SportChoice, StepSportSelect } from './wizard/StepSportSelect';
import { PageMeta } from '../PageMeta';
import {
  BG_DARK,
  BRAND_GOLD,
  BRAND_SEAM_RED,
  PANEL_BORDER,
  SURFACE_CARD,
  TEXT_MUTED,
  TEXT_PRIMARY,
} from '../../constants/colors';
import {
  GetUserLeagues,
  GetUserLeaguesQuery,
  DefensiveFormat as GqlDefensiveFormat,
  Sport,
  useCreateLeagueAndTeamsMutation,
} from '../../api/db/graphql.generated';

// ── Types ──────────────────────────────────────────────────────────────────

export interface WizardState {
  sport: SportChoice;
  defensiveFormat: DefensiveFormat;
  name: string;
  numTeams: number;
  draftType: 'snake' | 'auction';
  rosterSlots: Record<string, number>;
  /** Tracks whether the user has manually adjusted roster slots */
  rosterCustomized: boolean;
}

type Step = 'sport' | 'settings' | 'roster' | 'defensive' | 'confirm';

// ── Step sequence ──────────────────────────────────────────────────────────

export function getSteps(sport: SportChoice): Step[] {
  if (sport === 'FOOTBALL') {
    return ['sport', 'settings', 'roster', 'defensive', 'confirm'];
  }
  return ['sport', 'settings', 'confirm'];
}

const STEP_LABELS: Record<Step, string> = {
  sport: 'Sport',
  settings: 'Settings',
  roster: 'Roster',
  defensive: 'Defense',
  confirm: 'Confirm',
};

// ── Reducer ────────────────────────────────────────────────────────────────

export type WizardAction =
  | { type: 'SET_SPORT'; sport: SportChoice }
  | { type: 'SET_SETTINGS'; settings: LeagueSettings }
  | { type: 'SET_DEFENSIVE_FORMAT'; format: DefensiveFormat }
  | { type: 'SET_ROSTER_SLOTS'; slots: Record<string, number> };

export const INITIAL_STATE: WizardState = {
  sport: 'BASEBALL',
  defensiveFormat: 'dst',
  name: '',
  numTeams: 10,
  draftType: 'snake',
  rosterSlots: { ...DST_ROSTER_DEFAULTS },
  rosterCustomized: false,
};

export function wizardReducer(
  state: WizardState,
  action: WizardAction,
): WizardState {
  switch (action.type) {
    case 'SET_SPORT': {
      const defaults =
        action.sport === 'FOOTBALL'
          ? {
              numTeams: 12,
              defensiveFormat: 'dst' as const,
              rosterSlots: { ...DST_ROSTER_DEFAULTS },
            }
          : { numTeams: 10, rosterSlots: {} };
      return {
        ...state,
        sport: action.sport,
        rosterCustomized: false,
        ...defaults,
      };
    }
    case 'SET_SETTINGS':
      return {
        ...state,
        name: action.settings.name,
        numTeams: action.settings.numTeams,
        draftType: action.settings.draftType,
      };
    case 'SET_DEFENSIVE_FORMAT':
      if (action.format === state.defensiveFormat) return state;
      return {
        ...state,
        defensiveFormat: action.format,
        rosterCustomized: false,
        rosterSlots:
          action.format === 'idp'
            ? { ...IDP_ROSTER_DEFAULTS }
            : { ...DST_ROSTER_DEFAULTS },
      };
    case 'SET_ROSTER_SLOTS':
      return { ...state, rosterSlots: action.slots, rosterCustomized: true };
    default:
      return state;
  }
}

// ── Validation ─────────────────────────────────────────────────────────────

export function validateStep(step: Step, state: WizardState): string | null {
  if (step === 'settings') {
    if (!state.name.trim()) return 'League name is required.';
    if (state.name.trim().length > 50)
      return 'League name must be 50 characters or fewer.';
  }
  return null;
}

// ── Component ──────────────────────────────────────────────────────────────

export function CreateLeagueWizard() {
  const navigate = useNavigate();
  const [state, dispatch] = useReducer(wizardReducer, INITIAL_STATE);

  const steps = getSteps(state.sport);
  const [stepIndex, setStepIndex] = React.useState(0);
  const currentStep = steps[stepIndex];

  const [stepError, setStepError] = React.useState<string | null>(null);
  const [mutationError, setMutationError] = React.useState<string | null>(null);

  // Warn dialog ref when defensive format changes with customized roster
  const prevDefensiveFormat = useRef<DefensiveFormat>(state.defensiveFormat);

  const [createLeagueAndTeams, { loading }] = useCreateLeagueAndTeamsMutation({
    update: (cache, { data }) => {
      if (data?.createLeagueAndTeams?.league) {
        const newLeague = data.createLeagueAndTeams.league;
        try {
          const existing = cache.readQuery<GetUserLeaguesQuery>({
            query: GetUserLeagues,
          });
          if (existing?.userLeagues) {
            cache.writeQuery({
              query: GetUserLeagues,
              data: { userLeagues: [...existing.userLeagues, newLeague] },
            });
          }
        } catch {
          // fall through to refetchQueries
        }
      }
    },
    refetchQueries: [{ query: GetUserLeagues }],
  });

  // ── Navigation ────────────────────────────────────────────────────────────

  const goNext = useCallback(() => {
    const err = validateStep(currentStep, state);
    if (err) {
      setStepError(err);
      return;
    }
    setStepError(null);
    if (stepIndex < steps.length - 1) {
      setStepIndex((i) => i + 1);
    }
  }, [currentStep, state, stepIndex, steps.length]);

  const goBack = useCallback(() => {
    setStepError(null);
    setMutationError(null);
    if (stepIndex > 0) {
      setStepIndex((i) => i - 1);
    }
  }, [stepIndex]);

  // ── Defensive format change with warning ─────────────────────────────────

  const handleDefensiveFormatChange = useCallback(
    (format: DefensiveFormat) => {
      if (state.rosterCustomized && format !== prevDefensiveFormat.current) {
        // Warn user that roster will be reset
        const confirmed = window.confirm(
          'Changing defensive format will reset your roster configuration. Continue?',
        );
        if (!confirmed) return;
      }
      prevDefensiveFormat.current = format;
      dispatch({ type: 'SET_DEFENSIVE_FORMAT', format });
    },
    [state.rosterCustomized],
  );

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    setMutationError(null);
    const isFootball = state.sport === 'FOOTBALL';
    const sport = isFootball ? Sport.Football : Sport.Baseball;
    const playerPool = 'all';
    const maxRosterSize = isFootball
      ? Object.values(state.rosterSlots).reduce((sum, n) => sum + n, 0)
      : 26;

    try {
      const result = await createLeagueAndTeams({
        variables: {
          input: {
            leagueName: state.name.trim(),
            sport,
            numberOfTeams: state.numTeams,
            playerPool,
            selectionMethod:
              state.draftType === 'auction' ? 'auction' : 'standard',
            draftOrder: state.draftType === 'snake' ? 'snake' : 'linear',
            maxRosterSize,
            ...(isFootball
              ? {
                  defensiveFormat:
                    state.defensiveFormat === 'idp'
                      ? GqlDefensiveFormat.Idp
                      : GqlDefensiveFormat.Dst,
                }
              : {}),
          },
        },
        context: { suppressGlobalError: true },
        errorPolicy: 'none',
      });

      const leagueId = result.data?.createLeagueAndTeams?.league?.id;
      if (leagueId) {
        navigate(`/${isFootball ? 'football' : 'baseball'}/league/${leagueId}`);
      }
    } catch (err) {
      LOGGER.error(
        'CreateLeagueWizard: mutation failed',
        err instanceof Error ? err : new Error(String(err)),
      );
      const msg =
        err instanceof Error
          ? err.message
          : 'Failed to create league. Please try again.';
      setMutationError(msg);
    }
  }, [state, createLeagueAndTeams, navigate]);

  // ── Step indicator ────────────────────────────────────────────────────────

  const StepIndicator = () => (
    <XStack
      gap="$2"
      alignItems="center"
      justifyContent="center"
      paddingVertical="$2"
    >
      {steps.map((step, i) => {
        const isDone = i < stepIndex;
        const isCurrent = i === stepIndex;
        return (
          <XStack key={step} alignItems="center" gap="$1">
            <XStack
              width={isCurrent ? 28 : 22}
              height={isCurrent ? 28 : 22}
              borderRadius="$full"
              backgroundColor={
                isDone ? BRAND_GOLD : isCurrent ? '$blue9' : SURFACE_CARD
              }
              borderWidth={1}
              borderColor={
                isDone ? BRAND_GOLD : isCurrent ? '$blue9' : PANEL_BORDER
              }
              alignItems="center"
              justifyContent="center"
              animation="quick"
            >
              <Text
                fontSize={isCurrent ? 12 : 10}
                fontWeight="700"
                color={isDone ? '#1B1208' : isCurrent ? '$color1' : TEXT_MUTED}
              >
                {isDone ? '✓' : String(i + 1)}
              </Text>
            </XStack>
            {i < steps.length - 1 && (
              <XStack
                width={20}
                height={2}
                backgroundColor={isDone ? BRAND_GOLD : PANEL_BORDER}
                borderRadius="$full"
                animation="quick"
              />
            )}
          </XStack>
        );
      })}
    </XStack>
  );

  // ── Render ────────────────────────────────────────────────────────────────

  const isLastStep = stepIndex === steps.length - 1;

  return (
    <ScrollView backgroundColor={BG_DARK} minHeight="100vh">
      <PageMeta
        title="Create League"
        description="Create a new fantasy sports league"
      />
      <YStack
        maxWidth={600}
        width="100%"
        alignSelf="center"
        paddingHorizontal="$4"
        paddingVertical="$6"
        gap="$4"
      >
        {/* Header */}
        <YStack gap="$1" alignItems="center">
          <Text
            fontSize={28}
            fontWeight="800"
            fontFamily="$heading"
            color={TEXT_PRIMARY}
          >
            Create a New League
          </Text>
          <StepIndicator />
          <Text fontSize={12} color={TEXT_MUTED}>
            Step {stepIndex + 1} of {steps.length} — {STEP_LABELS[currentStep]}
          </Text>
        </YStack>

        {/* Step content */}
        <YStack
          backgroundColor={SURFACE_CARD}
          borderRadius="$4"
          padding="$5"
          borderWidth={1}
          borderColor={PANEL_BORDER}
        >
          {currentStep === 'sport' && (
            <StepSportSelect
              sport={state.sport}
              onChange={(sport) => {
                dispatch({ type: 'SET_SPORT', sport });
                setStepIndex(0);
              }}
            />
          )}

          {currentStep === 'settings' && (
            <StepLeagueSettings
              sport={state.sport}
              settings={{
                name: state.name,
                numTeams: state.numTeams,
                draftType: state.draftType,
              }}
              onChange={(settings) =>
                dispatch({ type: 'SET_SETTINGS', settings })
              }
            />
          )}

          {currentStep === 'roster' && (
            <StepRosterSettings
              defensiveFormat={state.defensiveFormat}
              rosterSlots={state.rosterSlots}
              onChange={(slots) =>
                dispatch({ type: 'SET_ROSTER_SLOTS', slots })
              }
            />
          )}

          {currentStep === 'defensive' && (
            <StepDefensiveFormat
              defensiveFormat={state.defensiveFormat}
              onChange={handleDefensiveFormatChange}
            />
          )}

          {currentStep === 'confirm' && (
            <StepConfirmation
              state={state}
              error={mutationError}
              loading={loading}
              onSubmit={() => void handleSubmit()}
            />
          )}

          {/* Step error */}
          {stepError && (
            <XStack
              marginTop="$3"
              padding="$3"
              backgroundColor="$red2"
              borderRadius="$2"
              borderWidth={1}
              borderColor="$red6"
              gap="$2"
              alignItems="center"
            >
              <Text fontSize={13} color={BRAND_SEAM_RED}>
                {stepError}
              </Text>
            </XStack>
          )}
        </YStack>

        {/* Navigation buttons */}
        {!isLastStep && (
          <XStack gap="$3" justifyContent="space-between">
            <XStack
              pressStyle={{ opacity: 0.7 }}
              onPress={stepIndex > 0 ? goBack : undefined}
              opacity={stepIndex > 0 ? 1 : 0}
              padding="$3"
              paddingHorizontal="$4"
              borderRadius="$3"
              borderWidth={1}
              borderColor={PANEL_BORDER}
              backgroundColor={SURFACE_CARD}
              alignItems="center"
              gap="$1"
              cursor={stepIndex > 0 ? 'pointer' : 'default'}
              animation="quick"
            >
              <ChevronLeft size={16} color={TEXT_PRIMARY} />
              <Text fontSize={14} fontWeight="600" color={TEXT_PRIMARY}>
                Back
              </Text>
            </XStack>

            <XStack
              pressStyle={{ opacity: 0.85, scale: 0.99 }}
              onPress={goNext}
              flex={1}
              padding="$3"
              borderRadius="$3"
              backgroundColor="$blue9"
              alignItems="center"
              justifyContent="center"
              cursor="pointer"
              animation="quick"
            >
              <Text fontSize={14} fontWeight="700" color="$color1">
                Continue
              </Text>
            </XStack>
          </XStack>
        )}

        {isLastStep && stepIndex > 0 && (
          <XStack
            pressStyle={{ opacity: 0.7 }}
            onPress={goBack}
            alignSelf="flex-start"
            padding="$2"
            paddingHorizontal="$3"
            borderRadius="$2"
            borderWidth={1}
            borderColor={PANEL_BORDER}
            backgroundColor={SURFACE_CARD}
            alignItems="center"
            gap="$1"
            cursor="pointer"
            animation="quick"
          >
            <ChevronLeft size={14} color={TEXT_MUTED} />
            <Text fontSize={13} color={TEXT_MUTED}>
              Back
            </Text>
          </XStack>
        )}
      </YStack>
    </ScrollView>
  );
}
