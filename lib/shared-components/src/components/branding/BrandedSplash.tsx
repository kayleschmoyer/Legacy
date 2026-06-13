import React from 'react';
import { Spinner, Text, Theme, YStack } from 'tamagui';
import { BrandLogo } from './BrandLogo';

export interface BrandedSplashProps {
  /** Optional status line shown beneath the spinner. */
  message?: string;
  /** Accessibility label for the splash region. Defaults to "Loading Legacy Sports". */
  testID?: string;
}

/**
 * BrandedSplash — full-screen branded loading screen shown while the app
 * resolves auth on cold start. Mirrors the login screen's `legacy_dark`
 * aesthetic (deep navy field, gold wordmark + tagline, gold accent rule) so the
 * cold-start → login → app sequence reads as one continuous surface instead of
 * a bare centered spinner.
 *
 * Used in place of `UnifiedLoadingPanel` at the mobile auth gates — see
 * apps/app/src/app/(app)/_layout.tsx and
 * apps/app/src/common/auth/AuthorizedUserContext.tsx.
 */
export function BrandedSplash({
  message,
  testID = 'branded-splash',
}: BrandedSplashProps): React.JSX.Element {
  return (
    <Theme name="legacy_dark">
      <YStack
        testID={testID}
        flex={1}
        alignItems="center"
        justifyContent="center"
        gap="$6"
        padding="$6"
        backgroundColor="#0A0F1A"
      >
        <YStack alignItems="center" gap="$4">
          {/* Gold accent rule echoing the login card's top edge */}
          <YStack
            width={48}
            height={2}
            borderRadius={2}
            backgroundColor="rgba(197,165,90,0.65)"
          />
          <BrandLogo wordmarkOnly />
          <Text
            fontFamily="$body"
            fontStyle="italic"
            fontSize={13}
            color="$textMuted"
          >
            Where history plays on.
          </Text>
        </YStack>
        <YStack alignItems="center" gap="$3">
          <Spinner size="small" color="$brandGold" />
          {message ? (
            <Text fontSize="$3" color="$textMuted">
              {message}
            </Text>
          ) : null}
        </YStack>
      </YStack>
    </Theme>
  );
}
