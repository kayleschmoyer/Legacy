import React from 'react';
import { Paragraph, Text, XStack, YStack } from 'tamagui';
import { ConceptTooltip } from './ConceptTooltip';
import { GameSlotsExample, SampleMatchupCard } from './OnboardingIllustrations';
import type {
  OnboardingBlock,
  OnboardingChecklistItem,
  OnboardingInline,
  OnboardingSlotId,
} from './onboardingSteps';
import { BRAND_GOLD, BRAND_NAVY, withAlpha } from '../../utils/colors';

/** Props handed to a host-supplied `renderLink` for a checklist CTA. */
export interface OnboardingLinkRenderProps {
  /** Plain path from the step content (e.g. `/baseball`). */
  href: string;
  /** Run on activation: fires `onNavigate`, then completes the tutorial. */
  onPress: () => void;
  /** The styled link label. */
  children: React.ReactNode;
}

export interface OnboardingBlocksProps {
  blocks: OnboardingBlock[];
  /** Illustration overrides; `null` hides a slot, omitted uses the default. */
  slots?: Partial<Record<OnboardingSlotId, React.ReactNode>>;
  renderLink?: (props: OnboardingLinkRenderProps) => React.ReactNode;
  /** Activates a final-step link. */
  onLinkPress: (href: string) => void;
}

function Inline({ inline }: { inline: OnboardingInline }) {
  switch (inline.type) {
    case 'text':
      return <Text>{inline.text}</Text>;
    case 'strong':
      return (
        <Text fontWeight="700" color="$brandGoldLight">
          {inline.text}
        </Text>
      );
    case 'tooltip':
      return (
        <ConceptTooltip term={inline.term} explanation={inline.explanation} />
      );
  }
}

function CalloutLink({
  link,
  renderLink,
  onLinkPress,
}: {
  link: { href: string; text: string };
  renderLink?: OnboardingBlocksProps['renderLink'];
  onLinkPress: OnboardingBlocksProps['onLinkPress'];
}) {
  const label = (
    <Text color="$brandGoldLight" fontWeight="600" fontSize={13}>
      {link.text}
    </Text>
  );
  const onPress = () => onLinkPress(link.href);
  return renderLink ? (
    renderLink({ href: link.href, onPress, children: label })
  ) : (
    <Text role="link" cursor="pointer" onPress={onPress}>
      {label}
    </Text>
  );
}

function ChecklistRow({
  item,
  renderLink,
  onLinkPress,
}: {
  item: OnboardingChecklistItem;
  renderLink?: OnboardingBlocksProps['renderLink'];
  onLinkPress: OnboardingBlocksProps['onLinkPress'];
}) {
  const { step, title, desc, link, linkText } = item;
  const label = (
    <Text color="$brandGoldLight" fontWeight="600" fontSize={13}>
      {linkText}
    </Text>
  );
  const onPress = () => onLinkPress(link ?? '');
  return (
    <XStack gap="$3" alignItems="flex-start">
      <YStack
        width={30}
        height={30}
        borderRadius={9999}
        alignItems="center"
        justifyContent="center"
        flexShrink={0}
        backgroundColor="$brandNavyLight"
      >
        <Paragraph color="$brandGoldLight" fontWeight="800" fontSize="$3">
          {step}
        </Paragraph>
      </YStack>
      <YStack flex={1} gap="$1">
        <Paragraph fontWeight="700" color="$color" fontSize="$4">
          {title}
        </Paragraph>
        <Paragraph color="$colorPress" fontSize="$3" lineHeight={20}>
          {desc}
        </Paragraph>
        {link && linkText ? (
          renderLink ? (
            renderLink({ href: link, onPress, children: label })
          ) : (
            <Text role="link" cursor="pointer" onPress={onPress}>
              {label}
            </Text>
          )
        ) : null}
      </YStack>
    </XStack>
  );
}

function Block({
  block,
  slots,
  renderLink,
  onLinkPress,
}: {
  block: OnboardingBlock;
} & Omit<OnboardingBlocksProps, 'blocks'>): React.ReactNode {
  switch (block.type) {
    case 'paragraph':
      return (
        <Paragraph
          color="$colorPress"
          fontSize={block.size === 'lg' ? '$4' : '$3'}
          lineHeight={block.size === 'lg' ? 26 : 22}
        >
          {block.inlines.map((inline, i) => (
            <Inline key={i} inline={inline} />
          ))}
        </Paragraph>
      );
    case 'callout':
      return (
        <YStack
          padding="$4"
          borderRadius="$4"
          borderWidth={1}
          borderColor={withAlpha(BRAND_GOLD, 0.3)}
          backgroundColor={withAlpha(BRAND_NAVY, 0.35)}
          gap="$2"
        >
          <Paragraph fontWeight="700" color="$brandGold" fontSize="$3">
            <Text role="img" aria-label={block.iconLabel}>
              {block.icon}
            </Text>{' '}
            {block.title}
          </Paragraph>
          <Paragraph color="$colorPress" fontSize="$3" lineHeight={22}>
            {block.body}
          </Paragraph>
          {block.link ? (
            <CalloutLink
              link={block.link}
              renderLink={renderLink}
              onLinkPress={onLinkPress}
            />
          ) : null}
        </YStack>
      );
    case 'bullets':
      return (
        <YStack gap="$2">
          {block.items.map(({ icon, text }) => (
            <XStack key={text} gap="$3" alignItems="flex-start">
              <Paragraph fontSize={18} lineHeight={22} flexShrink={0}>
                {icon}
              </Paragraph>
              <Paragraph
                color="$colorPress"
                fontSize="$3"
                lineHeight={22}
                flex={1}
              >
                {text}
              </Paragraph>
            </XStack>
          ))}
        </YStack>
      );
    case 'scoring-table':
      return (
        <YStack
          borderRadius="$5"
          borderWidth={1}
          borderColor={withAlpha(BRAND_GOLD, 0.25)}
          overflow="hidden"
        >
          <XStack
            padding="$3"
            backgroundColor="$surfaceSubtle"
            borderBottomWidth={1}
            borderBottomColor={withAlpha(BRAND_GOLD, 0.2)}
          >
            <Paragraph fontWeight="700" color="$brandGold" fontSize="$3">
              {block.title}
            </Paragraph>
          </XStack>
          <YStack padding="$2">
            {block.rows.map(({ stat, pts }) => (
              <XStack
                key={stat}
                justifyContent="space-between"
                alignItems="center"
                paddingHorizontal="$3"
                paddingVertical="$2"
              >
                <Paragraph color="$colorPress" fontSize="$3">
                  {stat}
                </Paragraph>
                <Paragraph
                  fontWeight="700"
                  fontSize="$3"
                  color={
                    pts.startsWith('+') ? '$brandGoldLight' : '$brandSeamRed'
                  }
                >
                  {pts}
                </Paragraph>
              </XStack>
            ))}
          </YStack>
        </YStack>
      );
    case 'checklist':
      return (
        <YStack gap="$3">
          {block.items.map((item) => (
            <ChecklistRow
              key={item.step}
              item={item}
              renderLink={renderLink}
              onLinkPress={onLinkPress}
            />
          ))}
        </YStack>
      );
    case 'slot': {
      const override = slots?.[block.slot];
      if (override !== undefined) return override;
      return block.slot === 'game-slots-example' ? (
        <GameSlotsExample />
      ) : (
        <SampleMatchupCard />
      );
    }
  }
}

/** Renders a step's platform-neutral content blocks with Tamagui primitives. */
export function OnboardingBlocks({
  blocks,
  slots,
  renderLink,
  onLinkPress,
}: OnboardingBlocksProps): React.JSX.Element {
  return (
    <YStack gap="$3">
      {blocks.map((block, i) => (
        <Block
          key={i}
          block={block}
          slots={slots}
          renderLink={renderLink}
          onLinkPress={onLinkPress}
        />
      ))}
    </YStack>
  );
}
