import {
  DISCORD_URL,
  HELP_CONTACT_ITEMS,
  HELP_FAQ_ITEMS,
  HELP_GETTING_STARTED_STEPS,
  HELP_HISTORICAL_FAQ_ITEMS,
  type HelpFaqItem,
} from '@legacy-sports/utils';
import React, { useState } from 'react';
import { Linking, ScrollView } from 'react-native';
import { H1, H3, Separator, Text, XStack, YStack } from 'tamagui';
import { brand } from '@legacy-sports/design-tokens';
import { config } from '@legacy-sports/app-config/native';
import BugReportModal, {
  type ReportKind,
} from '../../features/bug-report/BugReportModal';

/* ─── FAQ data (imported from @legacy-sports/utils) ─── */

type FaqItemProps = HelpFaqItem;

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
        <Text fontSize="$5" color={brand.gold}>
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

/* ─── Getting started steps and contact items imported from @legacy-sports/utils ─── */

/* ─── Main component ─── */

export default function HelpScreen(): React.JSX.Element {
  const [reportKind, setReportKind] = useState<ReportKind | null>(null);

  return (
    <>
      <BugReportModal
        visible={reportKind !== null}
        kind={reportKind ?? 'bug'}
        onClose={() => setReportKind(null)}
      />
      <ScrollView>
        <YStack
          padding="$5"
          gap="$6"
          backgroundColor="$background"
          minHeight="100%"
        >
          {/* Page Header */}
          <YStack gap="$2" paddingVertical="$4">
            <H1 color={brand.gold}>🆘 Help & Support</H1>
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
              {HELP_FAQ_ITEMS.map((item) => (
                <FaqItem
                  key={item.question}
                  question={item.question}
                  answer={item.answer}
                />
              ))}
            </YStack>
          </YStack>

          {/* Historical Stats — How It Works */}
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
                <Text fontSize={18}>📜</Text>
              </YStack>
              <H3 color="$color">Historical Stats — How It Works</H3>
            </XStack>
            <YStack padding="$4">
              {HELP_HISTORICAL_FAQ_ITEMS.map((item) => (
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
              {HELP_GETTING_STARTED_STEPS.map(({ step, title, body }) => (
                <XStack key={step} gap="$4" alignItems="flex-start">
                  <YStack
                    width={32}
                    height={32}
                    borderRadius="$10"
                    alignItems="center"
                    justifyContent="center"
                    flexShrink={0}
                    backgroundColor={brand.navyLight}
                  >
                    <Text color={brand.gold} fontWeight="700" fontSize="$3">
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
              {HELP_CONTACT_ITEMS.map((item) => {
                // Report a Bug (LS-8842) and Suggest a Feature (LS-9247) both
                // open the in-app flow when it's available, so the submission
                // lands in Jira. External URLs are a genuine fallback only, and
                // only when the in-app path is unavailable — not the default.
                // Report a Bug falls back to Discord (faster human response);
                // Suggest a Feature falls back to its GitHub issue template.
                const inAppKind: ReportKind | null =
                  item.action === 'bug-report'
                    ? 'bug'
                    : item.action === 'feature-request'
                      ? 'feature'
                      : null;

                const onPress =
                  inAppKind && config.jiraProxyUrl
                    ? () => setReportKind(inAppKind)
                    : item.action === 'bug-report'
                      ? () => void Linking.openURL(DISCORD_URL)
                      : item.url
                        ? () => {
                            const { url } = item;
                            if (url) void Linking.openURL(url);
                          }
                        : undefined;

                return (
                  <YStack
                    key={item.title}
                    borderRadius="$5"
                    borderWidth={1}
                    borderColor="$borderColor"
                    padding="$4"
                    pressStyle={{ opacity: 0.8 }}
                    onPress={onPress}
                  >
                    <XStack alignItems="center" gap="$3">
                      <YStack
                        width={40}
                        height={40}
                        borderRadius="$4"
                        alignItems="center"
                        justifyContent="center"
                        backgroundColor={brand.navyLight}
                      >
                        <Text fontSize={20}>{item.icon}</Text>
                      </YStack>
                      <YStack flex={1} gap="$1">
                        <Text fontWeight="700" color={brand.gold} fontSize="$4">
                          {item.title}
                        </Text>
                        <Text color="$colorPress" fontSize="$3">
                          {item.description}
                        </Text>
                      </YStack>
                    </XStack>
                  </YStack>
                );
              })}

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
                  For account access problems or missed draft notifications,
                  join our{' '}
                  <Text
                    color={brand.gold}
                    onPress={() => void Linking.openURL(DISCORD_URL)}
                  >
                    Discord server
                  </Text>{' '}
                  and post in #urgent-support — we respond much faster there.
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
    </>
  );
}
export { ScreenErrorBoundary as ErrorBoundary } from './_screenErrorBoundary';
