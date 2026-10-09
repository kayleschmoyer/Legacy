import React from 'react';
import {
  Button,
  Dialog,
  H2,
  Paragraph,
  ScrollView,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import {
  OnboardingBlocks,
  type OnboardingLinkRenderProps,
} from './OnboardingStepBlocks';
import {
  type OnboardingUpsell,
  OnboardingUpsellCard,
} from './OnboardingUpsellCard';
import {
  getOnboardingSteps,
  type OnboardingAccent,
  type OnboardingSlotId,
} from './onboardingSteps';
import { BLACK, BRAND_NAVY_LIGHT, withAlpha } from '../../utils/colors';

export type { OnboardingLinkRenderProps } from './OnboardingStepBlocks';
export type { OnboardingUpsell } from './OnboardingUpsellCard';

/** How the user left the tutorial without finishing it. */
export type OnboardingSkipMethod =
  | 'close_button'
  | 'skip_button'
  | 'backdrop'
  | 'escape';

/** Funnel hooks (LS-6903). The host maps these to its analytics provider. */
export interface OnboardingTutorialAnalytics {
  /** Fired once when the tutorial opens on its first step. */
  onStarted?: () => void;
  onStepViewed?: (stepId: string, stepIndex: number) => void;
  /** Exactly one terminal event (completed or skipped) fires per run. */
  onCompleted?: () => void;
  onSkipped?: (fromStepId: string, method: OnboardingSkipMethod) => void;
}

export interface OnboardingTutorialProps {
  /** Called when the user completes or explicitly skips the tutorial */
  onClose: () => void;
  /**
   * Called instead of `onClose` when the user finishes via the final "Get
   * Started" button (LS-6908). Falls back to `onClose` when omitted.
   */
  onGetStarted?: () => void;
  /**
   * Called instead of `onClose` when dismissed with Escape (LS-6909) — a
   * reflexive gesture, not a confirmed skip. Falls back to `onClose`.
   */
  onDismiss?: () => void;
  /** Step index to open on (e.g. restored after a reload). Clamped to range. */
  initialStep?: number;
  /** Called with the new step index whenever the user navigates */
  onStepChange?: (step: number) => void;
  /**
   * Renders a final-step checklist CTA. Web passes a router `Link`; `onPress`
   * must be wired to the link's activation. Defaults to a pressable link text.
   */
  renderLink?: (props: OnboardingLinkRenderProps) => React.ReactNode;
  /** Called with the link's path when a final-step CTA is activated. */
  onNavigate?: (href: string) => void;
  /** Illustration overrides; `null` hides a slot, omitted uses the default. */
  slots?: Partial<Record<OnboardingSlotId, React.ReactNode>>;
  analytics?: OnboardingTutorialAnalytics;
  /**
   * Premium upsell card shown below the final-step checklist (LS-6912). Hosts
   * pass it only once they know the user is not premium; omit it otherwise.
   */
  upsell?: OnboardingUpsell;
  /** Adds the "Your Pro features" step for Premium users (LS-6899). */
  isPremium?: boolean;
}

const ACCENT_TOKEN: Record<OnboardingAccent, string> = {
  navyLight: '$brandNavyLight',
  seamRed: '$brandSeamRed',
  goldDark: '$brandGoldDark',
};

/**
 * Web-only capability shim for the WAI-ARIA modal pattern (LS-6902). It
 * touches `document` only when one exists and never affects layout:
 * - Escape dismissal is bound directly, because Tamagui's layered Dismissable
 *   stops delivering Escape to the Dialog once a ConceptTooltip popover that
 *   was opened inside it has closed.
 * - Focus is restored to the element that opened the tutorial, since the
 *   Dialog has no Trigger of its own to return focus to.
 */
function useModalDialogShims(onEscape: () => void) {
  const onEscapeRef = React.useRef(onEscape);
  onEscapeRef.current = onEscape;
  // Captured during the first render, before the Dialog moves focus inside.
  const [previouslyFocused] = React.useState(() =>
    typeof document !== 'undefined' ? document.activeElement : null,
  );

  React.useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      onEscapeRef.current();
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      if (
        typeof HTMLElement !== 'undefined' &&
        previouslyFocused instanceof HTMLElement &&
        previouslyFocused.isConnected
      ) {
        previouslyFocused.focus();
      }
    };
  }, [previouslyFocused]);
}
const TITLE_ID = 'onboarding-title';

/**
 * A multi-step onboarding tutorial that explains the historical-stats game
 * mechanic. One Tamagui component for web and native, rendered in a modal
 * Dialog (focus trap, Escape and focus restore come from the Dialog — LS-6902).
 * Clicking outside the card does nothing (LS-6901).
 */
export function OnboardingTutorial({
  onClose,
  onGetStarted,
  onDismiss,
  initialStep = 0,
  onStepChange,
  renderLink,
  onNavigate,
  slots,
  analytics,
  upsell,
  isPremium = false,
}: OnboardingTutorialProps): React.JSX.Element {
  const steps = React.useMemo(() => getOnboardingSteps(isPremium), [isPremium]);
  const stepCount = steps.length;
  const [currentStep, setCurrentStepState] = React.useState(() =>
    Math.min(Math.max(0, initialStep), stepCount - 1),
  );
  const setCurrentStep = (next: number) => {
    setCurrentStepState(next);
    onStepChange?.(next);
  };
  const step = steps[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === stepCount - 1;

  // `stepRef` lets the close handlers report the step the user was on;
  // `closedRef` guarantees exactly one terminal event per tutorial run.
  const stepRef = React.useRef(step.id);
  stepRef.current = step.id;
  const closedRef = React.useRef(false);
  const startedRef = React.useRef(false);
  const analyticsRef = React.useRef(analytics);
  analyticsRef.current = analytics;

  React.useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    // A tutorial resumed mid-way (initialStep > 0) is not a new start.
    if (currentStep === 0) analyticsRef.current?.onStarted?.();
  }, [currentStep]);

  React.useEffect(() => {
    analyticsRef.current?.onStepViewed?.(step.id, currentStep);
  }, [step.id, currentStep]);

  const finish = (
    method: OnboardingSkipMethod | 'completed',
    done: () => void = onClose,
  ) => {
    if (!closedRef.current) {
      closedRef.current = true;
      if (method === 'completed') analyticsRef.current?.onCompleted?.();
      else analyticsRef.current?.onSkipped?.(stepRef.current, method);
    }
    done();
  };

  const handleLinkPress = (href: string) => {
    onNavigate?.(href);
    finish('completed');
  };

  const handleUpgrade = () => {
    upsell?.onUpgrade();
    finish('completed');
  };

  const handleNext = () => {
    if (isLast) finish('completed', onGetStarted ?? onClose);
    else setCurrentStep(currentStep + 1);
  };

  useModalDialogShims(() => finish('escape', onDismiss ?? onClose));

  return (
    // The tutorial is mounted only while open, so the Dialog is always open
    // and `onOpenChange` is deliberately a no-op: every dismissal goes through
    // our own controls or the Escape shim, never an outside press.
    <Dialog modal open onOpenChange={() => undefined}>
      {/* Tamagui renders the portal frame as a native <dialog>; neutralise its
          implicit role so the card below is the single labelled dialog. The
          z-index keeps app chrome such as the impersonation banner (9999)
          above the tutorial, as the pre-Dialog overlay did. */}
      <Dialog.Portal role="presentation" zIndex={1000}>
        <Dialog.Overlay
          key="overlay"
          backgroundColor={withAlpha(BLACK, 0.85)}
        />
        <Dialog.Content
          key="content"
          role="dialog"
          aria-modal
          aria-labelledby={TITLE_ID}
          aria-describedby={undefined}
          testID={`onboarding-step-${currentStep + 1}`}
          backgroundColor="$surfacePanel"
          borderRadius="$7"
          borderWidth={1}
          borderColor="$surfacePanelBorder"
          width="92%"
          maxWidth={560}
          maxHeight="90%"
          padding={0}
          overflow="hidden"
          onInteractOutside={(e: { preventDefault: () => void }) =>
            e.preventDefault()
          }
        >
          {/* Top accent bar */}
          <XStack height={4}>
            <YStack flex={2} backgroundColor="$brandNavyLight" />
            <YStack flex={2} backgroundColor="$brandSeamRed" />
            <YStack flex={3} backgroundColor="$brandGold" />
          </XStack>

          {/* Header */}
          <XStack
            padding="$5"
            paddingBottom="$3"
            alignItems="flex-start"
            justifyContent="space-between"
          >
            <XStack alignItems="center" gap="$3" flex={1}>
              <YStack
                width={52}
                height={52}
                borderRadius="$5"
                alignItems="center"
                justifyContent="center"
                flexShrink={0}
                backgroundColor={ACCENT_TOKEN[step.accent]}
              >
                <Paragraph fontSize={26} lineHeight={30}>
                  <Text role="img" aria-label={step.emojiLabel}>
                    {step.emoji}
                  </Text>
                </Paragraph>
              </YStack>
              <YStack flex={1} gap="$1">
                <Paragraph
                  fontSize="$2"
                  fontWeight="600"
                  color="$brandGold"
                  textTransform="uppercase"
                  letterSpacing={1}
                >
                  {`Step ${currentStep + 1} of ${stepCount}`}
                </Paragraph>
                <Dialog.Title asChild>
                  <H2
                    id={TITLE_ID}
                    color="$color"
                    fontSize="$6"
                    fontWeight="800"
                    lineHeight={28}
                  >
                    {step.title}
                  </H2>
                </Dialog.Title>
              </YStack>
            </XStack>

            <Button
              size="$2"
              backgroundColor="transparent"
              borderWidth={0}
              onPress={() => finish('close_button')}
              aria-label="Skip tutorial"
              color="$colorPress"
              hoverStyle={{ opacity: 0.75 }}
              paddingHorizontal="$2"
            >
              ✕
            </Button>
          </XStack>

          {/* Progress dots */}
          <XStack
            paddingHorizontal="$5"
            gap="$2"
            alignItems="center"
            marginBottom="$2"
          >
            {steps.map((s, i) => (
              // A real Button gives Tab focus plus Enter/Space activation; the
              // vertical padding enlarges the 4px bar into a usable target.
              <Button
                key={s.id}
                unstyled
                testID={`onboarding-dot-${i + 1}`}
                aria-label={`Go to step ${i + 1}`}
                aria-current={i === currentStep ? 'step' : undefined}
                onPress={() => setCurrentStep(i)}
                flex={i === currentStep ? 2 : 1}
                paddingVertical={8}
                cursor="pointer"
              >
                <YStack
                  height={4}
                  borderRadius="$10"
                  backgroundColor={
                    i <= currentStep
                      ? '$brandSeamRed'
                      : withAlpha(BRAND_NAVY_LIGHT, 0.3)
                  }
                />
              </Button>
            ))}
          </XStack>

          {/* Body (scrollable) */}
          <ScrollView flexShrink={1}>
            <YStack padding="$5" paddingTop="$3">
              <OnboardingBlocks
                blocks={step.blocks}
                slots={slots}
                renderLink={renderLink}
                onLinkPress={handleLinkPress}
              />
              {isLast && upsell ? (
                <OnboardingUpsellCard
                  upsell={{ ...upsell, onUpgrade: handleUpgrade }}
                />
              ) : null}
            </YStack>
          </ScrollView>

          {/* Footer */}
          <XStack
            padding="$4"
            paddingTop="$3"
            justifyContent="space-between"
            alignItems="center"
            borderTopWidth={1}
            borderTopColor={withAlpha(BRAND_NAVY_LIGHT, 0.3)}
          >
            {!isFirst ? (
              <Button
                size="$3"
                backgroundColor="transparent"
                borderWidth={1}
                borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.5)}
                color="$colorPress"
                borderRadius="$5"
                onPress={() => setCurrentStep(Math.max(0, currentStep - 1))}
                hoverStyle={{ borderColor: BRAND_NAVY_LIGHT }}
              >
                ← Back
              </Button>
            ) : (
              /* Spacer so Next stays right-aligned on the first step */
              <YStack />
            )}

            <XStack alignItems="center" gap="$3">
              {!isLast && (
                <Button
                  size="$3"
                  backgroundColor="transparent"
                  borderWidth={0}
                  color="$colorPress"
                  onPress={() => finish('skip_button')}
                  testID="onboarding-skip-footer"
                  hoverStyle={{ opacity: 0.75 }}
                >
                  Skip tutorial
                </Button>
              )}

              <Button
                size="$3"
                borderRadius="$5"
                fontWeight="700"
                onPress={handleNext}
                backgroundColor="$brandNavyLight"
                color="$white"
                borderWidth={0}
                minWidth={100}
                hoverStyle={{ opacity: 0.9 }}
              >
                {isLast ? '🚀 Get Started' : 'Next →'}
              </Button>
            </XStack>
          </XStack>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}
