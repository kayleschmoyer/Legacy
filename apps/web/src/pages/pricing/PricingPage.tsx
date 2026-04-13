import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  H1,
  H2,
  H3,
  Paragraph,
  XStack,
  YStack,
} from '@legacy-sports/shared-components/ui';
import { ScrollView, Separator, styled, Text } from 'tamagui';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Star,
  X,
  Zap,
} from '@tamagui/lucide-icons';
import { PageMeta } from '../../components/PageMeta';
import {
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  BRAND_NAVY_DARK,
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED,
  SURFACE_PANEL,
  withAlpha,
} from '../../constants/colors';
import { useStripePrices } from '../../hooks/useStripePrices';

/* ─── Styled Components ─── */

const PageContainer = styled(YStack, {
  flex: 1,
  minHeight: '100vh',
  backgroundColor: '$background',
  paddingBottom: '$12',
});

const ContentContainer = styled(YStack, {
  maxWidth: 1100,
  width: '100%',
  alignSelf: 'center',
  paddingHorizontal: '$5',
  gap: '$10',
  $sm: {
    paddingHorizontal: '$3',
    gap: '$7',
  },
});

const HeroSection = styled(YStack, {
  paddingTop: '$10',
  paddingBottom: '$6',
  alignItems: 'center',
  gap: '$4',
  $sm: {
    paddingTop: '$7',
  },
});

const PlanBadge = styled(XStack, {
  alignItems: 'center',
  gap: '$2',
  paddingHorizontal: '$4',
  paddingVertical: '$2',
  borderRadius: '$10',
  backgroundColor: '$surfaceInteractive',
  borderWidth: 1,
  borderColor: '$accentMuted',
  animation: 'medium',
  enterStyle: { opacity: 0, y: -10 },
});

const ToggleContainer = styled(XStack, {
  alignItems: 'center',
  gap: '$3',
  backgroundColor: '$background',
  borderRadius: '$8',
  borderWidth: 1,
  borderColor: '$borderColor',
  padding: '$1.5',
});

const ToggleOption = styled(XStack, {
  paddingHorizontal: '$4',
  paddingVertical: '$2',
  borderRadius: '$6',
  alignItems: 'center',
  gap: '$2',
  cursor: 'pointer',
  animation: 'fast',
  variants: {
    active: {
      true: {
        backgroundColor: BRAND_NAVY_LIGHT,
      },
      false: {
        backgroundColor: 'transparent',
      },
    } as const,
  },
});

const PlansRow = styled(XStack, {
  gap: '$5',
  flexWrap: 'wrap',
  justifyContent: 'center',
  $sm: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
});

const PlanCard = styled(YStack, {
  flex: 1,
  minWidth: 300,
  maxWidth: 420,
  borderRadius: '$7',
  borderWidth: 1,
  borderColor: '$glassBorder',
  padding: '$7',
  gap: '$5',
  animation: 'medium',
  hoverStyle: {
    borderColor: '$glassBorderHover',
    transform: 'translateY(-4px)',
  },
  $sm: {
    minWidth: '100%',
    padding: '$5',
  },
  variants: {
    premium: {
      true: {
        borderWidth: 2,
      },
    } as const,
  },
});

const PlanHeader = styled(YStack, {
  gap: '$3',
});

const PriceRow = styled(XStack, {
  alignItems: 'flex-end',
  gap: '$1',
});

const FeatureRow = styled(XStack, {
  alignItems: 'center',
  gap: '$3',
  paddingVertical: '$1.5',
});

const ActionButton = styled(Button, {
  borderRadius: '$6',
  height: '$5',
  fontSize: '$3',
  fontWeight: '700',
  paddingHorizontal: '$5',
  whiteSpace: 'nowrap',
  backgroundColor: BRAND_NAVY_LIGHT,
  color: '$color1',
  borderColor: 'transparent',
  hoverStyle: {
    backgroundColor: BRAND_NAVY,
    transform: 'translateY(-1px)',
  },
  pressStyle: {
    backgroundColor: BRAND_NAVY_DARK,
  },
});

const OutlineButton = styled(Button, {
  borderRadius: '$6',
  height: '$5',
  fontSize: '$3',
  fontWeight: '700',
  paddingHorizontal: '$5',
  backgroundColor: 'transparent',
  borderColor: '$borderColor',
  borderWidth: 1,
  color: '$color',
  hoverStyle: {
    backgroundColor: '$surfaceInteractive',
    borderColor: '$glassBorderHover',
  },
  pressStyle: {
    backgroundColor: '$surfaceInteractive',
  },
});

const SectionHeader = styled(YStack, {
  alignItems: 'center',
  gap: '$3',
  marginBottom: '$2',
});

const ComparisonTable = styled(YStack, {
  borderRadius: '$6',
  borderWidth: 1,
  borderColor: '$borderColor',
  overflow: 'hidden',
  width: '100%',
});

const TableRow = styled(XStack, {
  borderBottomWidth: 1,
  borderBottomColor: '$borderColor',
  paddingVertical: '$3',
  paddingHorizontal: '$5',
  alignItems: 'center',
  width: '100%',
  variants: {
    header: {
      true: {
        backgroundColor: '$surfaceInteractive',
        paddingVertical: '$4',
      },
    },
    even: {
      true: {
        backgroundColor: '$background',
      },
      false: {
        backgroundColor: '$backgroundHover',
      },
    } as const,
    last: {
      true: {
        borderBottomWidth: 0,
      },
    } as const,
  },
});

const TableCell = styled(XStack, {
  flex: 1,
  minWidth: 0,
  alignItems: 'center',
  justifyContent: 'center',
});

const TableFeatureCell = styled(YStack, {
  flex: 2,
  minWidth: 0,
  justifyContent: 'center',
});

const FAQItem = styled(YStack, {
  borderRadius: '$5',
  borderWidth: 1,
  borderColor: '$borderColor',
  overflow: 'hidden',
  animation: 'medium',
});

const FAQQuestion = styled(XStack, {
  padding: '$5',
  alignItems: 'center',
  justifyContent: 'space-between',
  cursor: 'pointer',
  animation: 'fast',
  hoverStyle: {
    backgroundColor: '$surfaceInteractive',
  },
});

const FAQAnswer = styled(YStack, {
  paddingTop: '$4',
  paddingHorizontal: '$5',
  paddingBottom: '$5',
  gap: '$2',
});

const TestimonialCard = styled(YStack, {
  flex: 1,
  minWidth: 260,
  borderRadius: '$6',
  borderWidth: 1,
  borderColor: '$glassBorder',
  padding: '$5',
  gap: '$3',
  animation: 'medium',
  hoverStyle: {
    borderColor: '$glassBorderHover',
    transform: 'translateY(-2px)',
  },
  $sm: {
    minWidth: '100%',
  },
});

const DiscountBadge = styled(XStack, {
  alignItems: 'center',
  gap: '$1',
  paddingHorizontal: '$2.5',
  paddingVertical: '$1',
  borderRadius: '$4',
  backgroundColor: withAlpha(BRAND_SEAM_RED, 0.15),
  borderWidth: 1,
  borderColor: withAlpha(BRAND_SEAM_RED, 0.3),
});

/* ─── Data ─── */

const FREE_FEATURES = [
  { label: '3 leagues', included: true },
  { label: 'Basic stats', included: true },
  { label: 'Standard waivers', included: true },
  { label: '4-team playoffs', included: true },
  { label: 'Modern era only', included: true },
  { label: '2 mock drafts/week', included: true },
  { label: 'Unlimited leagues', included: false },
  { label: 'Player comparison', included: false },
  { label: 'Advanced projections', included: false },
  { label: 'AI-powered recaps', included: false },
  { label: 'Salary cap leagues', included: false },
  { label: 'FAAB waivers', included: false },
  { label: 'All playoff formats', included: false },
  { label: 'All historical eras', included: false },
  { label: 'Unlimited mock drafts', included: false },
  { label: 'Draft recommendations', included: false },
];

const PREMIUM_FEATURES = [
  { label: 'Unlimited leagues', included: true },
  { label: 'Basic stats', included: true },
  { label: 'FAAB & standard waivers', included: true },
  { label: 'All playoff formats', included: true },
  { label: 'All historical eras', included: true },
  { label: 'Unlimited mock drafts', included: true },
  { label: 'Player comparison', included: true },
  { label: 'Advanced projections', included: true },
  { label: 'AI-powered recaps', included: true },
  { label: 'Salary cap leagues', included: true },
  { label: 'Draft recommendations', included: true },
];

const COMPARISON_ROWS = [
  { feature: 'Leagues', free: '3 max', premium: 'Unlimited' },
  { feature: 'Stats', free: 'Basic', premium: 'Advanced + Projections' },
  { feature: 'Waiver system', free: 'Standard', premium: 'Standard + FAAB' },
  { feature: 'Playoff formats', free: '4-team only', premium: 'All formats' },
  { feature: 'Historical eras', free: 'Modern era', premium: 'All eras' },
  { feature: 'Mock drafts / week', free: '2', premium: 'Unlimited' },
  { feature: 'Player comparison', free: false, premium: true },
  { feature: 'Draft recommendations', free: false, premium: true },
  { feature: 'AI-powered recaps', free: false, premium: true },
  { feature: 'Salary cap leagues', free: false, premium: true },
];

const FAQ_ITEMS = [
  {
    question: 'Can I try Premium before committing?',
    answer:
      'We offer a 14-day free trial for Premium. No credit card required to get started.',
  },
  {
    question: 'What happens to my leagues if I downgrade?',
    answer:
      'Your existing leagues remain active. If you have more than 3 leagues, they become read-only until you reduce to 3 or reactivate Premium.',
  },
  {
    question: 'Is the annual plan billed upfront?',
    answer:
      'Yes, the annual plan is billed once per year. You can cancel at any time and keep Premium access until your billing period ends.',
  },
  {
    question: 'What payment methods do you accept?',
    answer:
      'We accept all major credit and debit cards (Visa, Mastercard, Amex) through our secure payment processor.',
  },
  {
    question: 'Can I use Premium features across all my leagues?',
    answer:
      'Yes! Premium unlocks features across all your leagues — salary cap, FAAB waivers, all playoff formats, and more — everywhere.',
  },
];

const TESTIMONIALS = [
  {
    quote:
      'The salary cap leagues are a game changer. Way more strategy than standard snake drafts. Totally worth Premium.',
    author: 'Marcus K.',
    meta: 'Commissioner, Dynasty Baseball',
  },
  {
    quote:
      'Draft recommendations helped me snag three sleepers in the final rounds. Finished in first place my first year.',
    author: 'Sarah M.',
    meta: 'Legacy Sports Premium User',
  },
  {
    quote:
      'The AI recap after each matchup is hilarious and spot-on. My league chat loves them. Could not go back to free.',
    author: 'Tom R.',
    meta: 'Playing since 2022',
  },
];

/* ─── Component ─── */

export default function PricingPage() {
  const navigate = useNavigate();
  const [isAnnual, setIsAnnual] = useState(true);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const prices = useStripePrices();
  const monthlyPrice = prices.monthlyPrice;
  const annualTotal = prices.annualTotal.toFixed(2);
  // Derive per-month cost from annualTotal so display always matches the billed amount.
  const annualMonthlyPrice = prices.annualTotal / 12;
  const ANNUAL_SAVINGS_PCT = prices.annualSavingsPct;

  const pageBackground: React.CSSProperties = {
    background: `
      radial-gradient(ellipse at 20% 0%, ${withAlpha(BRAND_NAVY, 0.15)} 0%, transparent 50%),
      radial-gradient(ellipse at 80% 20%, ${withAlpha(BRAND_GOLD, 0.06)} 0%, transparent 45%)
    `,
    backgroundAttachment: 'fixed',
  };

  const premiumCardStyle: React.CSSProperties = {
    background: `linear-gradient(135deg, ${withAlpha(BRAND_NAVY_LIGHT, 0.18)} 0%, ${SURFACE_PANEL} 100%)`,
    borderColor: BRAND_NAVY_LIGHT,
  };

  return (
    <PageContainer style={pageBackground}>
      <PageMeta
        title="Pricing"
        description="Choose the Legacy Sports plan that fits your fantasy baseball ambitions. Free forever or upgrade to Premium for unlimited leagues, AI recaps, salary cap leagues, draft recommendations, and more."
      />
      <ScrollView>
        <ContentContainer>
          {/* ── Hero ── */}
          <HeroSection>
            <PlanBadge>
              <Zap size={14} color={BRAND_GOLD_LIGHT} />
              <Paragraph
                size="$2"
                fontWeight="600"
                color={BRAND_GOLD_LIGHT}
                marginBottom={0}
              >
                Simple, transparent pricing
              </Paragraph>
            </PlanBadge>

            <H1
              textAlign="center"
              fontSize="$10"
              fontWeight="800"
              $sm={{ fontSize: '$8' }}
            >
              The plan that fits your{' '}
              <Text color={BRAND_GOLD} fontWeight="800">
                game
              </Text>
            </H1>

            <Paragraph
              textAlign="center"
              size="$5"
              color="$gray11"
              maxWidth={540}
              $sm={{ size: '$4' }}
            >
              Start free and play as long as you want. Upgrade to Premium when
              you&apos;re ready for the full experience.
            </Paragraph>

            {/* Billing toggle */}
            <ToggleContainer>
              <ToggleOption
                active={!isAnnual}
                onPress={() => setIsAnnual(false)}
              >
                <Paragraph
                  marginBottom={0}
                  fontWeight="600"
                  color={!isAnnual ? BRAND_GOLD_LIGHT : '$color11'}
                  size="$3"
                >
                  Monthly
                </Paragraph>
              </ToggleOption>
              <ToggleOption active={isAnnual} onPress={() => setIsAnnual(true)}>
                <Paragraph
                  marginBottom={0}
                  fontWeight="600"
                  color={isAnnual ? BRAND_GOLD_LIGHT : '$color11'}
                  size="$3"
                >
                  Annual
                </Paragraph>
                <DiscountBadge>
                  <Paragraph
                    marginBottom={0}
                    size="$1"
                    fontWeight="700"
                    color={BRAND_SEAM_RED}
                  >
                    Save {ANNUAL_SAVINGS_PCT}
                  </Paragraph>
                </DiscountBadge>
              </ToggleOption>
            </ToggleContainer>
          </HeroSection>

          {/* ── Plan Cards ── */}
          <PlansRow>
            {/* Free plan */}
            <PlanCard>
              <PlanHeader>
                <Paragraph
                  size="$3"
                  fontWeight="700"
                  color="$gray11"
                  marginBottom={0}
                >
                  FREE
                </Paragraph>
                <H2 fontSize="$9" fontWeight="800" marginBottom={0}>
                  $0
                </H2>
                <Paragraph color="$gray11" marginBottom={0}>
                  Forever free. No credit card needed.
                </Paragraph>
              </PlanHeader>

              <OutlineButton onPress={() => navigate('/')}>
                Get Started Free
              </OutlineButton>

              <Separator />

              <YStack gap="$1">
                {FREE_FEATURES.filter((f) => f.included).map((f) => (
                  <FeatureRow key={f.label}>
                    <YStack
                      width={20}
                      height={20}
                      borderRadius={10}
                      backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.2)}
                      alignItems="center"
                      justifyContent="center"
                      flexShrink={0}
                    >
                      <Check size={12} color={BRAND_GOLD_LIGHT} />
                    </YStack>
                    <Paragraph size="$3" marginBottom={0}>
                      {f.label}
                    </Paragraph>
                  </FeatureRow>
                ))}
              </YStack>
            </PlanCard>

            {/* Premium plan */}
            <PlanCard premium style={premiumCardStyle}>
              <PlanHeader>
                <XStack alignItems="center" justifyContent="space-between">
                  <Paragraph
                    size="$3"
                    fontWeight="700"
                    color={BRAND_GOLD_LIGHT}
                    marginBottom={0}
                  >
                    PREMIUM
                  </Paragraph>
                  <XStack
                    alignItems="center"
                    gap="$1"
                    paddingHorizontal="$3"
                    paddingVertical="$1"
                    borderRadius="$4"
                    backgroundColor={withAlpha(BRAND_GOLD, 0.15)}
                    borderWidth={1}
                    borderColor={withAlpha(BRAND_GOLD, 0.3)}
                  >
                    <Star size={12} color={BRAND_GOLD} fill={BRAND_GOLD} />
                    <Paragraph
                      size="$1"
                      fontWeight="700"
                      color={BRAND_GOLD}
                      marginBottom={0}
                    >
                      Most Popular
                    </Paragraph>
                  </XStack>
                </XStack>

                <PriceRow>
                  <H2
                    fontSize="$10"
                    fontWeight="800"
                    marginBottom={0}
                    color={BRAND_GOLD}
                  >
                    $
                    {isAnnual
                      ? annualMonthlyPrice.toFixed(2)
                      : monthlyPrice.toFixed(2)}
                  </H2>
                  <Paragraph color="$gray11" marginBottom={4}>
                    /mo
                  </Paragraph>
                </PriceRow>

                {isAnnual ? (
                  <Paragraph size="$2" color="$gray11" marginBottom={0}>
                    Billed annually (${annualTotal}/yr) — save{' '}
                    {ANNUAL_SAVINGS_PCT} vs monthly
                  </Paragraph>
                ) : (
                  <Paragraph size="$2" color="$gray11" marginBottom={0}>
                    Billed monthly. Switch to annual and save{' '}
                    {ANNUAL_SAVINGS_PCT}.
                  </Paragraph>
                )}
              </PlanHeader>

              <ActionButton onPress={() => navigate('/profile/subscription')}>
                Upgrade to Premium
              </ActionButton>

              <Separator />

              <YStack gap="$1">
                {PREMIUM_FEATURES.map((f) => (
                  <FeatureRow key={f.label}>
                    <YStack
                      width={20}
                      height={20}
                      borderRadius={10}
                      backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.25)}
                      alignItems="center"
                      justifyContent="center"
                      flexShrink={0}
                    >
                      <Check size={12} color={BRAND_GOLD_LIGHT} />
                    </YStack>
                    <Paragraph size="$3" marginBottom={0}>
                      {f.label}
                    </Paragraph>
                  </FeatureRow>
                ))}
              </YStack>
            </PlanCard>
          </PlansRow>

          {/* ── Feature Comparison Table ── */}
          <YStack gap="$5" width="100%">
            <SectionHeader>
              <H2 textAlign="center" fontWeight="700">
                Compare plans
              </H2>
              <Paragraph textAlign="center" color="$gray11">
                Everything you get on Free vs Premium, side by side.
              </Paragraph>
            </SectionHeader>

            <ComparisonTable>
              {/* Header */}
              <TableRow header>
                <TableFeatureCell>
                  <Paragraph size="$3" fontWeight="700" marginBottom={0}>
                    Feature
                  </Paragraph>
                </TableFeatureCell>
                <TableCell>
                  <Paragraph
                    size="$3"
                    fontWeight="700"
                    textAlign="center"
                    marginBottom={0}
                  >
                    Free
                  </Paragraph>
                </TableCell>
                <TableCell>
                  <Paragraph
                    size="$3"
                    fontWeight="700"
                    color={BRAND_GOLD_LIGHT}
                    textAlign="center"
                    marginBottom={0}
                  >
                    Premium
                  </Paragraph>
                </TableCell>
              </TableRow>

              {COMPARISON_ROWS.map((row, i) => (
                <TableRow
                  key={row.feature}
                  even={i % 2 === 0}
                  last={i === COMPARISON_ROWS.length - 1}
                >
                  <TableFeatureCell>
                    <Paragraph size="$3" marginBottom={0}>
                      {row.feature}
                    </Paragraph>
                  </TableFeatureCell>
                  <TableCell>
                    {typeof row.free === 'boolean' ? (
                      row.free ? (
                        <Check size={16} color={BRAND_GOLD_LIGHT} />
                      ) : (
                        <X size={16} color="$gray9" />
                      )
                    ) : (
                      <Paragraph size="$3" textAlign="center" marginBottom={0}>
                        {row.free}
                      </Paragraph>
                    )}
                  </TableCell>
                  <TableCell>
                    {typeof row.premium === 'boolean' ? (
                      row.premium ? (
                        <Check size={16} color={BRAND_GOLD_LIGHT} />
                      ) : (
                        <X size={16} color="$gray9" />
                      )
                    ) : (
                      <Paragraph
                        size="$3"
                        textAlign="center"
                        fontWeight="600"
                        color={BRAND_GOLD_LIGHT}
                        marginBottom={0}
                      >
                        {row.premium}
                      </Paragraph>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </ComparisonTable>
          </YStack>

          {/* ── Testimonials ── */}
          <YStack gap="$5">
            <SectionHeader>
              <H2 textAlign="center" fontWeight="700">
                What commissioners are saying
              </H2>
              <Paragraph textAlign="center" color="$gray11">
                Real feedback from the Legacy Sports community.
              </Paragraph>
            </SectionHeader>

            <XStack gap="$4" flexWrap="wrap" justifyContent="center">
              {TESTIMONIALS.map((t) => (
                <TestimonialCard key={t.author}>
                  <XStack gap="$0.5">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <Star
                        key={i}
                        size={14}
                        color={BRAND_GOLD}
                        fill={BRAND_GOLD}
                      />
                    ))}
                  </XStack>
                  <Paragraph
                    size="$3"
                    color="$gray11"
                    fontStyle="italic"
                    marginBottom={0}
                  >
                    &ldquo;{t.quote}&rdquo;
                  </Paragraph>
                  <YStack gap="$0.5">
                    <Paragraph size="$3" fontWeight="700" marginBottom={0}>
                      {t.author}
                    </Paragraph>
                    <Paragraph size="$2" color="$gray10" marginBottom={0}>
                      {t.meta}
                    </Paragraph>
                  </YStack>
                </TestimonialCard>
              ))}
            </XStack>
          </YStack>

          {/* ── FAQ ── */}
          <YStack gap="$5">
            <SectionHeader>
              <H2 textAlign="center" fontWeight="700">
                Frequently asked questions
              </H2>
              <Paragraph textAlign="center" color="$gray11">
                Still have questions?{' '}
                <Text
                  color={BRAND_GOLD_LIGHT}
                  cursor="pointer"
                  onPress={() => navigate('/help')}
                  hoverStyle={{ color: BRAND_GOLD }}
                >
                  Visit our Help Center
                </Text>
              </Paragraph>
            </SectionHeader>

            <YStack gap="$3" maxWidth={720} alignSelf="center" width="100%">
              {FAQ_ITEMS.map((item, i) => (
                <FAQItem key={i}>
                  <FAQQuestion
                    onPress={() => setOpenFaq(openFaq === i ? null : i)}
                  >
                    <H3
                      fontSize="$4"
                      fontWeight="600"
                      marginBottom={0}
                      flex={1}
                    >
                      {item.question}
                    </H3>
                    {openFaq === i ? (
                      <ChevronUp size={18} color="$gray11" flexShrink={0} />
                    ) : (
                      <ChevronDown size={18} color="$gray11" flexShrink={0} />
                    )}
                  </FAQQuestion>
                  {openFaq === i && (
                    <FAQAnswer>
                      <Paragraph size="$3" color="$gray11" marginBottom={0}>
                        {item.answer}
                      </Paragraph>
                    </FAQAnswer>
                  )}
                </FAQItem>
              ))}
            </YStack>
          </YStack>

          {/* ── Bottom CTA ── */}
          <YStack
            alignItems="center"
            gap="$5"
            paddingVertical="$8"
            paddingHorizontal="$6"
            borderRadius="$7"
            borderWidth={1}
            borderColor="$glassBorder"
            style={{
              background: `linear-gradient(135deg, ${withAlpha(BRAND_NAVY_LIGHT, 0.15)} 0%, ${SURFACE_PANEL} 100%)`,
            }}
          >
            <H2
              textAlign="center"
              fontWeight="800"
              fontSize="$8"
              $sm={{ fontSize: '$7' }}
            >
              Ready to level up your league?
            </H2>
            <Paragraph
              textAlign="center"
              size="$4"
              color="$gray11"
              maxWidth={500}
            >
              Join thousands of commissioners who trust Legacy Sports for their
              fantasy baseball experience.
            </Paragraph>
            <XStack gap="$4" flexWrap="wrap" justifyContent="center">
              <ActionButton
                onPress={() => navigate('/profile/subscription')}
                minWidth={200}
              >
                Upgrade to Premium
              </ActionButton>
              <OutlineButton onPress={() => navigate('/')} width={180}>
                Get Started Free
              </OutlineButton>
            </XStack>
          </YStack>
        </ContentContainer>
      </ScrollView>
    </PageContainer>
  );
}
