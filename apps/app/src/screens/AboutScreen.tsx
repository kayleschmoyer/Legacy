import React from 'react';
import { ScrollView } from 'react-native';
import { H1, H3, Text, XStack, YStack } from 'tamagui';
import Constants from 'expo-constants';

// Type definition for global __DEV__
declare const __DEV__: boolean;

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
  // Get version from app.json via Constants
  const appVersion = Constants.expoConfig?.version || 'unknown';
  const sdkVersion = Constants.expoConfig?.sdkVersion || 'unknown';
  const buildDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Get native build info if available
  const nativeBuildVersion: string =
    (Constants.nativeBuildVersion as string | undefined) ||
    (Constants.manifest as { version?: string } | undefined)?.version ||
    'N/A';
  const appName = Constants.expoConfig?.name || 'Legacy Sports';

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
          <InfoRow label="Build Date" value={buildDate} />
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
            value={__DEV__ ? 'Development' : 'Production'}
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
