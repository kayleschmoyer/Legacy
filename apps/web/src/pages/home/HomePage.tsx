import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  H1,
  H2,
  H3,
  Paragraph,
  XStack,
  YStack,
} from '@legacy-sports/shared-components';
import { ScrollView, Separator, styled, Text, H2 as TH2 } from 'tamagui';
import { OnboardingTutorial } from '../../components/onboarding';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { PageMeta } from '../../components/PageMeta';
import { OnThisDayFeed } from '../../features/baseball';
import {
  BG_DARK,
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  BRAND_NAVY_DARK,
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED,
  GREEN_DEEP,
  withAlpha,
} from '../../constants/colors';

/* ─── Styled Components ─── */

const PageContainer = styled(YStack, {
  flex: 1,
  minHeight: '100vh',
  backgroundColor: '$background',
  paddingBottom: '$8',
});

const ContentContainer = styled(YStack, {
  maxWidth: 1280,
  width: '100%',
  alignSelf: 'center',
  paddingHorizontal: '$4',
  gap: '$8',
  $sm: {
    paddingHorizontal: '$3',
    gap: '$6',
  },
});

const HeroSection = styled(YStack, {
  position: 'relative',
  overflow: 'hidden',
  paddingVertical: '$10',
  paddingHorizontal: '$6',
  alignItems: 'center',
  gap: '$5',
  $sm: {
    paddingVertical: '$7',
    paddingHorizontal: '$4',
  },
});

const HeroBadge = styled(XStack, {
  alignItems: 'center',
  gap: '$2',
  paddingHorizontal: '$4',
  paddingVertical: '$1.5',
  borderRadius: '$10',
  backgroundColor: '$surfaceInteractive',
  borderWidth: 1,
  borderColor: '$accentMuted',
  animation: 'medium',
  enterStyle: { opacity: 0, y: -10 },
});

const SportCard = styled(YStack, {
  position: 'relative',
  overflow: 'hidden',
  borderRadius: '$7',
  borderWidth: 1,
  borderColor: '$glassBorder',
  padding: '$6',
  gap: '$4',
  cursor: 'pointer',
  animation: 'medium',
  hoverStyle: {
    borderColor: '$glassBorderHover',
    transform: 'translateY(-4px)',
  },
  pressStyle: {
    scale: 0.98,
    borderColor: '$borderColorFocus',
  },
  $sm: {
    padding: '$4',
  },
});

const SportIcon = styled(YStack, {
  width: 56,
  height: 56,
  borderRadius: '$5',
  alignItems: 'center',
  justifyContent: 'center',
});

const FeatureCard = styled(YStack, {
  flex: 1,
  minWidth: 220,
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
    padding: '$4',
  },
});

const FeatureIconCircle = styled(YStack, {
  width: 44,
  height: 44,
  borderRadius: 9999,
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '$surfaceInteractive',
  borderWidth: 1,
  borderColor: '$accentMuted',
});

const ActionButton = styled(Button, {
  borderRadius: '$6',
  height: '$5',
  fontSize: '$3',
  fontWeight: '700',
  paddingHorizontal: '$5',
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
  backgroundColor: '$surfaceInteractive',
  borderColor: '$accentMuted',
  borderWidth: 1,
  color: BRAND_GOLD_LIGHT,
  hoverStyle: {
    backgroundColor: '$accentMuted',
    borderColor: '$borderColorFocus',
  },
  pressStyle: {
    backgroundColor: '$accentMuted',
  },
});

const SectionTitle = styled(TH2, {
  fontSize: '$9',
  fontWeight: '700',
  color: '$color',
});

/* ─── Page Background ─── */

const pageBackgroundStyle: React.CSSProperties = {
  background: `
    radial-gradient(ellipse at 20% 0%, ${withAlpha(BRAND_NAVY, 0.18)} 0%, transparent 50%),
    radial-gradient(ellipse at 80% 10%, ${withAlpha(BRAND_SEAM_RED, 0.1)} 0%, transparent 45%),
    radial-gradient(ellipse at 50% 90%, ${withAlpha(BRAND_GOLD, 0.08)} 0%, transparent 50%)
  `,
  backgroundAttachment: 'fixed',
};

const heroGradientStyle: React.CSSProperties = {
  background: `linear-gradient(180deg, ${withAlpha(BRAND_NAVY, 0.15)} 0%, transparent 70%)`,
};

const sportCardGlassStyle = (accentColor: string): React.CSSProperties => ({
  background: `linear-gradient(135deg, ${withAlpha(BG_DARK, 0.85)} 0%, ${accentColor} 100%)`,
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
});

const featureCardGlassStyle: React.CSSProperties = {
  background: `linear-gradient(135deg, ${withAlpha(BG_DARK, 0.72)} 0%, ${withAlpha(BRAND_NAVY, 0.35)} 100%)`,
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
};

/* ─── Sport Config ─── */

interface SportConfig {
  key: string;
  emoji: string;
  emojiLabel: string;
  title: string;
  description: string;
  route: string;
  accent: string;
  available: boolean;
}

const SPORTS: SportConfig[] = [
  {
    key: 'baseball',
    emoji: '⚾',
    emojiLabel: 'baseball',
    title: 'Baseball',
    description:
      'Build your roster, dominate the draft, and track real-time stats across every matchup.',
    route: '/baseball',
    accent: withAlpha(BRAND_NAVY, 0.55),
    available: true,
  },
  {
    key: 'football',
    emoji: '🏈',
    emojiLabel: 'football',
    title: 'Football',
    description:
      'Manage lineups, trade players, and lead your team through every game week.',
    route: '/football',
    accent: withAlpha(GREEN_DEEP, 0.35),
    available: true,
  },
];

const FEATURES = [
  {
    emoji: '📊',
    label: 'stats',
    title: 'Live Stats',
    description:
      'Real-time player statistics, projections, and performance trends.',
  },
  {
    emoji: '🏆',
    label: 'draft',
    title: 'Draft Tools',
    description:
      'Snake and auction drafts with smart rankings and position analysis.',
  },
  {
    emoji: '⚡',
    label: 'realtime',
    title: 'Instant Updates',
    description:
      'WebSocket-powered live scoring and lineup lock notifications.',
  },
  {
    emoji: '🔒',
    label: 'secure',
    title: 'Secure Leagues',
    description:
      'Private invite codes, commissioner controls, and fair waiver rules.',
  },
];

/**
 * Home Page — Landing page for the web application.
 *
 * Modernized with gradient backgrounds, glassmorphism cards,
 * and entrance animations for a polished user experience.
 */
export function HomePage(): React.JSX.Element {
  const navigate = useNavigate();
  const [onboardingComplete, setOnboardingComplete] = useLocalStorage<boolean>(
    'ls_onboarding_complete',
    false,
  );
  const [tutorialOpen, setTutorialOpen] = useState(false);

  // Auto-show tutorial once for first-time visitors.
  useEffect(() => {
    if (!onboardingComplete) {
      setTutorialOpen(true);
    }
  }, [onboardingComplete]);

  const handleTutorialClose = () => {
    setTutorialOpen(false);
    setOnboardingComplete(true);
  };

  return (
    <>
      {tutorialOpen && <OnboardingTutorial onClose={handleTutorialClose} />}
      <ScrollView>
        <PageMeta
          title="Fantasy Baseball League Manager"
          description="Manage your fantasy baseball leagues, draft players, track live stats, and compete with friends on Legacy Sports."
        />
        <PageContainer style={pageBackgroundStyle}>
          {/* ─── Hero ─── */}
          <HeroSection style={heroGradientStyle}>
            <HeroBadge>
              <Text fontSize="$2" fontWeight="600" color={BRAND_GOLD_LIGHT}>
                {new Date().getFullYear()} Season
              </Text>
            </HeroBadge>

            <H1
              fontSize="$12"
              fontWeight="800"
              color="$color"
              textAlign="center"
              letterSpacing={-0.5}
              animation="medium"
              enterStyle={{ opacity: 0, y: 20 }}
              $sm={{ fontSize: '$10' }}
            >
              Legacy Sports
            </H1>

            <Paragraph
              fontSize="$6"
              color="$textMuted"
              textAlign="center"
              maxWidth={560}
              lineHeight="$7"
              animation="medium"
              enterStyle={{ opacity: 0, y: 15 }}
            >
              Your all-in-one fantasy sports platform — draft, manage, and
              compete with friends across every season.
            </Paragraph>

            <XStack
              gap="$3"
              marginTop="$2"
              flexWrap="wrap"
              justifyContent="center"
              animation="medium"
              enterStyle={{ opacity: 0, y: 10 }}
            >
              <ActionButton
                onPress={() => {
                  navigate('/baseball');
                }}
                accessibilityLabel="Get started with baseball"
              >
                <Text fontWeight="700">Get Started</Text>
              </ActionButton>
              <OutlineButton
                onPress={() => {
                  navigate('/players/stats');
                }}
                accessibilityLabel="Browse player statistics"
              >
                <Text fontWeight="700">Browse Stats</Text>
              </OutlineButton>
              <OutlineButton
                onPress={() => setTutorialOpen(true)}
                accessibilityLabel="How historical stats work — open tutorial"
              >
                <Text fontWeight="700">
                  <span role="img" aria-label="open book">
                    📖
                  </span>{' '}
                  How It Works
                </Text>
              </OutlineButton>
            </XStack>
          </HeroSection>

          <ContentContainer>
            {/* ─── Sports ─── */}
            <YStack gap="$5">
              <YStack gap="$2">
                <SectionTitle>Choose Your Sport</SectionTitle>
                <Paragraph fontSize="$4" color="$textMuted" maxWidth={480}>
                  Jump into a sport to manage leagues, run drafts, and track
                  your teams.
                </Paragraph>
              </YStack>

              <XStack gap="$5" flexWrap="wrap">
                {SPORTS.map((sport) => (
                  <SportCard
                    key={sport.key}
                    flex={1}
                    minWidth={300}
                    style={sportCardGlassStyle(sport.accent)}
                    onPress={() => {
                      navigate(sport.route);
                    }}
                    accessibilityLabel={`Navigate to ${sport.title}`}
                    role="link"
                  >
                    <XStack gap="$4" alignItems="center">
                      <SportIcon
                        style={{
                          background: `linear-gradient(135deg, ${sport.accent}, ${withAlpha(BRAND_NAVY_LIGHT, 0.08)})`,
                        }}
                      >
                        <Text fontSize="$8">
                          <span role="img" aria-label={sport.emojiLabel}>
                            {sport.emoji}
                          </span>
                        </Text>
                      </SportIcon>
                      <YStack gap="$1" flex={1}>
                        <H3 fontSize="$8" fontWeight="700" color="$color">
                          {sport.title}
                        </H3>
                        {!sport.available && (
                          <Text
                            fontSize="$2"
                            color="$amber9"
                            fontWeight="600"
                            textTransform="uppercase"
                            letterSpacing={0.5}
                          >
                            Coming Soon
                          </Text>
                        )}
                      </YStack>
                    </XStack>

                    <Paragraph
                      fontSize="$4"
                      color="$glassTextSubdued"
                      lineHeight="$5"
                    >
                      {sport.description}
                    </Paragraph>

                    <XStack gap="$3" marginTop="$1">
                      <ActionButton
                        size="$3"
                        onPress={() => {
                          navigate(sport.route);
                        }}
                      >
                        <Text fontWeight="700">View Leagues</Text>
                      </ActionButton>
                      {sport.key === 'baseball' && (
                        <OutlineButton
                          size="$3"
                          onPress={() => {
                            navigate('/baseball/league/create');
                          }}
                        >
                          <Text fontWeight="700">Create League</Text>
                        </OutlineButton>
                      )}
                    </XStack>
                  </SportCard>
                ))}
              </XStack>
            </YStack>

            <Separator backgroundColor="$glassBorder" />

            {/* ─── Features ─── */}
            <YStack gap="$5">
              <YStack gap="$2">
                <SectionTitle>Platform Features</SectionTitle>
                <Paragraph fontSize="$4" color="$textMuted" maxWidth={480}>
                  Everything you need to run a competitive fantasy league.
                </Paragraph>
              </YStack>

              <XStack gap="$4" flexWrap="wrap">
                {FEATURES.map((feature) => (
                  <FeatureCard
                    key={feature.label}
                    style={featureCardGlassStyle}
                  >
                    <FeatureIconCircle>
                      <Text fontSize="$5">
                        <span role="img" aria-label={feature.label}>
                          {feature.emoji}
                        </span>
                      </Text>
                    </FeatureIconCircle>
                    <H3 fontSize="$6" fontWeight="700" color="$color">
                      {feature.title}
                    </H3>
                    <Paragraph
                      fontSize="$3"
                      color="$glassTextSubdued"
                      lineHeight="$4"
                    >
                      {feature.description}
                    </Paragraph>
                  </FeatureCard>
                ))}
              </XStack>
            </YStack>

            {/* ─── On This Day ─── */}
            <YStack gap="$5">
              <YStack gap="$2">
                <SectionTitle>On This Day in Baseball</SectionTitle>
                <Paragraph fontSize="$4" color="$textMuted" maxWidth={500}>
                  Historic performances from today's date across every season in
                  the database — see which players you manage made history.
                </Paragraph>
              </YStack>
              <OnThisDayFeed />
            </YStack>

            {/* ─── Stats CTA ─── */}
            <YStack
              borderRadius="$7"
              borderWidth={1}
              borderColor="$glassBorder"
              padding="$7"
              gap="$4"
              alignItems="center"
              animation="medium"
              hoverStyle={{
                borderColor: '$glassBorderHover',
              }}
              style={{
                background: `linear-gradient(135deg, ${withAlpha(BRAND_NAVY, 0.25)} 0%, ${withAlpha(BG_DARK, 0.85)} 100%)`,
                backdropFilter: 'blur(18px)',
                WebkitBackdropFilter: 'blur(18px)',
              }}
            >
              <Text fontSize="$9">
                <span role="img" aria-label="chart">
                  📊
                </span>
              </Text>
              <H2
                fontSize="$8"
                fontWeight="700"
                color="$color"
                textAlign="center"
              >
                Explore Player Statistics
              </H2>
              <Paragraph
                fontSize="$4"
                color="$textMuted"
                textAlign="center"
                maxWidth={500}
              >
                Dive into batting averages, ERA, touchdowns, and more. Make
                data-driven decisions for your next trade or waiver pickup.
              </Paragraph>
              <ActionButton
                marginTop="$2"
                onPress={() => {
                  navigate('/players/stats');
                }}
              >
                <Text fontWeight="700">View All Stats</Text>
              </ActionButton>
            </YStack>
          </ContentContainer>
        </PageContainer>
      </ScrollView>
    </>
  );
}

export default HomePage;
