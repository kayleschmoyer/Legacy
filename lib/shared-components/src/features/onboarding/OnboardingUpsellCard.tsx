import React from 'react';
import { Button, Paragraph, XStack, YStack } from 'tamagui';
import { BRAND_GOLD, withAlpha } from '../../utils/colors';

/** Host wiring for the end-of-onboarding Premium upsell (LS-6912). */
export interface OnboardingUpsell {
  /** Called when the user taps the CTA; the tutorial then completes. */
  onUpgrade: () => void;
  /** Fired once when the card first renders. */
  onShown?: () => void;
  /** Fired when the user dismisses the card. */
  onDismiss?: () => void;
}

export const ONBOARDING_UPSELL_COPY = {
  title: 'Unlock everything with Premium',
  body: 'Unlimited leagues, salary cap and FAAB formats, advanced stats and more.',
  cta: 'See Premium plans',
  dismissLabel: 'Dismiss Premium offer',
} as const;

/**
 * Subtle, dismissible Premium card shown below the final-step checklist.
 * The host decides eligibility by passing `upsell` only to non-premium users.
 */
export function OnboardingUpsellCard({
  upsell,
}: {
  upsell: OnboardingUpsell;
}): React.JSX.Element | null {
  const [dismissed, setDismissed] = React.useState(false);
  const onShownRef = React.useRef(upsell.onShown);
  onShownRef.current = upsell.onShown;

  React.useEffect(() => {
    onShownRef.current?.();
  }, []);

  if (dismissed) return null;

  return (
    <XStack
      testID="onboarding-upsell"
      marginTop="$4"
      padding="$3"
      gap="$3"
      alignItems="flex-start"
      borderRadius="$5"
      borderWidth={1}
      borderColor={withAlpha(BRAND_GOLD, 0.4)}
      backgroundColor={withAlpha(BRAND_GOLD, 0.08)}
    >
      <YStack flex={1} gap="$1">
        <Paragraph fontWeight="700" color="$color" fontSize="$4">
          {ONBOARDING_UPSELL_COPY.title}
        </Paragraph>
        <Paragraph color="$colorPress" fontSize="$3" lineHeight={20}>
          {ONBOARDING_UPSELL_COPY.body}
        </Paragraph>
        <Button
          size="$2"
          alignSelf="flex-start"
          marginTop="$2"
          borderRadius="$5"
          backgroundColor="$brandGold"
          color="$black"
          borderWidth={0}
          testID="onboarding-upsell-cta"
          onPress={upsell.onUpgrade}
        >
          {ONBOARDING_UPSELL_COPY.cta}
        </Button>
      </YStack>
      <Button
        size="$2"
        backgroundColor="transparent"
        borderWidth={0}
        color="$colorPress"
        paddingHorizontal="$2"
        testID="onboarding-upsell-dismiss"
        aria-label={ONBOARDING_UPSELL_COPY.dismissLabel}
        onPress={() => {
          setDismissed(true);
          upsell.onDismiss?.();
        }}
      >
        ✕
      </Button>
    </XStack>
  );
}
