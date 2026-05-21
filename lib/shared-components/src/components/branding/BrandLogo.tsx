import React from 'react';
import { LOGGER } from '@legacy-sports/logging';
import { Image, Text, XStack, YStack } from 'tamagui';

type BrandLogoBaseProps = {
  /** Wordmark text. Defaults to "LEGACY SPORTS". */
  wordmark?: string;
  /** Accessible label for the logo image. */
  alt?: string;
};

type BrandLogoWithMarkProps = BrandLogoBaseProps & {
  /** Source URL for the logo mark image. */
  src: string;
  /** Pixel height of the logo mark. Width scales to preserve aspect. */
  size?: number;
  /** Italic tagline shown beneath the wordmark. Pass `null` to hide. */
  tagline?: string | null;
  wordmarkOnly?: false;
};

type BrandLogoWordmarkOnlyProps = BrandLogoBaseProps & {
  /** Render the wordmark only — no mark image, no tagline. */
  wordmarkOnly: true;
  src?: never;
  size?: never;
  tagline?: never;
};

export type BrandLogoProps =
  | BrandLogoWithMarkProps
  | BrandLogoWordmarkOnlyProps;

/**
 * BrandLogo — primary Legacy Sports lockup: mark + condensed gold wordmark
 * + italic tagline. Mirrors `docs/design/7SRWFMj3a6khIhwLuWkSKA/.../preview/brand-logo.html`
 * in the design bundle.
 */
export function BrandLogo(props: BrandLogoProps): React.JSX.Element | null {
  const wordmark = props.wordmark ?? 'LEGACY SPORTS';
  if (props.wordmarkOnly) {
    return (
      <Text
        fontFamily="$heading"
        fontWeight="800"
        fontSize={26}
        letterSpacing={0.5}
        color="$brandGoldLight"
        lineHeight={26}
      >
        {wordmark}
      </Text>
    );
  }

  if (!props.src) {
    LOGGER.error(
      'BrandLogo: `src` is required unless `wordmarkOnly` is true; rendering null.',
    );
    return null;
  }

  const {
    src,
    size = 52,
    tagline = 'Where history plays on.',
    alt = 'Legacy Sports',
  } = props;
  return (
    <XStack alignItems="center" gap="$3">
      <Image
        source={{ uri: src }}
        height={size}
        width={size}
        accessibilityLabel={alt}
        resizeMode="contain"
      />
      <YStack gap={2}>
        <Text
          fontFamily="$heading"
          fontWeight="800"
          fontSize={26}
          letterSpacing={0.5}
          color="$brandGoldLight"
          lineHeight={26}
        >
          {wordmark}
        </Text>
        {tagline ? (
          <Text
            fontFamily="$body"
            fontStyle="italic"
            fontSize={13}
            color="$textMuted"
          >
            {tagline}
          </Text>
        ) : null}
      </YStack>
    </XStack>
  );
}
