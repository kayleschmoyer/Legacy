import React, { useState } from 'react';
import { Linking, ScrollView } from 'react-native';
import { H1, H3, Separator, Text, XStack, YStack } from 'tamagui';

const BRAND_GOLD = '#C5A55A';
const BRAND_NAVY_LIGHT = '#2C4A7C';

/* ─── FAQ data ─── */

interface FaqItemProps {
  question: string;
  answer: string;
}

const FAQ_ITEMS: FaqItemProps[] = [
  {
    question: 'How do I create a fantasy baseball league?',
    answer:
      "Head to the Baseball section and tap Create League. Fill in your league name, set the number of teams, configure draft and roster options, and choose an era filter. Once created, you can invite others using the league invite code shown on your league's Overview tab.",
  },
  {
    question: 'How do I invite teammates to join my league?',
    answer:
      'Open your league page and look for the invite card on the Overview tab. Copy the invite code or share the invite link directly. Players can join via Baseball → Join League and entering the code.',
  },
  {
    question: 'How does the draft work?',
    answer:
      'When the league commissioner starts the draft, all team managers join the Draft Board. Players are listed in order of their projected value. Each team picks in snake-draft order — the order reverses each round.',
  },
  {
    question: 'How is my team score calculated?',
    answer:
      "Scores are calculated from archived MLB box-score statistics loaded when games are selected for your matchup. Each counting stat (H, HR, RBI, R, SB, etc.) is multiplied by a configurable point value defined in your league's scoring profile. You can view the scoring summary on your league's Overview tab.",
  },
  {
    question: 'How do I add or drop players?',
    answer:
      'Navigate to the Free Agents tab on your league page to browse available players. When you claim a player and your roster is full, you can drop a current player in the same transaction. Waiver rules (if enabled) may delay your pickup up to 24 hours.',
  },
  {
    question: 'How do I view matchup results?',
    answer:
      'Tap on your league and select the Matchup tab. Current and historical matchup scores are shown there. You can also tap into any matchup for a player-by-player breakdown.',
  },
  {
    question: 'Why are my player statistics not updating?',
    answer:
      'Player statistics come from archived historical box scores and are loaded when games are selected for your matchup. If stats appear missing after a game has been selected, the system may still be loading data from our historical data source. This usually completes within a few minutes. If stats are still missing after an hour, try pulling to refresh or contact support.',
  },
  {
    question: 'How do I change my display name or avatar?',
    answer:
      'Go to Profile Settings from the drawer menu. Profile details are managed through your Google account.',
  },
];

/* ─── FaqItem component ─── */

function FaqItem({ question, answer }: FaqItemProps) {
  const [open, setOpen] = useState(false);

  return (
    <YStack
      borderRadius="$4"
      borderWidth={1}
      borderColor="$borderColor"
      overflow="hidden"
      marginBottom="$2"
    >
      <XStack
        paddingHorizontal="$4"
        paddingVertical="$4"
        alignItems="center"
        justifyContent="space-between"
        onPress={() => setOpen((v) => !v)}
        pressStyle={{ backgroundColor: '$color2' }}
      >
        <Text fontWeight="600" color="$color" flex={1} fontSize="$4">
          {question}
        </Text>
        <Text fontSize="$5" color={BRAND_GOLD}>
          {open ? '▴' : '▾'}
        </Text>
      </XStack>
      {open && (
        <YStack
          paddingHorizontal="$4"
          paddingVertical="$4"
          borderTopWidth={1}
          borderTopColor="$borderColor"
        >
          <Text color="$colorPress" lineHeight={22}>
            {answer}
          </Text>
        </YStack>
      )}
    </YStack>
  );
}

/* ─── Getting Started steps ─── */

const GETTING_STARTED_STEPS = [
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
    body: 'Check your matchup score throughout the week. Archived historical MLB stats power your fantasy team — every hit, homer, and strikeout counts.',
  },
  {
    step: 4,
    title: 'Win the championship',
    body: 'Manage your roster actively through the season, make smart trades, and outlast your league-mates in the playoffs.',
  },
];

/* ─── Contact items ─── */

interface ContactItem {
  icon: string;
  title: string;
  description: string;
  url?: string;
}

const CONTACT_ITEMS: ContactItem[] = [
  {
    icon: '🐛',
    title: 'Report a Bug',
    description: 'Found something broken? Open a GitHub issue.',
    url: 'https://github.com/bkrupa/legacy-sports/issues/new?labels=bug&template=bug_report.md',
  },
  {
    icon: '💡',
    title: 'Suggest a Feature',
    description: 'Have an idea? We would love to hear it.',
    url: 'https://github.com/bkrupa/legacy-sports/issues/new?labels=enhancement&template=feature_request.md',
  },
  {
    icon: '💬',
    title: 'Community Discussions',
    description: 'Chat with other managers and share tips.',
    url: 'https://github.com/bkrupa/legacy-sports/discussions',
  },
];

/* ─── Main component ─── */

export default function HelpScreen(): React.JSX.Element {
  return (
    <ScrollView>
      <YStack
        padding="$5"
        gap="$6"
        backgroundColor="$background"
        minHeight="100%"
      >
        {/* Page Header */}
        <YStack gap="$2" paddingVertical="$4">
          <H1 color={BRAND_GOLD}>🆘 Help & Support</H1>
          <Text color="$colorPress" fontSize="$5" lineHeight={28}>
            Find answers to common questions and learn how to get the most out
            of Legacy Sports.
          </Text>
        </YStack>

        {/* FAQ */}
        <YStack
          borderRadius="$6"
          borderWidth={1}
          borderColor="$borderColor"
          overflow="hidden"
        >
          <XStack
            paddingHorizontal="$5"
            paddingVertical="$4"
            alignItems="center"
            gap="$3"
            borderBottomWidth={1}
            borderBottomColor="$borderColor"
          >
            <YStack
              width={36}
              height={36}
              borderRadius="$4"
              alignItems="center"
              justifyContent="center"
              backgroundColor="$color2"
            >
              <Text fontSize={18}>❓</Text>
            </YStack>
            <H3 color="$color">Frequently Asked Questions</H3>
          </XStack>

          <YStack padding="$4">
            {FAQ_ITEMS.map((item) => (
              <FaqItem
                key={item.question}
                question={item.question}
                answer={item.answer}
              />
            ))}
          </YStack>
        </YStack>

        {/* Getting Started */}
        <YStack
          borderRadius="$6"
          borderWidth={1}
          borderColor="$borderColor"
          overflow="hidden"
        >
          <XStack
            paddingHorizontal="$5"
            paddingVertical="$4"
            alignItems="center"
            gap="$3"
            borderBottomWidth={1}
            borderBottomColor="$borderColor"
          >
            <YStack
              width={36}
              height={36}
              borderRadius="$4"
              alignItems="center"
              justifyContent="center"
              backgroundColor="$color2"
            >
              <Text fontSize={18}>🚀</Text>
            </YStack>
            <H3 color="$color">Getting Started</H3>
          </XStack>

          <YStack padding="$5" gap="$5">
            {GETTING_STARTED_STEPS.map(({ step, title, body }) => (
              <XStack key={step} gap="$4" alignItems="flex-start">
                <YStack
                  width={32}
                  height={32}
                  borderRadius="$10"
                  alignItems="center"
                  justifyContent="center"
                  flexShrink={0}
                  backgroundColor={BRAND_NAVY_LIGHT}
                >
                  <Text color={BRAND_GOLD} fontWeight="700" fontSize="$3">
                    {step}
                  </Text>
                </YStack>
                <YStack flex={1} gap="$1">
                  <Text fontWeight="700" color="$color" fontSize="$4">
                    {title}
                  </Text>
                  <Text color="$colorPress" lineHeight={22}>
                    {body}
                  </Text>
                </YStack>
              </XStack>
            ))}
          </YStack>
        </YStack>

        {/* Contact & Support */}
        <YStack
          borderRadius="$6"
          borderWidth={1}
          borderColor="$borderColor"
          overflow="hidden"
        >
          <XStack
            paddingHorizontal="$5"
            paddingVertical="$4"
            alignItems="center"
            gap="$3"
            borderBottomWidth={1}
            borderBottomColor="$borderColor"
          >
            <YStack
              width={36}
              height={36}
              borderRadius="$4"
              alignItems="center"
              justifyContent="center"
              backgroundColor="$color2"
            >
              <Text fontSize={18}>📬</Text>
            </YStack>
            <H3 color="$color">Contact & Support</H3>
          </XStack>

          <YStack padding="$4" gap="$3">
            {CONTACT_ITEMS.map((item) => (
              <YStack
                key={item.title}
                borderRadius="$5"
                borderWidth={1}
                borderColor="$borderColor"
                padding="$4"
                pressStyle={{ opacity: 0.8 }}
                onPress={
                  item.url ? () => void Linking.openURL(item.url!) : undefined
                }
              >
                <XStack alignItems="center" gap="$3">
                  <YStack
                    width={40}
                    height={40}
                    borderRadius="$4"
                    alignItems="center"
                    justifyContent="center"
                    backgroundColor={BRAND_NAVY_LIGHT}
                  >
                    <Text fontSize={20}>{item.icon}</Text>
                  </YStack>
                  <YStack flex={1} gap="$1">
                    <Text fontWeight="700" color={BRAND_GOLD} fontSize="$4">
                      {item.title}
                    </Text>
                    <Text color="$colorPress" fontSize="$3">
                      {item.description}
                    </Text>
                  </YStack>
                </XStack>
              </YStack>
            ))}

            <Separator marginVertical="$2" />

            <YStack
              padding="$4"
              borderRadius="$4"
              borderWidth={1}
              borderColor="$red5"
              backgroundColor="$red1"
              gap="$2"
            >
              <Text fontWeight="700" color="$red10" fontSize="$3">
                🚨 Urgent account issues?
              </Text>
              <Text color="$colorPress" fontSize="$3" lineHeight={20}>
                For account access problems or missed draft notifications, open
                a GitHub issue tagged{' '}
                <Text fontFamily="$mono" color={BRAND_GOLD}>
                  urgent
                </Text>{' '}
                and we'll respond as soon as possible.
              </Text>
            </YStack>
          </YStack>
        </YStack>

        {/* Footer */}
        <YStack alignItems="center" paddingVertical="$4" gap="$1">
          <Text color="$gray10" fontSize="$3" textAlign="center">
            © {new Date().getFullYear()} Legacy Sports · Fantasy Baseball
            Management
          </Text>
          <Text color="$gray10" fontSize="$2" textAlign="center">
            Powered by official MLB statistics
          </Text>
        </YStack>
      </YStack>
    </ScrollView>
  );
}
