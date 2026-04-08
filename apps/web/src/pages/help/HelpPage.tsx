import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Button,
  H1,
  H3,
  Paragraph,
  Separator,
  XStack,
  YStack,
} from '@legacy-sports/shared-components/ui';
import { ScrollView, styled } from 'tamagui';
import {
  DISCORD_URL,
  HELP_CONTACT_ITEMS,
  HELP_FAQ_ITEMS,
  HELP_GETTING_STARTED_STEPS,
  HELP_HISTORICAL_FAQ_ITEMS,
  type HelpFaqItem,
} from '@legacy-sports/utils/help-content';
import { OnboardingTutorial } from '../../components/onboarding';
import { PageMeta } from '../../components/PageMeta';
import {
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED,
  withAlpha,
} from '../../constants/colors';

/* ─── Styled Components ─── */

const PageContainer = styled(YStack, {
  flex: 1,
  minHeight: '100vh',
  backgroundColor: '$background',
  paddingBottom: '$10',
});

const ContentContainer = styled(YStack, {
  maxWidth: 860,
  width: '100%',
  alignSelf: 'center',
  paddingHorizontal: '$5',
  gap: '$6',
  $sm: {
    paddingHorizontal: '$3',
    gap: '$4',
  },
});

const PageHeader = styled(YStack, {
  paddingVertical: '$8',
  gap: '$2',
  $sm: {
    paddingVertical: '$6',
  },
});

const SectionCard = styled(YStack, {
  borderRadius: '$6',
  borderWidth: 1,
  borderColor: '$glassBorder',
  overflow: 'hidden',
});

const SectionHeader = styled(XStack, {
  paddingHorizontal: '$5',
  paddingVertical: '$4',
  alignItems: 'center',
  gap: '$3',
  borderBottomWidth: 1,
  borderBottomColor: '$glassBorder',
});

const SectionIconBox = styled(YStack, {
  width: 36,
  height: 36,
  borderRadius: '$4',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '$color2',
});

const SectionBody = styled(YStack, {
  padding: '$5',
  gap: '$4',
  $sm: {
    padding: '$4',
  },
});

/* ─── FAQ accordion item ─── */

type FaqItemProps = HelpFaqItem;

const FaqRow = styled(YStack, {
  borderRadius: '$4',
  borderWidth: 1,
  borderColor: '$glassBorder',
  overflow: 'hidden',
  cursor: 'pointer' as never,
});

const FaqQuestion = styled(XStack, {
  paddingHorizontal: '$4',
  paddingVertical: '$4',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '$3',
  hoverStyle: {
    backgroundColor: '$color2',
  },
  animation: 'quick',
});

const FaqAnswer = styled(YStack, {
  paddingHorizontal: '$4',
  paddingVertical: '$4',
  borderTopWidth: 1,
  borderTopColor: '$glassBorder',
});

function FaqItem({ question, answer }: FaqItemProps) {
  const [open, setOpen] = useState(false);
  // Generate a stable ID from the question text for aria-controls
  const faqId = `faq-${question
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 40)}`;

  return (
    <FaqRow>
      <FaqQuestion
        onPress={() => setOpen((v) => !v)}
        role="button"
        aria-expanded={open}
        aria-controls={faqId}
      >
        <Paragraph fontWeight="600" color="$color" flex={1}>
          {question}
        </Paragraph>
        <span
          aria-hidden="true"
          style={{
            display: 'inline-flex',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}
        >
          <Paragraph fontSize="$5" color={BRAND_GOLD_LIGHT} lineHeight={20}>
            ▾
          </Paragraph>
        </span>
      </FaqQuestion>
      {open && (
        <FaqAnswer id={faqId} role="region" aria-label={question}>
          <Paragraph color="$colorPress" lineHeight={24}>
            {answer}
          </Paragraph>
        </FaqAnswer>
      )}
    </FaqRow>
  );
}

/* ─── Contact card ─── */

const ContactCard = styled(YStack, {
  borderRadius: '$5',
  borderWidth: 1,
  padding: '$4',
  gap: '$2',
  animation: 'quick',
  hoverStyle: {
    borderColor: BRAND_NAVY_LIGHT,
    backgroundColor: '$color2',
  },
});

interface ContactOptionProps {
  icon: string;
  iconLabel: string;
  title: string;
  description: string;
  href?: string;
}

function ContactOption({
  icon,
  iconLabel,
  title,
  description,
  href,
}: ContactOptionProps) {
  return (
    <ContactCard
      borderColor="$glassBorder"
      onPress={
        href
          ? () => window.open(href, '_blank', 'noopener,noreferrer')
          : undefined
      }
      cursor={href ? ('pointer' as never) : undefined}
    >
      <XStack alignItems="center" gap="$3">
        <YStack
          width={40}
          height={40}
          borderRadius="$4"
          alignItems="center"
          justifyContent="center"
          style={
            {
              background: `linear-gradient(135deg, ${BRAND_NAVY_LIGHT} 0%, #3a5a9c 100%)`,
            } as never
          }
        >
          <Paragraph fontSize={20} lineHeight={22}>
            <span role="img" aria-label={iconLabel}>
              {icon}
            </span>
          </Paragraph>
        </YStack>
        <YStack flex={1} gap="$1">
          <Paragraph fontWeight="700" color={BRAND_GOLD} fontSize="$4">
            {title}
          </Paragraph>
          <Paragraph color="$colorPress" fontSize="$3" lineHeight={20}>
            {description}
          </Paragraph>
        </YStack>
      </XStack>
    </ContactCard>
  );
}

/* ─── Quick-link chip ─── */

const QuickLinkChip = styled(XStack, {
  alignItems: 'center',
  gap: '$2',
  paddingHorizontal: '$4',
  paddingVertical: '$3',
  borderRadius: '$10',
  borderWidth: 1,
  borderColor: '$glassBorder',
  cursor: 'pointer' as never,
  animation: 'quick',
  hoverStyle: {
    borderColor: BRAND_NAVY_LIGHT,
    backgroundColor: withAlpha(BRAND_NAVY_LIGHT, 0.12),
  },
  pressStyle: {
    scale: 0.97,
  },
});

/* ─── FAQ data (imported from @legacy-sports/utils) ─── */

/* ─── Main component ─── */

export default function HelpPage() {
  const [tutorialOpen, setTutorialOpen] = useState(false);

  return (
    <>
      {tutorialOpen && (
        <OnboardingTutorial onClose={() => setTutorialOpen(false)} />
      )}
      <PageContainer>
        <PageMeta
          title="Help & Support"
          description="Get help with Legacy Sports fantasy baseball. Browse FAQs, scoring guides, draft rules, and support topics."
        />
        <ScrollView>
          <ContentContainer>
            {/* ── Page header ── */}
            <PageHeader>
              <H1 color={BRAND_GOLD}>
                <span role="img" aria-label="help">
                  🆘
                </span>{' '}
                Help &amp; Support
              </H1>
              <Paragraph color="$colorPress" fontSize="$5" lineHeight={28}>
                Find answers to common questions and learn how to get the most
                out of Legacy Sports.
              </Paragraph>
            </PageHeader>

            {/* ── Tutorial launcher ── */}
            <SectionCard>
              <SectionHeader>
                <SectionIconBox>
                  <Paragraph fontSize={18} lineHeight={20}>
                    <span role="img" aria-label="book">
                      📖
                    </span>
                  </Paragraph>
                </SectionIconBox>
                <YStack flex={1} gap="$1">
                  <H3 color="$color">New to Legacy Sports?</H3>
                  <Paragraph color="$colorPress" fontSize="$3" lineHeight={20}>
                    Take the interactive tutorial to learn how historical-stats
                    scoring, season assignment, and game selection work.
                  </Paragraph>
                </YStack>
              </SectionHeader>
              <SectionBody>
                <XStack
                  alignItems="center"
                  justifyContent="space-between"
                  flexWrap="wrap"
                  gap="$3"
                >
                  <Paragraph
                    color="$colorPress"
                    fontSize="$3"
                    lineHeight={22}
                    flex={1}
                    minWidth={200}
                  >
                    Our 6-step walkthrough covers the unique historical game
                    mechanic — from archived box scores to sample matchups. Runs
                    in under 2 minutes.
                  </Paragraph>
                  <Button
                    size="$4"
                    borderRadius="$6"
                    fontWeight="700"
                    backgroundColor="transparent"
                    onPress={() => setTutorialOpen(true)}
                    style={
                      {
                        background: `linear-gradient(135deg, ${BRAND_NAVY_LIGHT} 0%, #C41E3A 100%)`,
                        color: '#fff',
                        border: 'none',
                      } as never
                    }
                    hoverStyle={{ opacity: 0.9 }}
                  >
                    <span role="img" aria-label="rocket">
                      🚀
                    </span>{' '}
                    Launch Tutorial
                  </Button>
                </XStack>
              </SectionBody>
            </SectionCard>

            {/* ── Quick links ── */}
            <SectionCard>
              <SectionHeader>
                <SectionIconBox>
                  <Paragraph fontSize={18} lineHeight={20}>
                    <span role="img" aria-label="link">
                      🔗
                    </span>
                  </Paragraph>
                </SectionIconBox>
                <H3 color="$color">Quick Links</H3>
              </SectionHeader>
              <SectionBody>
                <XStack flexWrap="wrap" gap="$3">
                  <Link to="/baseball" style={{ textDecoration: 'none' }}>
                    <QuickLinkChip>
                      <Paragraph fontSize={16} lineHeight={18}>
                        <span role="img" aria-label="baseball">
                          ⚾
                        </span>
                      </Paragraph>
                      <Paragraph color="$color" fontWeight="500" fontSize="$3">
                        My Leagues
                      </Paragraph>
                    </QuickLinkChip>
                  </Link>
                  <Link to="/players" style={{ textDecoration: 'none' }}>
                    <QuickLinkChip>
                      <Paragraph fontSize={16} lineHeight={18}>
                        <span role="img" aria-label="players">
                          👥
                        </span>
                      </Paragraph>
                      <Paragraph color="$color" fontWeight="500" fontSize="$3">
                        Players
                      </Paragraph>
                    </QuickLinkChip>
                  </Link>
                  <Link to="/players/stats" style={{ textDecoration: 'none' }}>
                    <QuickLinkChip>
                      <Paragraph fontSize={16} lineHeight={18}>
                        <span role="img" aria-label="statistics">
                          📊
                        </span>
                      </Paragraph>
                      <Paragraph color="$color" fontWeight="500" fontSize="$3">
                        Player Stats
                      </Paragraph>
                    </QuickLinkChip>
                  </Link>
                  <Link
                    to="/baseball/league/create"
                    style={{ textDecoration: 'none' }}
                  >
                    <QuickLinkChip>
                      <Paragraph fontSize={16} lineHeight={18}>
                        <span role="img" aria-label="create league">
                          ➕
                        </span>
                      </Paragraph>
                      <Paragraph color="$color" fontWeight="500" fontSize="$3">
                        Create League
                      </Paragraph>
                    </QuickLinkChip>
                  </Link>
                  <Link
                    to="/profile/settings"
                    style={{ textDecoration: 'none' }}
                  >
                    <QuickLinkChip>
                      <Paragraph fontSize={16} lineHeight={18}>
                        <span role="img" aria-label="settings">
                          ⚙️
                        </span>
                      </Paragraph>
                      <Paragraph color="$color" fontWeight="500" fontSize="$3">
                        Profile Settings
                      </Paragraph>
                    </QuickLinkChip>
                  </Link>
                </XStack>
              </SectionBody>
            </SectionCard>

            {/* ── FAQ ── */}
            <SectionCard>
              <SectionHeader>
                <SectionIconBox>
                  <Paragraph fontSize={18} lineHeight={20}>
                    <span role="img" aria-label="frequently asked questions">
                      ❓
                    </span>
                  </Paragraph>
                </SectionIconBox>
                <H3 color="$color">Frequently Asked Questions</H3>
              </SectionHeader>
              <SectionBody>
                {HELP_FAQ_ITEMS.map((item) => (
                  <FaqItem
                    key={item.question}
                    question={item.question}
                    answer={item.answer}
                  />
                ))}
              </SectionBody>
            </SectionCard>

            {/* ── Historical Stats FAQ ── */}
            <SectionCard>
              <SectionHeader>
                <SectionIconBox>
                  <Paragraph fontSize={18} lineHeight={20}>
                    <span role="img" aria-label="historical stats">
                      📜
                    </span>
                  </Paragraph>
                </SectionIconBox>
                <YStack flex={1} gap="$1">
                  <H3 color="$color">Historical Stats — How It Works</H3>
                  <Paragraph color="$colorPress" fontSize="$3" lineHeight={20}>
                    Unique to Legacy Sports — answers to common questions about
                    our historical-stats game mechanic.
                  </Paragraph>
                </YStack>
              </SectionHeader>
              <SectionBody>
                {HELP_HISTORICAL_FAQ_ITEMS.map((item) => (
                  <FaqItem
                    key={item.question}
                    question={item.question}
                    answer={item.answer}
                  />
                ))}
              </SectionBody>
            </SectionCard>

            <SectionCard>
              <SectionHeader>
                <SectionIconBox>
                  <Paragraph fontSize={18} lineHeight={20}>
                    <span role="img" aria-label="rocket">
                      🚀
                    </span>
                  </Paragraph>
                </SectionIconBox>
                <H3 color="$color">Getting Started</H3>
              </SectionHeader>
              <SectionBody gap="$5">
                {HELP_GETTING_STARTED_STEPS.map(({ step, title, body }) => (
                  <XStack key={step} gap="$4" alignItems="flex-start">
                    <YStack
                      width={32}
                      height={32}
                      borderRadius="$10"
                      alignItems="center"
                      justifyContent="center"
                      flexShrink={0}
                      style={
                        {
                          background: `linear-gradient(135deg, ${BRAND_NAVY_LIGHT} 0%, #3a5a9c 100%)`,
                        } as never
                      }
                    >
                      <Paragraph
                        color={BRAND_GOLD_LIGHT}
                        fontWeight="700"
                        fontSize="$3"
                      >
                        {step}
                      </Paragraph>
                    </YStack>
                    <YStack flex={1} gap="$1">
                      <Paragraph fontWeight="700" color="$color" fontSize="$4">
                        {title}
                      </Paragraph>
                      <Paragraph color="$colorPress" lineHeight={22}>
                        {body}
                      </Paragraph>
                    </YStack>
                  </XStack>
                ))}
              </SectionBody>
            </SectionCard>

            {/* ── Contact & support ── */}
            <SectionCard>
              <SectionHeader>
                <SectionIconBox>
                  <Paragraph fontSize={18} lineHeight={20}>
                    <span role="img" aria-label="contact">
                      📬
                    </span>
                  </Paragraph>
                </SectionIconBox>
                <H3 color="$color">Contact &amp; Support</H3>
              </SectionHeader>
              <SectionBody>
                <YStack gap="$3">
                  {HELP_CONTACT_ITEMS.map((item) => (
                    <ContactOption
                      key={item.title}
                      icon={item.icon}
                      iconLabel={item.title.toLowerCase()}
                      title={item.title}
                      description={item.description}
                      href={item.url}
                    />
                  ))}
                </YStack>

                <Separator marginVertical="$2" />

                <YStack
                  padding="$4"
                  borderRadius="$4"
                  style={
                    {
                      backgroundColor: withAlpha(BRAND_SEAM_RED, 0.06),
                    } as never
                  }
                  borderWidth={1}
                  borderColor={withAlpha(BRAND_SEAM_RED, 0.2)}
                  gap="$2"
                >
                  <Paragraph
                    fontWeight="700"
                    color={BRAND_SEAM_RED}
                    fontSize="$3"
                  >
                    <span role="img" aria-label="urgent">
                      🚨
                    </span>{' '}
                    Urgent account issues?
                  </Paragraph>
                  <Paragraph color="$colorPress" fontSize="$3" lineHeight={20}>
                    For account access problems or missed draft notifications,
                    join our{' '}
                    <a
                      href={DISCORD_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: BRAND_GOLD_LIGHT, fontWeight: 600 }}
                    >
                      Discord server
                    </a>{' '}
                    and post in #urgent-support — we respond much faster there.
                  </Paragraph>
                </YStack>
              </SectionBody>
            </SectionCard>

            {/* ── Footer note ── */}
            <YStack alignItems="center" paddingVertical="$4" gap="$1">
              <Paragraph color="$gray10" fontSize="$3" textAlign="center">
                © {new Date().getFullYear()} Legacy Sports · Fantasy Baseball
                Management
              </Paragraph>
              <Paragraph color="$gray10" fontSize="$2" textAlign="center">
                Powered by official MLB statistics • Data refreshed throughout
                each game day
              </Paragraph>
            </YStack>
          </ContentContainer>
        </ScrollView>
      </PageContainer>
    </>
  );
}
