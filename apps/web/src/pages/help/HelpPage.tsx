import React, { useState } from 'react';
import {
  H1,
  H3,
  Paragraph,
  Separator,
  XStack,
  YStack,
} from '@legacy-sports/shared-components';
import { ScrollView, styled } from 'tamagui';
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

interface FaqItemProps {
  question: string;
  answer: string;
}

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

  return (
    <FaqRow>
      <FaqQuestion
        onPress={() => setOpen((v) => !v)}
        role="button"
        aria-expanded={open}
      >
        <Paragraph fontWeight="600" color="$color" flex={1}>
          {question}
        </Paragraph>
        <Paragraph
          fontSize="$5"
          color={BRAND_GOLD_LIGHT}
          lineHeight={20}
          style={
            {
              transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s',
            } as never
          }
        >
          ▾
        </Paragraph>
      </FaqQuestion>
      {open && (
        <FaqAnswer>
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

/* ─── FAQ data ─── */

const FAQ_ITEMS: FaqItemProps[] = [
  {
    question: 'How do I create a fantasy baseball league?',
    answer:
      'Navigate to Baseball → Create League from the top navigation. Fill in your league name, choose your scoring settings, and set the number of teams. Once created, you can invite others using the league invite code found in the League Settings tab.',
  },
  {
    question: 'How do I invite teammates to join my league?',
    answer:
      'Open your league page and go to the Settings tab. Copy the invite code or share the invite link directly. Players can join via Baseball → Join League and entering the code, or by clicking your shared link.',
  },
  {
    question: 'How does the draft work?',
    answer:
      'When the league commissioner starts the draft, all team managers join the Draft Board. Players are listed in order of their projected value. Each team picks in snake-draft order — the order reverses each round. The draft board live-updates so you can see picks in real time.',
  },
  {
    question: 'How is my team score calculated?',
    answer:
      "Scores are calculated from real MLB statistics pulled nightly. Each stat category (HR, RBI, AVG, etc.) is worth a set number of points defined by your league settings. You can view the exact scoring breakdown in your league's Settings tab.",
  },
  {
    question: 'How do I add or drop players?',
    answer:
      'Go to your team page and click Manage Roster. You can drop a current player and pick up a free agent in one transaction. Waiver rules (if enabled) may delay your pickup by 24–48 hours.',
  },
  {
    question: 'How do I view matchup results?',
    answer:
      'Click on your league and select the Matchups tab. Current and historical matchup scores are shown there. You can also click into any matchup for a player-by-player breakdown.',
  },
  {
    question: 'Why are my player statistics not updating?',
    answer:
      'Stats are refreshed from official MLB data sources on a schedule. During an active game day, scores typically update every 15–30 minutes. If stats appear stale after a game has ended, try refreshing the page. If the issue persists more than 24 hours, please contact support.',
  },
  {
    question: 'How do I change my display name or avatar?',
    answer:
      'Go to Profile → Settings from the user menu in the top-right corner. You can update your display name and other profile details there.',
  },
];

/* ─── Main component ─── */

export default function HelpPage() {
  return (
    <PageContainer>
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
              Find answers to common questions and learn how to get the most out
              of Legacy Sports.
            </Paragraph>
          </PageHeader>

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
                <a href="/baseball" style={{ textDecoration: 'none' }}>
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
                </a>
                <a href="/players" style={{ textDecoration: 'none' }}>
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
                </a>
                <a href="/players/stats" style={{ textDecoration: 'none' }}>
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
                </a>
                <a
                  href="/baseball/league/create"
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
                </a>
                <a href="/profile/settings" style={{ textDecoration: 'none' }}>
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
                </a>
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
              {FAQ_ITEMS.map((item) => (
                <FaqItem
                  key={item.question}
                  question={item.question}
                  answer={item.answer}
                />
              ))}
            </SectionBody>
          </SectionCard>

          {/* ── Getting started ── */}
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
              {[
                {
                  step: 1,
                  title: 'Create or join a league',
                  body: 'Head to the Baseball section and either create a new private league or join an existing one with an invite code.',
                },
                {
                  step: 2,
                  title: 'Set your roster',
                  body: 'Once the league draft is complete, review your roster and make any trades or waiver wire moves to build the best team.',
                },
                {
                  step: 3,
                  title: 'Follow the season',
                  body: 'Check your matchup score throughout the week. Real MLB stats power your fantasy team — every hit, homer, and strikeout counts.',
                },
                {
                  step: 4,
                  title: 'Win the championship',
                  body: 'Manage your roster actively through the season, make smart trades, and outlast your league-mates in the playoffs.',
                },
              ].map(({ step, title, body }) => (
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
                <ContactOption
                  icon="🐛"
                  iconLabel="bug"
                  title="Report a Bug"
                  description="Found something broken? Open a GitHub issue and we'll prioritize a fix."
                  href="https://github.com/bbarclay/legacy-sports/issues/new?labels=bug&template=bug_report.md"
                />
                <ContactOption
                  icon="💡"
                  iconLabel="idea"
                  title="Suggest a Feature"
                  description="Have an idea that would make Legacy Sports better? We'd love to hear it."
                  href="https://github.com/bbarclay/legacy-sports/issues/new?labels=enhancement&template=feature_request.md"
                />
                <ContactOption
                  icon="💬"
                  iconLabel="discussion"
                  title="Community Discussions"
                  description="Chat with other managers, share tips, and get advice from the community."
                  href="https://github.com/bbarclay/legacy-sports/discussions"
                />
              </YStack>

              <Separator marginVertical="$2" />

              <YStack
                padding="$4"
                borderRadius="$4"
                style={
                  { backgroundColor: withAlpha(BRAND_SEAM_RED, 0.06) } as never
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
                  open a GitHub issue tagged{' '}
                  <Paragraph
                    tag="span"
                    fontFamily="$mono"
                    color={BRAND_GOLD_LIGHT}
                  >
                    urgent
                  </Paragraph>{' '}
                  and we'll respond as soon as possible.
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
  );
}
