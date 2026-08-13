import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, XStack, YStack } from '@legacy-sports/shared-components/ui';
import { ScrollView, styled } from 'tamagui';
import {
  DISCORD_URL,
  HELP_CONTACT_ITEMS,
  HELP_FAQ_ITEMS,
  HELP_HISTORICAL_FAQ_ITEMS,
  type HelpFaqItem,
} from '@legacy-sports/utils';
import { AlertTriangle } from '@tamagui/lucide-icons/icons/AlertTriangle';
import { BarChart3 } from '@tamagui/lucide-icons/icons/BarChart3';
import { Bug } from '@tamagui/lucide-icons/icons/Bug';
import { ChevronDown } from '@tamagui/lucide-icons/icons/ChevronDown';
import { Gamepad2 } from '@tamagui/lucide-icons/icons/Gamepad2';
import { Lightbulb } from '@tamagui/lucide-icons/icons/Lightbulb';
import { MessageCircle } from '@tamagui/lucide-icons/icons/MessageCircle';
import { Plus } from '@tamagui/lucide-icons/icons/Plus';
import { Settings } from '@tamagui/lucide-icons/icons/Settings';
import { Trophy } from '@tamagui/lucide-icons/icons/Trophy';
import { Users } from '@tamagui/lucide-icons/icons/Users';
import { BugReportButton } from '../../components/layout/BugReportButton';
import { env } from '../../config/environment';
import { OnboardingTutorial } from '../../components/onboarding';
import { PageMeta } from '../../components/PageMeta';
import { FONT_BODY, FONT_DISPLAY } from '../../constants/typography';
import {
  BG_DARK,
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  BRAND_SEAM_RED,
  BRAND_SEAM_RED_LIGHT,
  STATS_BORDER,
  SURFACE_CARD,
  SURFACE_DEEP,
  SURFACE_PANEL,
  TEXT_FG2,
  TEXT_INTERFACE,
  TEXT_ON_GOLD,
  TEXT_SECONDARY,
  TEXT_TERTIARY,
  WHITE,
  withAlpha,
} from '../../constants/colors';

/* ─── Contact icon lookup ───
 * Keyed by HELP_CONTACT_ITEMS.title (stable semantic identifier) rather than
 * the `icon` emoji field, which could drift if the shared content is edited.
 * Items without a mapped title fall back to rendering the emoji as a string.
 */

const CONTACT_ICON_MAP: Record<
  string,
  React.ComponentType<{ size?: number; color?: string }>
> = {
  'Report a Bug': Bug,
  'Suggest a Feature': Lightbulb,
  'Community Discussions': MessageCircle,
  'Join our Discord': Gamepad2,
};

/* ─── Quick link data ─── */

const QUICK_LINKS = [
  { to: '/baseball', icon: Trophy, label: 'My Leagues' },
  { to: '/players', icon: Users, label: 'Players' },
  { to: '/players/stats', icon: BarChart3, label: 'Player Stats' },
  { to: '/baseball/league/create', icon: Plus, label: 'Create League' },
  { to: '/profile/settings', icon: Settings, label: 'Profile Settings' },
];

/* ─── Tutorial preview step data (illustrative, mirrors OnboardingTutorial) ─── */

const TUTORIAL_PREVIEW_STEPS = [
  {
    n: '01',
    title: 'Pick your era',
    desc: 'Modern, Dead-Ball, or All-Time',
    time: '~ 12s',
  },
  {
    n: '02',
    title: 'Build your roster',
    desc: 'Draft 23 across all positions',
    time: '~ 25s',
  },
  {
    n: '03',
    title: 'Set your lineup',
    desc: 'Bench, DH, and rotation',
    time: '~ 18s',
  },
  {
    n: '04',
    title: 'Read the scoreboard',
    desc: 'Live archived stats explained',
    time: '~ 20s',
  },
  {
    n: '05',
    title: 'Trade & waivers',
    desc: 'Commissioner approvals',
    time: '~ 22s',
  },
  {
    n: '06',
    title: 'Win the pennant',
    desc: 'Playoffs & the championship',
    time: '~ 15s',
  },
];

/* ─── One-time keyframe injection (pulse dot + skeleton shimmer) ─── */

const KEYFRAME_STYLE_ID = 'help-page-keyframes';

function ensureKeyframes() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(KEYFRAME_STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = KEYFRAME_STYLE_ID;
  el.textContent = `
    @keyframes helpUrgentPulse {
      0%, 100% { opacity: 1; }
      50%      { opacity: 0.3; }
    }
    @media (prefers-reduced-motion: reduce) {
      .help-pulse-dot { animation: none !important; }
    }
  `;
  document.head.appendChild(el);
}

/* ─── Styled primitives ─── */

const PageContainer = styled(YStack, {
  flex: 1,
  minHeight: '100vh',
  backgroundColor: '$background',
});

const ContentContainer = styled(YStack, {
  maxWidth: 1180,
  width: '100%',
  alignSelf: 'center',
  paddingHorizontal: '$6',
  paddingTop: '$8',
  paddingBottom: '$12',
  gap: 0,
  $sm: {
    paddingHorizontal: '$4',
    paddingTop: '$6',
    paddingBottom: '$10',
  },
});

/* ─── FAQ row (numbered, editorial accordion) ─── */

interface NumberedFaqItemProps extends HelpFaqItem {
  index: number;
}

function NumberedFaqItem({ index, question, answer }: NumberedFaqItemProps) {
  const [open, setOpen] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [focused, setFocused] = useState(false);
  const slug = question
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  const faqId = `faq-${slug}`;
  const num = String(index + 1).padStart(2, '0');

  return (
    <YStack
      data-testid={`faq-item-${slug}`}
      borderBottomWidth={1}
      borderBottomColor={withAlpha(STATS_BORDER, 1)}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={faqId}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto 1fr auto',
          gap: 18,
          textAlign: 'left',
          color: TEXT_INTERFACE,
          minHeight: 44,
          alignItems: 'center',
          width: '100%',
          paddingLeft: 24,
          paddingRight: 24,
          paddingTop: 22,
          paddingBottom: 22,
          border: 'none',
          backgroundColor:
            hovering || focused ? withAlpha(WHITE, 0.02) : 'transparent',
          cursor: 'pointer',
        }}
      >
        <span
          style={{
            fontFamily: "'JetBrains Mono', ui-monospace, Menlo, monospace",
            fontWeight: 500,
            fontSize: 12,
            color: TEXT_TERTIARY,
            letterSpacing: '0.06em',
            fontVariantNumeric: 'tabular-nums',
            width: 32,
          }}
        >
          {num}
        </span>
        <span
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 700,
            fontSize: 18,
            letterSpacing: '0.01em',
            color: open ? BRAND_GOLD_LIGHT : TEXT_INTERFACE,
            transition: 'color 150ms ease',
          }}
        >
          {question}
        </span>
        <ChevronDown
          size={16}
          color={open ? BRAND_GOLD_LIGHT : TEXT_SECONDARY}
          style={{
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 150ms ease',
          }}
        />
      </button>
      {open && (
        <YStack
          id={faqId}
          role="region"
          aria-label={question}
          paddingLeft={74}
          paddingRight={24}
          paddingBottom={26}
          $sm={{ paddingLeft: 64, paddingRight: 18, paddingBottom: 22 }}
        >
          <p
            style={{
              fontFamily: FONT_BODY,
              fontSize: 15,
              lineHeight: 1.65,
              color: TEXT_FG2,
              margin: 0,
              maxWidth: '65ch',
            }}
          >
            {answer}
          </p>
        </YStack>
      )}
    </YStack>
  );
}

/* ─── Contact card ─── */

const ContactCardBase = styled(YStack, {
  borderRadius: 16,
  borderWidth: 1,
  borderColor: STATS_BORDER,
  backgroundColor: SURFACE_PANEL,
  padding: 22,
  cursor: 'pointer' as never,
  animation: 'quick',
  hoverStyle: {
    borderColor: withAlpha(BRAND_GOLD, 0.35),
    backgroundColor: SURFACE_CARD,
  },
});

interface ContactOptionProps {
  icon: string;
  iconLabel: string;
  title: string;
  description: string;
  href?: string;
  onPress?: () => void;
}

function ContactOption({
  icon,
  iconLabel,
  title,
  description,
  href,
  onPress,
}: ContactOptionProps) {
  const handlePress = onPress
    ? onPress
    : href
      ? () => window.open(href, '_blank', 'noopener,noreferrer')
      : undefined;
  const IconComponent = CONTACT_ICON_MAP[title];

  return (
    <ContactCardBase
      onPress={handlePress}
      cursor={handlePress ? ('pointer' as never) : undefined}
      role={handlePress ? 'button' : undefined}
      tabIndex={handlePress ? 0 : undefined}
      aria-label={handlePress ? title : undefined}
      onKeyDown={
        handlePress
          ? (e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handlePress();
              }
            }
          : undefined
      }
    >
      <XStack alignItems="center" gap={18}>
        <YStack
          width={48}
          height={48}
          borderRadius={12}
          alignItems="center"
          justifyContent="center"
          borderWidth={1}
          borderColor={STATS_BORDER}
          style={{ background: withAlpha(BRAND_NAVY, 0.4) }}
        >
          {IconComponent ? (
            <IconComponent size={24} color={BRAND_GOLD_LIGHT} />
          ) : (
            <span role="img" aria-label={iconLabel} style={{ fontSize: 22 }}>
              {icon}
            </span>
          )}
        </YStack>
        <YStack flex={1} gap={4}>
          <span
            style={{
              fontFamily: FONT_DISPLAY,
              fontWeight: 700,
              fontSize: 16,
              letterSpacing: '0.04em',
              color: TEXT_INTERFACE,
            }}
          >
            {title}
          </span>
          <span
            style={{
              fontFamily: FONT_BODY,
              fontSize: 13,
              lineHeight: 1.45,
              color: TEXT_SECONDARY,
            }}
          >
            {description}
          </span>
        </YStack>
        <span
          aria-hidden="true"
          style={{
            fontFamily: "'JetBrains Mono', ui-monospace, Menlo, monospace",
            fontSize: 12,
            color: TEXT_TERTIARY,
          }}
        >
          ↗
        </span>
      </XStack>
    </ContactCardBase>
  );
}

/* ─── Section eyebrow + title ─── */

interface SectionHeadProps {
  eyebrow?: string;
  title: string;
  sub?: string;
}

function SectionHead({ eyebrow, title, sub }: SectionHeadProps) {
  return (
    <YStack gap={6} maxWidth="70ch" marginBottom={20}>
      {eyebrow && (
        <span
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 700,
            fontSize: 12,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: BRAND_GOLD_LIGHT,
          }}
        >
          {eyebrow}
        </span>
      )}
      <h2
        style={{
          fontFamily: FONT_DISPLAY,
          fontWeight: 800,
          fontSize: 30,
          lineHeight: 1.1,
          letterSpacing: '-0.01em',
          color: TEXT_INTERFACE,
          margin: 0,
        }}
      >
        {title}
      </h2>
      {sub && (
        <p
          style={{
            fontFamily: FONT_BODY,
            fontSize: 15,
            color: TEXT_SECONDARY,
            margin: 0,
          }}
        >
          {sub}
        </p>
      )}
    </YStack>
  );
}

/* ─── Main component ─── */

export default function HelpPage() {
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [bugReportOpen, setBugReportOpen] = useState(false);

  useEffect(() => {
    ensureKeyframes();
  }, []);

  return (
    <>
      {tutorialOpen && (
        <OnboardingTutorial onClose={() => setTutorialOpen(false)} />
      )}
      <BugReportButton
        controlledOpen={bugReportOpen}
        onDialogOpenChange={setBugReportOpen}
      />
      <PageContainer>
        <PageMeta
          title="Help & Support"
          description="Get help with Legacy Sports fantasy baseball. Browse FAQs, scoring guides, draft rules, and support topics."
        />
        <ScrollView>
          <ContentContainer>
            {/* ── Page header ── */}
            <YStack
              gap={8}
              marginBottom={40}
              maxWidth="70ch"
              $sm={{ marginBottom: 28 }}
            >
              <span
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontWeight: 700,
                  fontSize: 12,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: BRAND_GOLD_LIGHT,
                }}
              >
                The Clubhouse
              </span>
              <h1
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontWeight: 800,
                  fontSize: 'clamp(40px, 5vw, 56px)',
                  lineHeight: 1,
                  letterSpacing: '-0.02em',
                  color: WHITE,
                  margin: 0,
                }}
              >
                Help &amp; Support
              </h1>
              <p
                style={{
                  fontFamily: FONT_BODY,
                  fontSize: 18,
                  lineHeight: 1.6,
                  color: TEXT_FG2,
                  margin: '8px 0 0',
                  maxWidth: '62ch',
                }}
              >
                Whether you&rsquo;re drafting your first dynasty or wrangling a
                12-team commissioner gig, the answers are here. If you
                don&rsquo;t find what you need, we&rsquo;re a Discord message
                away.
              </p>
            </YStack>

            {/* ── Tutorial hero ── */}
            <YStack
              borderTopWidth={0}
              paddingVertical={0}
              marginBottom={40}
              $sm={{ marginBottom: 28 }}
            >
              <YStack
                borderWidth={1}
                borderColor={withAlpha(BRAND_GOLD, 0.45)}
                borderRadius={24}
                overflow="hidden"
                style={{
                  background: `linear-gradient(135deg, ${SURFACE_DEEP} 0%, ${SURFACE_CARD} 60%, ${BRAND_NAVY} 100%)`,
                  boxShadow: `0 0 0 1px ${withAlpha(BRAND_GOLD, 0.35)}, 0 6px 24px ${withAlpha(BRAND_GOLD, 0.25)}`,
                }}
              >
                <XStack $sm={{ flexDirection: 'column' }} alignItems="stretch">
                  {/* Left: copy + CTA */}
                  <YStack
                    flex={1.2}
                    padding={36}
                    gap={18}
                    $sm={{ padding: 24, gap: 14, flex: 1 }}
                  >
                    <span
                      style={{
                        fontFamily: FONT_DISPLAY,
                        fontWeight: 700,
                        fontSize: 12,
                        letterSpacing: '0.18em',
                        textTransform: 'uppercase',
                        color: BRAND_GOLD_LIGHT,
                      }}
                    >
                      New to Legacy Sports?
                    </span>
                    <h2
                      style={{
                        fontFamily: FONT_DISPLAY,
                        fontWeight: 800,
                        fontSize: 36,
                        lineHeight: 1,
                        letterSpacing: '-0.01em',
                        color: WHITE,
                        margin: 0,
                      }}
                    >
                      Take the clubhouse tour
                    </h2>
                    <p
                      style={{
                        fontFamily: FONT_BODY,
                        fontSize: 16,
                        lineHeight: 1.6,
                        color: TEXT_FG2,
                        margin: 0,
                        maxWidth: '50ch',
                      }}
                    >
                      A six-step walkthrough of every surface you&rsquo;ll touch
                      &mdash; from drafting historical lineups to setting your
                      weekly rotation. You&rsquo;ll know your way around before
                      first pitch.
                    </p>
                    <XStack
                      alignItems="center"
                      gap={14}
                      style={{
                        fontFamily: FONT_BODY,
                        fontSize: 13,
                        color: TEXT_SECONDARY,
                      }}
                    >
                      <span>Runs in under 2 minutes</span>
                      <span style={{ color: TEXT_TERTIARY }}>·</span>
                      <span>Skip or resume any time</span>
                    </XStack>
                    <XStack gap={10} flexWrap="wrap" marginTop={6}>
                      <Button
                        size="$4"
                        borderRadius={12}
                        onPress={() => setTutorialOpen(true)}
                        style={{
                          background: BRAND_GOLD,
                          color: TEXT_ON_GOLD,
                          border: `1px solid ${BRAND_GOLD_LIGHT}`,
                          fontFamily: FONT_DISPLAY,
                          fontWeight: 700,
                          fontSize: 13,
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                          padding: '13px 22px',
                          minHeight: 44,
                        }}
                        hoverStyle={{ opacity: 0.9 }}
                      >
                        Launch Tutorial
                      </Button>
                    </XStack>
                  </YStack>

                  {/* Right: 6-step preview rail (hidden on phone) */}
                  <YStack
                    flex={1}
                    padding={32}
                    gap={10}
                    borderLeftWidth={1}
                    borderLeftColor={withAlpha(WHITE, 0.06)}
                    style={{ background: withAlpha(BG_DARK, 0.45) }}
                    $sm={{
                      display: 'none' as never,
                    }}
                    aria-hidden="true"
                  >
                    {TUTORIAL_PREVIEW_STEPS.map((step) => (
                      <XStack
                        key={step.n}
                        alignItems="center"
                        gap={14}
                        paddingHorizontal={12}
                        paddingVertical={10}
                        borderRadius={10}
                        borderWidth={1}
                        borderColor={withAlpha(WHITE, 0.04)}
                        style={{ background: withAlpha(WHITE, 0.02) }}
                      >
                        <YStack
                          width={30}
                          height={30}
                          borderRadius={9999}
                          alignItems="center"
                          justifyContent="center"
                          borderWidth={1}
                          borderColor={withAlpha(BRAND_GOLD, 0.35)}
                          style={{
                            background: withAlpha(BRAND_GOLD, 0.12),
                          }}
                        >
                          <span
                            style={{
                              fontFamily: FONT_DISPLAY,
                              fontWeight: 800,
                              fontSize: 13,
                              color: BRAND_GOLD_LIGHT,
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {step.n}
                          </span>
                        </YStack>
                        <YStack flex={1} gap={2}>
                          <span
                            style={{
                              fontFamily: FONT_BODY,
                              fontWeight: 600,
                              fontSize: 14,
                              color: TEXT_INTERFACE,
                            }}
                          >
                            {step.title}
                          </span>
                          <span
                            style={{
                              fontFamily: FONT_BODY,
                              fontSize: 12,
                              color: TEXT_SECONDARY,
                            }}
                          >
                            {step.desc}
                          </span>
                        </YStack>
                        <span
                          style={{
                            fontFamily:
                              "'JetBrains Mono', ui-monospace, Menlo, monospace",
                            fontSize: 10,
                            color: TEXT_TERTIARY,
                            letterSpacing: '0.04em',
                          }}
                        >
                          {step.time}
                        </span>
                      </XStack>
                    ))}
                  </YStack>
                </XStack>
              </YStack>
            </YStack>

            {/* ── Quick Links ── */}
            <YStack
              borderTopWidth={1}
              borderTopColor={STATS_BORDER}
              paddingTop={40}
              marginBottom={40}
              $sm={{ paddingTop: 28, marginBottom: 28 }}
            >
              <SectionHead
                title="Jump back in"
                sub="Five spots most managers head to first."
              />
              <XStack
                flexWrap="wrap"
                gap={10}
                tag="nav"
                aria-label="Quick links"
              >
                {QUICK_LINKS.map(({ to, icon: Icon, label }) => (
                  <Link key={to} to={to} style={{ textDecoration: 'none' }}>
                    <XStack
                      alignItems="center"
                      gap={10}
                      paddingHorizontal={18}
                      paddingVertical={12}
                      borderRadius={9999}
                      borderWidth={1}
                      borderColor={STATS_BORDER}
                      backgroundColor={SURFACE_PANEL}
                      cursor="pointer"
                      animation="quick"
                      hoverStyle={{
                        borderColor: withAlpha(BRAND_GOLD, 0.45),
                        backgroundColor: SURFACE_CARD,
                      }}
                      style={{ minHeight: 44 }}
                    >
                      <Icon size={16} color={BRAND_GOLD_LIGHT} />
                      <span
                        style={{
                          fontFamily: FONT_DISPLAY,
                          fontWeight: 700,
                          fontSize: 13,
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                          color: TEXT_INTERFACE,
                        }}
                      >
                        {label}
                      </span>
                      <span
                        aria-hidden="true"
                        style={{
                          fontFamily:
                            "'JetBrains Mono', ui-monospace, Menlo, monospace",
                          fontSize: 14,
                          color: TEXT_SECONDARY,
                        }}
                      >
                        →
                      </span>
                    </XStack>
                  </Link>
                ))}
              </XStack>
            </YStack>

            {/* ── FAQ ── */}
            <YStack
              borderTopWidth={1}
              borderTopColor={STATS_BORDER}
              paddingTop={40}
              marginBottom={40}
              $sm={{ paddingTop: 28, marginBottom: 28 }}
            >
              <SectionHead
                eyebrow="01 / Common Questions"
                title="Frequently asked questions"
                sub="The most-pulled threads from our Discord, answered."
              />
              <YStack
                borderRadius={16}
                borderWidth={1}
                borderColor={STATS_BORDER}
                backgroundColor={SURFACE_PANEL}
                overflow="hidden"
              >
                {HELP_FAQ_ITEMS.map((item, i) => (
                  <NumberedFaqItem
                    key={item.question}
                    index={i}
                    question={item.question}
                    answer={item.answer}
                  />
                ))}
              </YStack>
            </YStack>

            {/* ── Historical Stats FAQ ── */}
            <YStack
              borderTopWidth={1}
              borderTopColor={STATS_BORDER}
              paddingTop={40}
              marginBottom={40}
              $sm={{ paddingTop: 28, marginBottom: 28 }}
            >
              <SectionHead
                eyebrow="02 / The Archive"
                title="Historical stats — how it works"
                sub="A few of the deeper questions about era play, season assignment, and the records we count."
              />
              <YStack
                borderRadius={16}
                borderWidth={1}
                borderColor={STATS_BORDER}
                backgroundColor={SURFACE_PANEL}
                overflow="hidden"
              >
                {HELP_HISTORICAL_FAQ_ITEMS.map((item, i) => (
                  <NumberedFaqItem
                    key={item.question}
                    index={i}
                    question={item.question}
                    answer={item.answer}
                  />
                ))}
              </YStack>
            </YStack>

            {/* ── Contact & Support ── */}
            <YStack
              borderTopWidth={1}
              borderTopColor={STATS_BORDER}
              paddingTop={40}
              $sm={{ paddingTop: 28 }}
            >
              <SectionHead
                title="Talk to a real person"
                sub="Pick the channel that fits. We read everything."
              />

              <YStack
                gap={14}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                }}
                $sm={{
                  style: {
                    display: 'grid',
                    gridTemplateColumns: '1fr',
                  } as never,
                }}
              >
                {HELP_CONTACT_ITEMS.map((item) => {
                  const useAction =
                    item.action === 'bug-report' && env.jiraProxyUrl;
                  return (
                    <ContactOption
                      key={item.title}
                      icon={item.icon}
                      iconLabel={item.title.toLowerCase()}
                      title={item.title}
                      description={item.description}
                      href={useAction ? undefined : item.url}
                      onPress={
                        useAction ? () => setBugReportOpen(true) : undefined
                      }
                    />
                  );
                })}
              </YStack>

              {/* Urgent / Discord callout */}
              <YStack
                marginTop={18}
                padding={22}
                borderRadius={16}
                borderWidth={1}
                borderColor={withAlpha(BRAND_SEAM_RED, 0.4)}
                style={{
                  background: `linear-gradient(135deg, ${withAlpha(BRAND_SEAM_RED, 0.08)}, ${withAlpha(BRAND_SEAM_RED, 0.02)}), ${SURFACE_PANEL}`,
                }}
                gap={12}
              >
                <XStack alignItems="center" gap={10} flexWrap="wrap">
                  <XStack
                    alignItems="center"
                    gap={8}
                    paddingHorizontal={12}
                    paddingVertical={6}
                    borderRadius={9999}
                    borderWidth={1}
                    borderColor={withAlpha(BRAND_SEAM_RED, 0.5)}
                    style={{ background: withAlpha(BRAND_SEAM_RED, 0.15) }}
                  >
                    <span
                      className="help-pulse-dot"
                      aria-hidden="true"
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 9999,
                        background: BRAND_SEAM_RED_LIGHT,
                        display: 'inline-block',
                        animation:
                          'helpUrgentPulse 1.4s cubic-bezier(0.2, 0.8, 0.2, 1) infinite',
                      }}
                    />
                    <span
                      style={{
                        fontFamily: FONT_DISPLAY,
                        fontWeight: 700,
                        fontSize: 11,
                        letterSpacing: '0.14em',
                        textTransform: 'uppercase',
                        color: BRAND_SEAM_RED_LIGHT,
                      }}
                    >
                      Urgent account issues
                    </span>
                  </XStack>
                  <AlertTriangle size={16} color={BRAND_SEAM_RED} />
                </XStack>
                <p
                  style={{
                    fontFamily: FONT_BODY,
                    fontSize: 15,
                    lineHeight: 1.55,
                    color: TEXT_FG2,
                    margin: 0,
                    maxWidth: '62ch',
                  }}
                >
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
                  and post in{' '}
                  <code
                    style={{
                      fontFamily:
                        "'JetBrains Mono', ui-monospace, Menlo, monospace",
                      fontSize: 13,
                      background: withAlpha(WHITE, 0.05),
                      padding: '1px 6px',
                      borderRadius: 4,
                      color: TEXT_INTERFACE,
                    }}
                  >
                    #urgent-support
                  </code>{' '}
                  &mdash; we respond much faster there than over email.
                </p>
              </YStack>
            </YStack>

            {/* ── Footer ── */}
            <YStack
              marginTop={64}
              paddingTop={32}
              borderTopWidth={1}
              borderTopColor={STATS_BORDER}
              gap={6}
              $sm={{ marginTop: 48, paddingTop: 20 }}
            >
              <span
                style={{
                  fontFamily: FONT_BODY,
                  fontSize: 13,
                  color: TEXT_FG2,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                © {new Date().getFullYear()} Legacy Sports · Fantasy Baseball
                Management
              </span>
              <span
                style={{
                  fontFamily: FONT_BODY,
                  fontSize: 12,
                  color: TEXT_TERTIARY,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                Powered by official MLB statistics · Data refreshed throughout
                each game day
              </span>
            </YStack>
          </ContentContainer>
        </ScrollView>
      </PageContainer>
    </>
  );
}
