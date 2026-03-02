import React from 'react';
import {
  Button,
  H2,
  Paragraph,
  XStack,
  YStack,
} from '@legacy-sports/shared-components';
import { ConceptTooltip } from './ConceptTooltip';
import {
  BG_DARK,
  BRAND_GOLD,
  BRAND_GOLD_DARK,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED,
  withAlpha,
} from '../../constants/colors';

interface OnboardingTutorialProps {
  /** Called when the user completes or explicitly skips the tutorial */
  onClose: () => void;
}

/* ─── Step definitions ──────────────────────────────────── */

interface TutorialStep {
  id: string;
  emoji: string;
  emojiLabel: string;
  title: string;
  body: React.ReactNode;
  accentColor: string;
}

const STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    emoji: '⚾',
    emojiLabel: 'baseball',
    title: 'Welcome to Legacy Sports',
    accentColor: BRAND_NAVY_LIGHT,
    body: (
      <YStack gap="$3">
        <Paragraph color="$colorPress" fontSize="$4" lineHeight={26}>
          Legacy Sports is a{' '}
          <strong style={{ color: BRAND_GOLD_LIGHT }}>
            historical fantasy baseball
          </strong>{' '}
          platform — the only fantasy league powered entirely by{' '}
          <ConceptTooltip
            term="archived box scores"
            explanation="Real MLB box score data from past seasons, used as the statistical source for your fantasy team's weekly scores."
          />{' '}
          from real MLB seasons.
        </Paragraph>
        <Paragraph color="$colorPress" fontSize="$4" lineHeight={26}>
          Unlike live fantasy leagues, every matchup is scored from completed,
          verified statistics — no luck of the daily schedule, just pure
          historical knowledge.
        </Paragraph>
        <YStack
          padding="$4"
          borderRadius="$4"
          borderWidth={1}
          borderColor={withAlpha(BRAND_GOLD, 0.3)}
          style={{
            background: withAlpha(BRAND_NAVY, 0.35),
          }}
          gap="$2"
        >
          <Paragraph fontWeight="700" color={BRAND_GOLD} fontSize="$3">
            <span role="img" aria-label="light bulb">
              💡
            </span>{' '}
            Why does this matter?
          </Paragraph>
          <Paragraph color="$colorPress" fontSize="$3" lineHeight={22}>
            Build rosters that span generations—imagine Babe Ruth batting
            alongside Ken Griffey Jr. The fun is mixing legends from different
            eras and seeing how history&apos;s greatest players stack up.
          </Paragraph>
        </YStack>
      </YStack>
    ),
  },
  {
    id: 'season-assignment',
    emoji: '📅',
    emojiLabel: 'calendar',
    title: 'Season Assignment',
    accentColor: BRAND_SEAM_RED,
    body: (
      <YStack gap="$3">
        <Paragraph color="$colorPress" fontSize="$4" lineHeight={26}>
          When you draft a player, the system automatically assigns them a{' '}
          <ConceptTooltip
            term="season assignment"
            explanation="The specific MLB calendar year automatically chosen for a player when they are drafted. The system picks a year from that player's career where they played enough games to fill a full matchup schedule."
          />{' '}
          — an MLB year from that player's career whose stats will power their
          contribution to every matchup.
        </Paragraph>
        <Paragraph color="$colorPress" fontSize="$4" lineHeight={26}>
          Each player on your roster can come from a{' '}
          <strong style={{ color: BRAND_GOLD_LIGHT }}>different era</strong> —
          your 1927 Babe Ruth plays alongside a 2019 Mike Trout. Your knowledge
          of great historical seasons across all eras is your edge.
        </Paragraph>
        <YStack gap="$2">
          {[
            {
              icon: '🎲',
              text: 'Each player is automatically assigned an eligible season from their MLB career when drafted.',
            },
            {
              icon: '🔒',
              text: 'Stats are final — no live games affect your score.',
            },
            {
              icon: '🏟️',
              text: 'Rosters can span multiple eras — any combination of MLB history is possible.',
            },
          ].map(({ icon, text }) => (
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
      </YStack>
    ),
  },
  {
    id: 'game-selection',
    emoji: '🎯',
    emojiLabel: 'target',
    title: 'Game Selection',
    accentColor: BRAND_NAVY_LIGHT,
    body: (
      <YStack gap="$3">
        <Paragraph color="$colorPress" fontSize="$4" lineHeight={26}>
          <ConceptTooltip
            term="game selection"
            explanation="The process of choosing which individual games from the assigned MLB season contribute to each weekly matchup. Commissioners can configure this per-week."
          />{' '}
          determines which games from the assigned season count toward each
          weekly matchup period.
        </Paragraph>
        <Paragraph color="$colorPress" fontSize="$4" lineHeight={26}>
          Think of it as choosing a "window" of real games from history. Your
          players' stats across those games accumulate into your matchup score.
        </Paragraph>

        {/* Visual example */}
        <YStack
          borderRadius="$5"
          borderWidth={1}
          borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.5)}
          overflow="hidden"
          style={{ background: withAlpha(BG_DARK, 0.8) }}
        >
          <XStack
            padding="$3"
            borderBottomWidth={1}
            borderBottomColor={withAlpha(BRAND_NAVY_LIGHT, 0.3)}
            style={{ background: withAlpha(BRAND_NAVY_LIGHT, 0.15) }}
          >
            <Paragraph fontWeight="700" color={BRAND_GOLD} fontSize="$3">
              Example — Week 7 Game Window
            </Paragraph>
          </XStack>
          <YStack padding="$3" gap="$2">
            {[
              { date: 'Mon Aug 5, 2019', games: 14, counted: true },
              { date: 'Tue Aug 6, 2019', games: 15, counted: true },
              { date: 'Wed Aug 7, 2019', games: 12, counted: true },
            ].map(({ date, games }) => (
              <XStack
                key={date}
                justifyContent="space-between"
                alignItems="center"
                padding="$2"
                borderRadius="$3"
                style={{ background: withAlpha(BRAND_NAVY_LIGHT, 0.08) }}
              >
                <Paragraph color="$colorPress" fontSize="$3">
                  {date}
                </Paragraph>
                <Paragraph
                  color={BRAND_GOLD_LIGHT}
                  fontSize="$3"
                  fontWeight="700"
                >
                  {games} games ✓
                </Paragraph>
              </XStack>
            ))}
          </YStack>
        </YStack>
      </YStack>
    ),
  },
  {
    id: 'scoring',
    emoji: '📊',
    emojiLabel: 'statistics',
    title: 'Scoring from Archived Box Scores',
    accentColor: BRAND_GOLD_DARK,
    body: (
      <YStack gap="$3">
        <Paragraph color="$colorPress" fontSize="$4" lineHeight={26}>
          Every fantasy point comes directly from a real MLB{' '}
          <ConceptTooltip
            term="archived box score"
            explanation="An official record of a completed MLB game, listing every player's at-bats, hits, runs, RBIs, pitching lines, and more. Legacy Sports reads these to calculate your fantasy score."
          />{' '}
          — the official statistical record of every game in the assigned
          season.
        </Paragraph>

        {/* Scoring table */}
        <YStack
          borderRadius="$5"
          borderWidth={1}
          borderColor={withAlpha(BRAND_GOLD, 0.25)}
          overflow="hidden"
        >
          <XStack
            padding="$3"
            style={{ background: withAlpha(BRAND_GOLD_DARK, 0.25) }}
            borderBottomWidth={1}
            borderBottomColor={withAlpha(BRAND_GOLD, 0.2)}
          >
            <Paragraph fontWeight="700" color={BRAND_GOLD} fontSize="$3">
              Default Scoring Values
            </Paragraph>
          </XStack>
          <YStack padding="$2">
            {[
              { stat: 'Home Run (HR)', pts: '+4' },
              { stat: 'RBI', pts: '+1' },
              { stat: 'Run Scored (R)', pts: '+1' },
              { stat: 'Hit (H)', pts: '+1' },
              { stat: 'Stolen Base (SB)', pts: '+2' },
              { stat: 'Strikeout (Batter)', pts: '−1' },
              { stat: 'Win (Pitcher)', pts: '+7' },
              { stat: 'Earned Run Allowed (ERA)', pts: '−1 per run' },
            ].map(({ stat, pts }) => (
              <XStack
                key={stat}
                justifyContent="space-between"
                alignItems="center"
                paddingHorizontal="$3"
                paddingVertical="$2"
                borderRadius="$2"
                style={{ background: 'transparent' }}
              >
                <Paragraph color="$colorPress" fontSize="$3">
                  {stat}
                </Paragraph>
                <Paragraph
                  fontWeight="700"
                  fontSize="$3"
                  color={
                    pts.startsWith('+') ? BRAND_GOLD_LIGHT : BRAND_SEAM_RED
                  }
                >
                  {pts}
                </Paragraph>
              </XStack>
            ))}
          </YStack>
        </YStack>

        <Paragraph color="$colorPress" fontSize="$3" lineHeight={22}>
          League commissioners can customise scoring weights in league settings.
        </Paragraph>
      </YStack>
    ),
  },
  {
    id: 'sample-matchup',
    emoji: '🏆',
    emojiLabel: 'trophy',
    title: 'Sample Matchup',
    accentColor: BRAND_NAVY_LIGHT,
    body: (
      <YStack gap="$3">
        <Paragraph color="$colorPress" fontSize="$4" lineHeight={26}>
          Here's what a typical week looks like in your league dashboard:
        </Paragraph>

        {/* Sample matchup card */}
        <YStack
          borderRadius="$6"
          borderWidth={1}
          borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.5)}
          overflow="hidden"
          style={{
            background: `linear-gradient(135deg, ${withAlpha(BG_DARK, 0.9)} 0%, ${withAlpha(BRAND_NAVY, 0.5)} 100%)`,
          }}
        >
          {/* Header */}
          <XStack
            justifyContent="center"
            padding="$3"
            borderBottomWidth={1}
            borderBottomColor={withAlpha(BRAND_NAVY_LIGHT, 0.3)}
            style={{ background: withAlpha(BRAND_NAVY_LIGHT, 0.15) }}
          >
            <Paragraph color={BRAND_GOLD_LIGHT} fontWeight="700" fontSize="$3">
              Week 7 · Aug 5–7, 2019
            </Paragraph>
          </XStack>

          {/* Teams */}
          <XStack
            justifyContent="space-around"
            alignItems="center"
            padding="$4"
          >
            <YStack alignItems="center" gap="$2">
              <Paragraph fontSize={32} lineHeight={36}>
                <span role="img" aria-label="eagle">
                  🦥
                </span>
              </Paragraph>
              <Paragraph fontWeight="700" color="$color" fontSize="$4">
                Your Team
              </Paragraph>
              <Paragraph
                fontWeight="800"
                fontSize={28}
                lineHeight={32}
                color={BRAND_GOLD_LIGHT}
              >
                87.5
              </Paragraph>
            </YStack>

            <YStack alignItems="center" gap="$1">
              <Paragraph color={BRAND_SEAM_RED} fontWeight="800" fontSize="$5">
                VS
              </Paragraph>
              <Paragraph color="$colorPress" fontSize="$2">
                Week matchup
              </Paragraph>
            </YStack>

            <YStack alignItems="center" gap="$2">
              <Paragraph fontSize={32} lineHeight={36}>
                <span role="img" aria-label="bear">
                  🐻
                </span>
              </Paragraph>
              <Paragraph fontWeight="700" color="$color" fontSize="$4">
                Opponent
              </Paragraph>
              <Paragraph
                fontWeight="800"
                fontSize={28}
                lineHeight={32}
                color="$colorPress"
              >
                72.0
              </Paragraph>
            </YStack>
          </XStack>

          {/* Top performers */}
          <YStack
            borderTopWidth={1}
            borderTopColor={withAlpha(BRAND_NAVY_LIGHT, 0.3)}
            padding="$3"
            gap="$2"
          >
            <Paragraph
              fontSize="$2"
              fontWeight="700"
              color={BRAND_GOLD}
              textTransform="uppercase"
              letterSpacing={1}
            >
              Top Performers This Week
            </Paragraph>
            {[
              { name: 'Mike Trout', stats: '2 HR, 1 SB, 5 R', pts: '+18' },
              { name: 'Gerrit Cole', stats: 'W, 8 K, 1 ER', pts: '+14' },
            ].map(({ name, stats, pts }) => (
              <XStack
                key={name}
                justifyContent="space-between"
                alignItems="center"
              >
                <YStack>
                  <Paragraph fontWeight="600" color="$color" fontSize="$3">
                    {name}
                  </Paragraph>
                  <Paragraph color="$colorPress" fontSize="$2">
                    {stats}
                  </Paragraph>
                </YStack>
                <Paragraph
                  fontWeight="700"
                  color={BRAND_GOLD_LIGHT}
                  fontSize="$4"
                >
                  {pts} pts
                </Paragraph>
              </XStack>
            ))}
          </YStack>
        </YStack>

        <Paragraph color="$colorPress" fontSize="$3" lineHeight={22}>
          Live matchup scores update as our system processes each archived game
          from the assigned season window.
        </Paragraph>
      </YStack>
    ),
  },
  {
    id: 'get-started',
    emoji: '🚀',
    emojiLabel: 'rocket',
    title: "You're Ready to Play!",
    accentColor: BRAND_GOLD_DARK,
    body: (
      <YStack gap="$4">
        <Paragraph color="$colorPress" fontSize="$4" lineHeight={26}>
          You now know everything you need to dominate your Legacy Sports
          league. Here's your quick-start checklist:
        </Paragraph>

        <YStack gap="$3">
          {[
            {
              step: '1',
              title: 'Create or join a league',
              desc: 'Head to Baseball and set up a league with friends. Player season assignments are handled automatically — just draft and compete.',
              link: '/baseball/league/create',
              linkText: 'Create League →',
            },
            {
              step: '2',
              title: 'Draft your roster',
              desc: 'Pick any MLB player from history. Each player is automatically assigned an eligible season from their career — deep knowledge across all eras wins here.',
              link: null,
              linkText: null,
            },
            {
              step: '3',
              title: 'Follow your matchups',
              desc: 'Check weekly scores as archived game stats accumulate into your matchup total.',
              link: '/baseball',
              linkText: 'View Leagues →',
            },
          ].map(({ step, title, desc, link, linkText }) => (
            <XStack key={step} gap="$3" alignItems="flex-start">
              <YStack
                width={30}
                height={30}
                borderRadius={9999}
                alignItems="center"
                justifyContent="center"
                flexShrink={0}
                style={{
                  background: `linear-gradient(135deg, ${BRAND_NAVY_LIGHT} 0%, #3a5a9c 100%)`,
                }}
              >
                <Paragraph
                  color={BRAND_GOLD_LIGHT}
                  fontWeight="800"
                  fontSize="$3"
                >
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
                {link && linkText && (
                  <a
                    href={link}
                    style={{
                      color: BRAND_GOLD_LIGHT,
                      fontWeight: 600,
                      fontSize: 13,
                      textDecoration: 'none',
                    }}
                  >
                    {linkText}
                  </a>
                )}
              </YStack>
            </XStack>
          ))}
        </YStack>

        <Paragraph color="$colorPress" fontSize="$3" lineHeight={22}>
          You can always review this tutorial by clicking{' '}
          <strong style={{ color: BRAND_GOLD_LIGHT }}>
            Help → Launch Tutorial
          </strong>{' '}
          at any time.
        </Paragraph>
      </YStack>
    ),
  },
];

/* ─── Main component ─────────────────────────────────────── */

/**
 * A multi-step onboarding tutorial that explains the historical-stats
 * game mechanic to new users.  Displayed as a dismissible modal overlay.
 */
export function OnboardingTutorial({ onClose }: OnboardingTutorialProps) {
  const [currentStep, setCurrentStep] = React.useState(0);
  const step = STEPS[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === STEPS.length - 1;

  const handleNext = () => {
    if (isLast) {
      onClose();
    } else {
      setCurrentStep((s) => s + 1);
    }
  };

  const handleBack = () => {
    setCurrentStep((s) => Math.max(0, s - 1));
  };

  return (
    /* ── Backdrop ── */
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1000,
        background: withAlpha('#000', 0.75),
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        padding: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* ── Modal card ── */}
      <YStack
        borderRadius="$7"
        borderWidth={1}
        borderColor={withAlpha(BRAND_GOLD, 0.3)}
        style={{
          background: `linear-gradient(145deg, ${withAlpha('#0D1526', 0.98)} 0%, ${withAlpha(BRAND_NAVY, 0.95)} 100%)`,
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          width: '100%',
          maxWidth: 560,
          maxHeight: '90vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: `0 24px 80px ${withAlpha('#000', 0.6)}`,
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
      >
        {/* ── Top accent bar ── */}
        <YStack
          height={4}
          style={{
            background: `linear-gradient(90deg, ${BRAND_NAVY_LIGHT} 0%, ${BRAND_SEAM_RED} 40%, ${BRAND_GOLD} 100%)`,
          }}
        />

        {/* ── Header ── */}
        <XStack
          padding="$5"
          paddingBottom="$3"
          alignItems="flex-start"
          justifyContent="space-between"
        >
          <XStack alignItems="center" gap="$3" flex={1}>
            <YStack
              width={52}
              height={52}
              borderRadius="$5"
              alignItems="center"
              justifyContent="center"
              flexShrink={0}
              style={{
                background: `linear-gradient(135deg, ${step.accentColor} 0%, ${withAlpha(step.accentColor, 0.6)} 100%)`,
              }}
            >
              <Paragraph fontSize={26} lineHeight={30}>
                <span role="img" aria-label={step.emojiLabel}>
                  {step.emoji}
                </span>
              </Paragraph>
            </YStack>
            <YStack flex={1} gap="$1">
              <Paragraph
                fontSize="$2"
                fontWeight="600"
                color={BRAND_GOLD}
                textTransform="uppercase"
                letterSpacing={1}
              >
                Step {currentStep + 1} of {STEPS.length}
              </Paragraph>
              <H2
                id="onboarding-title"
                color="$color"
                fontSize="$6"
                fontWeight="800"
                lineHeight={28}
              >
                {step.title}
              </H2>
            </YStack>
          </XStack>

          {/* Close / skip */}
          <Button
            size="$2"
            backgroundColor="transparent"
            borderWidth={0}
            onPress={onClose}
            aria-label="Skip tutorial"
            color="$colorPress"
            hoverStyle={{ color: BRAND_GOLD_LIGHT }}
            paddingHorizontal="$2"
          >
            ✕
          </Button>
        </XStack>

        {/* ── Progress dots ── */}
        <XStack
          paddingHorizontal="$5"
          gap="$2"
          alignItems="center"
          marginBottom="$2"
        >
          {STEPS.map((s, i) => (
            <YStack
              key={s.id}
              height={4}
              borderRadius="$10"
              style={{
                flex: i === currentStep ? 2 : 1,
                background:
                  i <= currentStep
                    ? `linear-gradient(90deg, ${BRAND_SEAM_RED} 0%, ${BRAND_GOLD} 100%)`
                    : withAlpha(BRAND_NAVY_LIGHT, 0.3),
                transition: 'flex 0.3s ease, background 0.3s ease',
              }}
            />
          ))}
        </XStack>

        {/* ── Body (scrollable) ── */}
        <YStack
          padding="$5"
          paddingTop="$3"
          style={{ overflowY: 'auto', flex: 1 }}
        >
          {step.body}
        </YStack>

        {/* ── Footer ── */}
        <XStack
          padding="$4"
          paddingTop="$3"
          justifyContent="space-between"
          alignItems="center"
          borderTopWidth={1}
          borderTopColor={withAlpha(BRAND_NAVY_LIGHT, 0.3)}
        >
          {!isFirst ? (
            <Button
              size="$3"
              backgroundColor="transparent"
              borderWidth={1}
              borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.5)}
              color="$colorPress"
              borderRadius="$5"
              onPress={handleBack}
              hoverStyle={{ borderColor: BRAND_NAVY_LIGHT }}
            >
              ← Back
            </Button>
          ) : (
            /* Spacer so Next stays right-aligned on first step */
            <YStack />
          )}

          <XStack alignItems="center" gap="$3">
            {!isLast && (
              <Button
                size="$3"
                backgroundColor="transparent"
                borderWidth={0}
                color="$colorPress"
                onPress={onClose}
                hoverStyle={{ color: BRAND_GOLD_LIGHT }}
              >
                Skip
              </Button>
            )}

            <Button
              size="$3"
              borderRadius="$5"
              fontWeight="700"
              onPress={handleNext}
              style={{
                background: `linear-gradient(135deg, ${BRAND_NAVY_LIGHT} 0%, ${BRAND_SEAM_RED} 100%)`,
                color: '#fff',
                border: 'none',
                minWidth: 100,
              }}
              hoverStyle={{
                opacity: 0.9,
              }}
            >
              {isLast ? '🚀 Get Started' : 'Next →'}
            </Button>
          </XStack>
        </XStack>
      </YStack>
    </div>
  );
}
