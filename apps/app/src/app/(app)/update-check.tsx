import React, { useCallback, useState } from 'react';
import { Platform, ScrollView } from 'react-native';
import {
  Button,
  H1,
  H3,
  Paragraph,
  Separator,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';

import { config } from '@legacy-sports/app-config/native';
import {
  ApkInstallPermissionError,
  downloadApk,
  launchApkInstaller,
  openInstallPackagesSettings,
  verifyApkIntegrity,
} from '../../features/updates/installApk';
import {
  fetchLatestRelease,
  type LatestReleaseInfo,
  logUpdateCheckError,
  NoReleaseAvailableError,
} from '../../features/updates/checkForUpdate';

type Phase =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'checked'; info: LatestReleaseInfo }
  | { kind: 'no-release' }
  | { kind: 'downloading'; written: number; expected: number }
  | { kind: 'verifying' }
  | { kind: 'installing'; fileUri: string }
  | { kind: 'permission-required'; fileUri: string }
  | { kind: 'error'; message: string };

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}

function getInstalledVersion(): string {
  return config.appVersion ?? '0.0.0';
}

function progressPercent(written: number, expected: number): number {
  if (expected <= 0) return 0;
  return Math.min(100, Math.round((written / expected) * 100));
}

export default function UpdateCheckScreen(): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const installedVersion = getInstalledVersion();

  const handleCheck = useCallback(async () => {
    setPhase({ kind: 'checking' });
    try {
      const info = await fetchLatestRelease({ installedVersion });
      setPhase({ kind: 'checked', info });
    } catch (error) {
      logUpdateCheckError('fetchLatestRelease', error);
      if (error instanceof NoReleaseAvailableError) {
        setPhase({ kind: 'no-release' });
        return;
      }
      setPhase({
        kind: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Could not check for updates',
      });
    }
  }, [installedVersion]);

  const handleInstall = useCallback(async (fileUri: string) => {
    setPhase({ kind: 'installing', fileUri });
    try {
      await launchApkInstaller(fileUri);
    } catch (error) {
      logUpdateCheckError('launchApkInstaller', error);
      if (error instanceof ApkInstallPermissionError) {
        // The downloaded APK is preserved on disk — show the permission phase
        // so the user can open Settings and retry without re-downloading.
        setPhase({ kind: 'permission-required', fileUri });
        return;
      }
      setPhase({
        kind: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Could not launch the APK installer',
      });
    }
  }, []);

  const handleDownloadAndInstall = useCallback(
    async (info: LatestReleaseInfo) => {
      setPhase({
        kind: 'downloading',
        written: 0,
        expected: info.apkSizeBytes,
      });
      let fileUri: string;
      try {
        fileUri = await downloadApk(info.apkDownloadUrl, (p) => {
          setPhase({
            kind: 'downloading',
            written: p.totalBytesWritten,
            expected: p.totalBytesExpectedToWrite || info.apkSizeBytes,
          });
        });
        if (info.apkSha256Url) {
          setPhase({ kind: 'verifying' });
          await verifyApkIntegrity(fileUri, info.apkSha256Url);
        }
      } catch (error) {
        logUpdateCheckError('downloadApk', error);
        setPhase({
          kind: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'Could not download the APK',
        });
        return;
      }
      await handleInstall(fileUri);
    },
    [handleInstall],
  );

  if (Platform.OS !== 'android') {
    return (
      <ScrollView>
        <YStack
          padding="$5"
          gap="$4"
          backgroundColor="$background"
          minHeight="100%"
        >
          <H1>Check for Updates</H1>
          <Paragraph color="$colorPress">
            In-app updates are only available on the Android pre-release build.
            On this platform, install the latest version from your app store.
          </Paragraph>
        </YStack>
      </ScrollView>
    );
  }

  return (
    <ScrollView>
      <YStack
        padding="$5"
        gap="$5"
        backgroundColor="$background"
        minHeight="100%"
      >
        <YStack gap="$2">
          <H1>Check for Updates</H1>
          <Paragraph color="$colorPress">
            Pre-release Android builds are distributed outside the Play Store.
            Use this screen to pull the latest APK from GitHub.
          </Paragraph>
        </YStack>

        <YStack
          borderWidth={1}
          borderColor="$borderColor"
          borderRadius="$5"
          padding="$5"
          gap="$3"
        >
          <H3>Installed</H3>
          <XStack justifyContent="space-between">
            <Text>Version</Text>
            <Text fontFamily="$mono">{installedVersion}</Text>
          </XStack>
        </YStack>

        {phase.kind === 'idle' ? (
          <Button
            testID="update-check-button"
            onPress={() => void handleCheck()}
          >
            Check for updates
          </Button>
        ) : null}

        {phase.kind === 'checking' ? (
          <XStack alignItems="center" gap="$3">
            <Spinner />
            <Paragraph>Checking GitHub Releases…</Paragraph>
          </XStack>
        ) : null}

        {phase.kind === 'checked' ? (
          <YStack
            borderWidth={1}
            borderColor="$borderColor"
            borderRadius="$5"
            padding="$5"
            gap="$3"
          >
            <H3>
              {phase.info.updateAvailable
                ? 'Update available'
                : 'You appear to be up to date'}
            </H3>
            <XStack justifyContent="space-between">
              <Text>Latest version</Text>
              <Text fontFamily="$mono">{phase.info.latestVersion}</Text>
            </XStack>
            <XStack justifyContent="space-between">
              <Text>Build</Text>
              <Text fontFamily="$mono">{phase.info.latestBuildNumber}</Text>
            </XStack>
            <XStack justifyContent="space-between">
              <Text>Size</Text>
              <Text fontFamily="$mono">
                {formatBytes(phase.info.apkSizeBytes)}
              </Text>
            </XStack>
            <Separator marginVertical="$2" />
            <Paragraph size="$2" color="$colorPress">
              Published {new Date(phase.info.publishedAt).toLocaleString()}
            </Paragraph>
            <Button
              testID="update-download-button"
              onPress={() => void handleDownloadAndInstall(phase.info)}
            >
              Download & install
            </Button>
            <Button
              chromeless
              testID="update-recheck-button"
              onPress={() => void handleCheck()}
            >
              Check again
            </Button>
          </YStack>
        ) : null}

        {phase.kind === 'no-release' ? (
          <YStack
            borderWidth={1}
            borderColor="$borderColor"
            borderRadius="$5"
            padding="$5"
            gap="$3"
          >
            <H3>No release available yet</H3>
            <Paragraph color="$colorPress">
              No Android build has been published to GitHub Releases yet. Check
              back later.
            </Paragraph>
            <Button
              testID="update-recheck-button"
              onPress={() => void handleCheck()}
            >
              Check again
            </Button>
          </YStack>
        ) : null}

        {phase.kind === 'downloading' ? (
          <YStack
            gap="$3"
            padding="$4"
            borderRadius="$5"
            borderWidth={1}
            borderColor="$borderColor"
          >
            <H3>Downloading…</H3>
            <Paragraph fontFamily="$mono">
              {formatBytes(phase.written)} / {formatBytes(phase.expected)} (
              {progressPercent(phase.written, phase.expected)}%)
            </Paragraph>
            <Spinner />
          </YStack>
        ) : null}

        {phase.kind === 'verifying' ? (
          <YStack
            gap="$3"
            padding="$4"
            borderRadius="$5"
            borderWidth={1}
            borderColor="$borderColor"
          >
            <H3>Verifying integrity…</H3>
            <Paragraph color="$colorPress">
              Checking the download against the published checksum.
            </Paragraph>
            <Spinner />
          </YStack>
        ) : null}

        {phase.kind === 'installing' ? (
          <YStack
            gap="$3"
            padding="$4"
            borderRadius="$5"
            borderWidth={1}
            borderColor="$borderColor"
          >
            <H3>Opening installer…</H3>
            <Paragraph color="$colorPress">
              Android will ask you to confirm the install.
            </Paragraph>
          </YStack>
        ) : null}

        {phase.kind === 'permission-required' ? (
          <YStack
            gap="$3"
            padding="$4"
            borderRadius="$5"
            borderWidth={1}
            borderColor="$borderColor"
          >
            <H3>Permission required</H3>
            <Paragraph color="$colorPress">
              Android requires the &quot;Install unknown apps&quot; permission
              for this app before it can install the APK. Open Settings to grant
              it, then tap Install.
            </Paragraph>
            <Button
              testID="update-open-settings-button"
              onPress={() => void openInstallPackagesSettings()}
            >
              Open Settings
            </Button>
            <Button
              chromeless
              testID="update-retry-install-button"
              onPress={() => void handleInstall(phase.fileUri)}
            >
              Install
            </Button>
          </YStack>
        ) : null}

        {phase.kind === 'error' ? (
          <YStack
            gap="$3"
            padding="$4"
            borderRadius="$5"
            borderWidth={1}
            borderColor="$red8"
          >
            <H3 color="$red10">Something went wrong</H3>
            <Paragraph color="$red11">{phase.message}</Paragraph>
            <Button onPress={() => setPhase({ kind: 'idle' })}>
              Try again
            </Button>
          </YStack>
        ) : null}
      </YStack>
    </ScrollView>
  );
}
export { ScreenErrorBoundary as ErrorBoundary } from './_screenErrorBoundary';
