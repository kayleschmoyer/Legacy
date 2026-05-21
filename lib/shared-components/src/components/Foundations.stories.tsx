import type { Meta, StoryObj } from '@storybook/react';
import { Text, XStack, YStack } from 'tamagui';
import {
  FONT_BODY,
  FONT_DISPLAY,
  FONT_MONO,
  TABULAR_NUMS,
  TYPE_BODY,
  TYPE_DISPLAY,
  TYPE_SCORE,
} from '../utils/typography';

const meta: Meta = {
  title: 'Foundations/Tokens',
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj;

const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <Text
    fontFamily="$heading"
    fontSize={11}
    fontWeight="700"
    letterSpacing={1.4}
    textTransform="uppercase"
    color="$textMuted"
  >
    {children}
  </Text>
);

const Swatch = ({
  name,
  hex,
  fg = '#fff',
}: {
  name: string;
  hex: string;
  fg?: string;
}) => (
  <YStack
    width={140}
    height={92}
    borderRadius={12}
    padding="$3"
    backgroundColor={hex}
    justifyContent="space-between"
    borderWidth={1}
    borderColor="rgba(255,255,255,0.06)"
  >
    <Text
      fontFamily="$heading"
      fontSize={12}
      fontWeight="800"
      letterSpacing={0.6}
      color={fg}
    >
      {name}
    </Text>
    <Text fontFamily="$mono" fontSize={11} color={fg}>
      {hex}
    </Text>
  </YStack>
);

export const Colors: Story = {
  render: () => (
    <YStack gap="$5">
      <YStack gap="$2">
        <Eyebrow>Heritage anchors</Eyebrow>
        <XStack gap="$2" flexWrap="wrap">
          <Swatch name="Brand Navy" hex="#1B3A5C" />
          <Swatch name="Seam Red" hex="#C41E3A" />
          <Swatch name="Aged Gold" hex="#C5A55A" fg="#1A1206" />
        </XStack>
      </YStack>

      <YStack gap="$2">
        <Eyebrow>Night stadium surfaces</Eyebrow>
        <XStack gap="$2" flexWrap="wrap">
          <Swatch name="Page bg" hex="#0A0F1A" />
          <Swatch name="Surface subtle" hex="#0D1526" />
          <Swatch name="Panel" hex="#111B2F" />
          <Swatch name="Card" hex="#16223A" />
          <Swatch name="Raised" hex="#1C2A47" />
        </XStack>
      </YStack>

      <YStack gap="$2">
        <Eyebrow>Position colors</Eyebrow>
        <XStack gap="$2" flexWrap="wrap">
          <Swatch name="P · Pitcher" hex="#C41E3A" />
          <Swatch name="C · Catcher" hex="#7C8794" />
          <Swatch name="IF · Infield" hex="#8B6F47" />
          <Swatch name="OF · Outfield" hex="#2D6A4F" />
          <Swatch name="U · Utility" hex="#C5A55A" fg="#1A1206" />
        </XStack>
      </YStack>

      <YStack gap="$2">
        <Eyebrow>Status</Eyebrow>
        <XStack gap="$2" flexWrap="wrap">
          <Swatch name="Success" hex="#4AAE7C" />
          <Swatch name="Warning" hex="#C89452" />
          <Swatch name="Danger" hex="#C23E54" />
          <Swatch name="Info" hex="#5B84C4" />
        </XStack>
      </YStack>
    </YStack>
  ),
};

const Tag = ({
  children,
  width = 72,
}: {
  children: string;
  width?: number;
}) => (
  <Text
    fontFamily={FONT_MONO}
    fontSize={11}
    color="$textMuted"
    width={width}
    flexShrink={0}
  >
    {children}
  </Text>
);

export const Typography: Story = {
  render: () => (
    <YStack gap="$4" maxWidth={680}>
      <Eyebrow>Display · Big Shoulders Display</Eyebrow>
      <Text
        fontFamily={FONT_DISPLAY}
        fontWeight="800"
        fontSize={64}
        letterSpacing={-0.02}
        color="$color12"
        lineHeight={1.05}
      >
        Build Your Dynasty.
      </Text>
      <Text
        fontFamily={FONT_DISPLAY}
        fontWeight="800"
        fontSize={36}
        letterSpacing={-0.01}
        color="$color12"
      >
        Pick your sport
      </Text>

      <Eyebrow>Body · Literata</Eyebrow>
      <Text
        fontFamily={FONT_BODY}
        fontSize={18}
        lineHeight={1.6}
        color="$color"
      >
        The only fantasy baseball platform powered by real MLB history — draft
        legends across every era and compete on archived statistics.
      </Text>
      <Text fontFamily={FONT_BODY} fontSize={14} color="$textMuted">
        12 teams · Week 14/22 · Draft: Fri Apr 12 · 8:00 PM
      </Text>

      <Eyebrow>Score · Big Shoulders 800 · tabular-nums</Eyebrow>
      <XStack gap="$4" alignItems="baseline">
        <Text
          fontFamily={FONT_DISPLAY}
          fontWeight="800"
          fontSize={48}
          color="$color12"
          {...TABULAR_NUMS}
        >
          127.5
        </Text>
        <Text
          fontFamily={FONT_DISPLAY}
          fontWeight="800"
          fontSize={48}
          color="$brandGold"
          {...TABULAR_NUMS}
        >
          110.2
        </Text>
      </XStack>

      <Eyebrow>Mono · JetBrains Mono</Eyebrow>
      <Text fontFamily={FONT_MONO} fontSize={13} color="$color">
        AVG .342 · OBP .442 · SLG .697 · OPS 1.139
      </Text>
    </YStack>
  ),
};

// Mirrors docs/design/7SRWFMj3a6khIhwLuWkSKA/.../preview/type-display.html
export const TypographyDisplay: Story = {
  render: () => (
    <YStack gap="$3" maxWidth={680}>
      <XStack alignItems="baseline" gap="$3">
        <Tag>H1 / 48</Tag>
        <Text {...TYPE_DISPLAY.h1} color="$color12">
          Build Your Dynasty
        </Text>
      </XStack>
      <XStack alignItems="baseline" gap="$3">
        <Tag>H2 / 36</Tag>
        <Text {...TYPE_DISPLAY.h2} color="$color12">
          Everything you need to win
        </Text>
      </XStack>
      <XStack alignItems="baseline" gap="$3">
        <Tag>H3 / 28</Tag>
        <Text {...TYPE_DISPLAY.h3} color="$color12">
          Your Leagues
        </Text>
      </XStack>
      <XStack alignItems="baseline" gap="$3">
        <Tag>H4 / 22</Tag>
        <Text {...TYPE_DISPLAY.h4} color="$color12">
          Dead Ball Dynasty
        </Text>
      </XStack>
    </YStack>
  ),
};

// Mirrors docs/design/7SRWFMj3a6khIhwLuWkSKA/.../preview/type-body.html
export const TypographyBody: Story = {
  render: () => (
    <YStack gap="$3" maxWidth={680}>
      <XStack alignItems="baseline" gap="$3">
        <Tag>LEDE / 18</Tag>
        <Text {...TYPE_BODY.lede} color="$color11">
          The only fantasy baseball platform powered by real MLB history.
        </Text>
      </XStack>
      <XStack alignItems="baseline" gap="$3">
        <Tag>BODY / 16</Tag>
        <Text {...TYPE_BODY.body} color="$color11">
          Draft legends across every era and compete on archived statistics.
        </Text>
      </XStack>
      <XStack alignItems="baseline" gap="$3">
        <Tag>CAPTION / 14</Tag>
        <Text {...TYPE_BODY.caption} color="$textMuted">
          Week 14/22 · 12 teams · Draft: Fri Apr 12
        </Text>
      </XStack>
      <XStack alignItems="baseline" gap="$3">
        <Tag>EYEBROW / 12</Tag>
        <Text {...TYPE_BODY.eyebrow} color="$textMuted">
          Features · All Sports
        </Text>
      </XStack>
    </YStack>
  ),
};

// Mirrors docs/design/7SRWFMj3a6khIhwLuWkSKA/.../preview/type-score.html
export const TypographyScore: Story = {
  render: () => (
    <XStack gap="$7" alignItems="flex-end">
      <YStack alignItems="center" gap="$1">
        <Text {...TYPE_SCORE.lg} color="$color12" {...TABULAR_NUMS}>
          127.5
        </Text>
        <Text {...TYPE_BODY.eyebrow} color="$textMuted">
          Score / 64
        </Text>
      </YStack>
      <YStack alignItems="center" gap="$1">
        <Text {...TYPE_SCORE.md} color="$color12" {...TABULAR_NUMS}>
          8–4
        </Text>
        <Text {...TYPE_BODY.eyebrow} color="$textMuted">
          Record / 36
        </Text>
      </YStack>
      <YStack alignItems="center" gap="$1">
        <Text {...TYPE_SCORE.teamAbbr} color="$color12">
          NYY
        </Text>
        <Text {...TYPE_BODY.eyebrow} color="$textMuted">
          Team Abbr
        </Text>
      </YStack>
      <YStack alignItems="center" gap="$1">
        <Text
          fontFamily={FONT_MONO}
          fontSize={16}
          color="$color11"
          {...TABULAR_NUMS}
        >
          .327 · 42 HR
        </Text>
        <Text {...TYPE_BODY.eyebrow} color="$textMuted">
          Mono Stats
        </Text>
      </YStack>
    </XStack>
  ),
};

// Mirrors docs/design/7SRWFMj3a6khIhwLuWkSKA/.../preview/components-typography.html
export const TypographyComponents: Story = {
  render: () => {
    const Row = ({
      tag,
      children,
    }: {
      tag: string;
      children: React.ReactNode;
    }) => (
      <XStack
        alignItems="baseline"
        gap="$5"
        paddingBottom="$3"
        borderBottomWidth={1}
        borderBottomColor="$outlineSubtle"
      >
        <Tag width={84}>{tag}</Tag>
        <YStack flex={1}>{children}</YStack>
      </XStack>
    );
    return (
      <YStack gap="$3" maxWidth={680}>
        <Row tag="H1">
          <Text {...TYPE_DISPLAY.h1} color="$color12">
            Build Your Dynasty.
          </Text>
        </Row>
        <Row tag="H2">
          <Text {...TYPE_DISPLAY.h2} color="$color11">
            Everything you need to win
          </Text>
        </Row>
        <Row tag="H3">
          <Text {...TYPE_DISPLAY.h3} color="$color11">
            Live Stats
          </Text>
        </Row>
        <Row tag="H4">
          <Text {...TYPE_DISPLAY.h4} color="$color11">
            Draft Live · Round 7
          </Text>
        </Row>
        <Row tag="Paragraph">
          <Text {...TYPE_BODY.body} color="$color11">
            Draft legends across every era and compete on real archived
            statistics. The only fantasy baseball platform powered by real MLB
            history.
          </Text>
        </Row>
        <Row tag="Text · md">
          <Text {...TYPE_BODY.body} color="$color">
            Inline body label — used for table cells, captions, list items.
          </Text>
        </Row>
        <Row tag="Text · sm">
          <Text {...TYPE_BODY.caption} color="$textMuted">
            Quiet metadata · 1927 · NYY · 60 HR
          </Text>
        </Row>
        <Row tag="Text · italic">
          <Text {...TYPE_BODY.body} color="$color11" fontStyle="italic">
            "Quietly excited about the history of the sport."
          </Text>
        </Row>
      </YStack>
    );
  },
};

export const Radii: Story = {
  render: () => (
    <YStack gap="$3">
      <Eyebrow>Radii</Eyebrow>
      <XStack gap="$3" flexWrap="wrap">
        {[
          { label: 'inline 4', r: 4 },
          { label: 'input 6', r: 6 },
          { label: 'badge 8', r: 8 },
          { label: 'button 12', r: 12 },
          { label: 'card 16', r: 16 },
          { label: 'panel 20', r: 20 },
          { label: 'hero 24', r: 24 },
          { label: 'pill ∞', r: 9999 },
        ].map((it) => (
          <YStack
            key={it.label}
            width={120}
            height={84}
            borderRadius={Math.min(it.r, 9999)}
            backgroundColor="$brandNavy"
            borderWidth={1}
            borderColor="$brandNavyLight"
            alignItems="center"
            justifyContent="center"
          >
            <Text fontFamily="$mono" fontSize={11} color="$color12">
              {it.label}
            </Text>
          </YStack>
        ))}
      </XStack>
    </YStack>
  ),
};

export const Spacing: Story = {
  render: () => (
    <YStack gap="$3">
      <Eyebrow>Spacing scale (px)</Eyebrow>
      <YStack gap="$2">
        {[4, 8, 12, 16, 20, 24, 32, 40, 56, 72].map((px) => (
          <XStack key={px} alignItems="center" gap="$3">
            <Text
              fontFamily="$mono"
              fontSize={12}
              color="$textMuted"
              width={48}
            >
              {px}px
            </Text>
            <YStack
              height={12}
              width={px}
              backgroundColor="$brandGold"
              borderRadius={6}
            />
          </XStack>
        ))}
      </YStack>
    </YStack>
  ),
};
