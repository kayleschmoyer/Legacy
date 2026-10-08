import React from 'react';
import { Anchor, Text, useMedia, XStack, YStack } from 'tamagui';
import { Button } from '../../Button';

export interface ConsentBannerProps {
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onManage: () => void;
  /** Where the inline "Privacy Policy" link points. */
  privacyPolicyHref?: string;
  /** Stacking layer: must be above fixed page chrome (nav, bottom bar), below toasts. */
  zIndex?: number;
}

export const CONSENT_BANNER_TITLE = 'Cookies & analytics';

/**
 * First-visit analytics consent banner (LS-10764).
 *
 * Non-modal: it never traps or steals focus, and ignoring it leaves
 * analytics off. Accept and Reject share one style and size so neither is
 * nudged. Layout by viewport:
 * - wide (≥980): floating card, bottom-left, max 520px;
 * - medium: card spanning the viewport minus 16px gutters;
 * - phone (≤659): bottom sheet with stacked full-width buttons
 *   (Accept, Reject, Manage). DOM order always matches visual order.
 */
export function ConsentBanner({
  onAcceptAll,
  onRejectAll,
  onManage,
  privacyPolicyHref = '/privacy',
  zIndex = 300,
}: ConsentBannerProps): React.JSX.Element {
  const isPhone = useMedia().xxs;

  const accept = (
    <Button
      key="accept"
      variant="primary"
      flex={isPhone ? undefined : 1}
      height={isPhone ? 48 : undefined}
      onPress={onAcceptAll}
    >
      Accept all
    </Button>
  );
  const reject = (
    <Button
      key="reject"
      variant="primary"
      flex={isPhone ? undefined : 1}
      height={isPhone ? 48 : undefined}
      onPress={onRejectAll}
    >
      Reject all
    </Button>
  );
  const manage = (
    <Button
      key="manage"
      variant="ghost"
      alignSelf={isPhone ? 'center' : undefined}
      onPress={onManage}
    >
      <Text
        color="$color11"
        fontFamily="$body"
        fontSize={14}
        hoverStyle={{ textDecorationLine: 'underline' }}
      >
        Manage choices
      </Text>
    </Button>
  );

  return (
    <YStack
      role="region"
      aria-label="Cookie consent"
      data-testid="consent-banner"
      position="fixed"
      zIndex={zIndex}
      bottom={24}
      left={24}
      maxWidth={520}
      gap="$3"
      padding="$5"
      backgroundColor="$surfaceRaised"
      borderWidth={1}
      borderColor="$outlineDefault"
      borderRadius="$5"
      shadowColor="$shadowColor"
      shadowOffset={{ width: 0, height: 8 }}
      shadowRadius={24}
      animation="medium"
      enterStyle={{ opacity: 0, y: 16 }}
      exitStyle={{ opacity: 0 }}
      $md={{ left: 16, right: 16, bottom: 16, maxWidth: undefined }}
      $xxs={{
        left: 0,
        right: 0,
        bottom: 0,
        padding: 16,
        borderWidth: 0,
        borderTopWidth: 1,
        borderRadius: 0,
        borderTopLeftRadius: '$5',
        borderTopRightRadius: '$5',
      }}
    >
      <Text
        tag="h2"
        fontFamily="$heading"
        fontSize={18}
        fontWeight="800"
        color="$color12"
      >
        {CONSENT_BANNER_TITLE}
      </Text>
      <Text fontFamily="$body" fontSize={14} lineHeight={21} color="$color11">
        We use essential storage to keep you signed in and remember your
        settings. With your OK, we&apos;d also use Google Analytics to see which
        features managers use so we can make Legacy Sports better. No ads, and
        we never sell your data.{' '}
        <Anchor
          href={privacyPolicyHref}
          color="$color12"
          fontSize={14}
          textDecorationLine="underline"
        >
          Privacy Policy
        </Anchor>
      </Text>
      {isPhone ? (
        <YStack gap="$2">
          {accept}
          {reject}
          {manage}
        </YStack>
      ) : (
        <XStack gap="$2" alignItems="center" flexWrap="wrap">
          {reject}
          {accept}
          {manage}
        </XStack>
      )}
    </YStack>
  );
}
