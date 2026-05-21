import React from 'react';
import { Platform } from 'react-native';
import { Text, YStack } from 'tamagui';

// Layered radial gradients matching --grad-hero in colors_and_type.css. Only
// applied on web — React Native does not support `backgroundImage`. Native
// consumers can layer their own LinearGradient/blur via the `backgroundNode`
// prop if desired.
const WEB_GRAD_HERO = [
  'radial-gradient(ellipse at 20% 0%, rgba(27, 58, 92, 0.22) 0%, transparent 55%)',
  'radial-gradient(ellipse at 80% 10%, rgba(196, 30, 58, 0.10) 0%, transparent 45%)',
  'radial-gradient(ellipse at 50% 90%, rgba(197, 165, 90, 0.08) 0%, transparent 50%)',
].join(', ');

const WEB_BG_STYLE: { backgroundImage: string } = {
  backgroundImage: WEB_GRAD_HERO,
};

export interface BrandHeroProps {
  /**
   * Small uppercase eyebrow above the headline (e.g. section label).
   * Pass `null` to hide.
   */
  eyebrow?: string | null;
  /**
   * Main headline. Renders in the display face at fluid display sizes.
   * Pass a string for a single-line headline, or a `ReactNode` to control
   * wrapping (e.g. with `<br />`).
   */
  headline: React.ReactNode;
  /** Optional subhead body copy. */
  subhead?: React.ReactNode;
  /** Optional action node (button group, link) rendered below the subhead. */
  action?: React.ReactNode;
  /** Outer padding around the hero content. Defaults to large. */
  padding?: '$5' | '$6' | '$7' | '$8';
  /**
   * Optional native background layer (e.g. `<LinearGradient>`) rendered behind
   * the content. On web the CSS radial gradient is used and `backgroundNode`
   * is ignored.
   */
  backgroundNode?: React.ReactNode;
}

/**
 * BrandHero — signature dark-stadium hero composition: muted radial gradient
 * background, gold eyebrow, display-face headline, editorial subhead.
 * Mirrors `docs/design/7SRWFMj3a6khIhwLuWkSKA/.../preview/brand-hero.html`
 * in the design bundle.
 */
export function BrandHero({
  eyebrow,
  headline,
  subhead,
  action,
  padding = '$7',
  backgroundNode,
}: BrandHeroProps): React.JSX.Element {
  const isWeb = Platform.OS === 'web';
  return (
    <YStack
      padding={padding}
      gap="$3"
      justifyContent="center"
      backgroundColor="$background"
      minHeight={200}
      overflow="hidden"
      style={isWeb ? WEB_BG_STYLE : undefined}
    >
      {!isWeb && backgroundNode ? (
        <YStack
          position="absolute"
          top={0}
          left={0}
          right={0}
          bottom={0}
          pointerEvents="none"
        >
          {backgroundNode}
        </YStack>
      ) : null}
      {eyebrow ? (
        <Text
          fontFamily="$heading"
          fontWeight="700"
          fontSize={12}
          letterSpacing={2.16}
          textTransform="uppercase"
          color="$brandGoldLight"
        >
          {eyebrow}
        </Text>
      ) : null}
      <Text
        fontFamily="$heading"
        fontWeight="800"
        fontSize={46}
        lineHeight={46}
        letterSpacing={-0.92}
        color="$color"
      >
        {headline}
      </Text>
      {subhead ? (
        <Text
          fontFamily="$body"
          fontSize={17}
          lineHeight={26}
          color="$textMuted"
          maxWidth={520}
        >
          {subhead}
        </Text>
      ) : null}
      {action ? <YStack marginTop="$2">{action}</YStack> : null}
    </YStack>
  );
}
