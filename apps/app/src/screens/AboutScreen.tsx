import React from 'react';
import { Linking, ScrollView } from 'react-native';
import { Button, H1, H3, Text, XStack, YStack } from 'tamagui';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';

declare const __DEV__: boolean;

const REPO_URL = 'https://github.com/bkrupa/legacy-sports';

interface InfoRowProps {
  label: string;
  value: string;
}

function InfoRow({ label, value }: InfoRowProps) {
  return (
    <XStack
      justifyContent="space-between"
      alignItems="center"
      gap="$4"
      flexWrap="wrap"
      paddingVertical="$2"
      borderBottomWidth={1}
      borderBottomColor="$borderColor"
    >
      <Text fontWeight="bold" color="$color" fontSize="$4">
        {label}
      </Text>
      <Text color="$gray11" fontSize="$4" fontFamily="$mono">
        {value}
      </Text>
    </XStack>
  );
}

export default function AboutScreen() {
  const router = useRouter();

  // Version — prefer build-time EXPO_PUBLIC_APP_VERSION (inlined by babel),
  // fall back to expoConfig.version, sentinel 'unknown' matches web.
  const appVersion =
    process.env.EXPO_PUBLIC_APP_VERSION ||
    Constants.expoConfig?.version ||
    'unknown';

  // Commit SHA — EXPO_PUBLIC_COMMIT_SHA inlined by babel; extra.commitSha for
  // release builds that predate the static-member inline path (LS-5717).
  const rawCommitSha =
    process.env.EXPO_PUBLIC_COMMIT_SHA ||
    (Constants.expoConfig?.extra?.commitSha as string | undefined) ||
    'unknown';

  // Build date — EXPO_PUBLIC_BUILD_DATE inlined by babel; extra.buildDate for
  // release builds. Never use new Date() — that produces the device date, not
  // the actual build timestamp (LS-5717).
  const rawBuildDate =
    process.env.EXPO_PUBLIC_BUILD_DATE ||
    (Constants.expoConfig?.extra?.buildDate as string | undefined) ||
    'unknown';

  const formattedBuildDate =
    rawBuildDate !== 'unknown'
      ? new Date(rawBuildDate).toLocaleString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZoneName: 'short',
        })
      : rawBuildDate;

  // GraphQL host — extra.graphqlHost is embedded by app.config.js (LS-6399).
  const graphqlHost =
    process.env.EXPO_PUBLIC_GRAPHQL_HOST ||
    (Constants.expoConfig?.extra?.graphqlHost as string | undefined) ||
    'unknown';

  const sdkVersion = Constants.expoConfig?.sdkVersion || 'unknown';

  const nativeBuildVersion: string =
    (Constants.nativeBuildVersion as string | undefined) ||
    (Constants.manifest as { version?: string } | undefined)?.version ||
    'N/A';

  const appName = Constants.expoConfig?.name || 'Legacy Sports';

  const commitUrl =
    rawCommitSha !== 'unknown' && rawCommitSha !== 'dev'
      ? `${REPO_URL}/commit/${rawCommitSha}`
      : null;

  return (
    <ScrollView>
      <YStack
        padding="$6"
        gap="$4"
        backgroundColor="$background"
        minHeight="100%"
      >
        <YStack gap="$2" marginBottom="$4">
          <H1>About {appName}</H1>
          <Text color="$gray11" fontSize="$5">
            Version and build information
          </Text>
        </YStack>

        <YStack
          backgroundColor="$background"
          borderWidth={1}
          borderColor="$borderColor"
          borderRadius="$4"
          padding="$5"
          gap="$3"
        >
          <H3 marginBottom="$2">Build Information</H3>

          <InfoRow label="App Version" value={appVersion} />
          <InfoRow label="Native Build" value={nativeBuildVersion} />
          <InfoRow label="Expo SDK" value={sdkVersion} />
          <InfoRow label="Commit SHA" value={rawCommitSha} />
          <InfoRow label="Build Date" value={formattedBuildDate} />
        </YStack>

        <YStack
          backgroundColor="$background"
          borderWidth={1}
          borderColor="$borderColor"
          borderRadius="$4"
          padding="$5"
          gap="$3"
        >
          <H3 marginBottom="$2">Application Info</H3>

          <InfoRow
            label="Environment"
            value={__DEV__ ? 'development' : 'production'}
          />
          <InfoRow
            label="Platform"
            value={
              (Constants.platform?.ios as boolean | undefined)
                ? 'iOS'
                : (Constants.platform?.android as boolean | undefined)
                  ? 'Android'
                  : 'Unknown'
            }
          />
          <InfoRow label="GraphQL API" value={graphqlHost} />
        </YStack>

        <YStack
          backgroundColor="$background"
          borderWidth={1}
          borderColor="$borderColor"
          borderRadius="$4"
          padding="$5"
          gap="$3"
        >
          <H3 marginBottom="$2">Links</H3>

          <Button
            onPress={() => void Linking.openURL(REPO_URL)}
            variant="outlined"
            size="$3"
          >
            View on GitHub
          </Button>
          {commitUrl && (
            <Button
              onPress={() => void Linking.openURL(commitUrl)}
              variant="outlined"
              size="$3"
            >
              View Current Commit
            </Button>
          )}
        </YStack>

        <YStack
          backgroundColor="$background"
          borderWidth={1}
          borderColor="$borderColor"
          borderRadius="$4"
          padding="$5"
          gap="$3"
        >
          <H3 marginBottom="$2">Get Started</H3>
          <Text color="$gray11" fontSize="$4" marginBottom="$3">
            Ready to manage your fantasy sports league? Join Legacy Sports for
            free.
          </Text>
          <Button onPress={() => router.push('/')} size="$4">
            Get Started Free
          </Button>
        </YStack>

        <YStack marginTop="$4" alignItems="center">
          <Text color="$gray10" fontSize="$3" textAlign="center">
            © {new Date().getFullYear()} Legacy Sports
          </Text>
          <Text color="$gray10" fontSize="$3" textAlign="center" marginTop="$2">
            Fantasy sports management platform
          </Text>
        </YStack>
      </YStack>
    </ScrollView>
  );
}
