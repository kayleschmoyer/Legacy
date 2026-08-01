import React, { useState } from 'react';
import { Modal, Platform } from 'react-native';
import { Button, Spinner, Text, TextArea, View, XStack, YStack } from 'tamagui';
import { modalScrim } from '@legacy-sports/design-tokens';
import { config } from '@legacy-sports/app-config/native';
import { SecureStorageProvider } from '@legacy-sports/shared-components';
import { LOGGER } from '@legacy-sports/logging';
import { captureError } from '@legacy-sports/rollbar/native';
import { INTERNAL_JWT_KEY } from '../../common/auth/jwtRefresh';

const MAX_DESCRIPTION_LENGTH = 1000;

/** Build the Jira summary line from the user description, capped at 80 chars. */
function buildSummary(description: string): string {
  const first = description.trim().split('\n')[0] ?? '';
  return first.length > 80 ? `${first.slice(0, 77)}...` : first;
}

export interface BugReportModalProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * In-app "Report a Bug" flow for native. Submits directly to the jira-proxy
 * `/bug` endpoint — the same destination and Jira project as the web bug
 * report modal (apps/web/src/components/layout/BugReportButton.tsx).
 */
export default function BugReportModal({
  visible,
  onClose,
}: BugReportModalProps): React.JSX.Element {
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const resetAndClose = () => {
    setDescription('');
    setSubmitting(false);
    setErrorMessage('');
    setSuccessMessage('');
    onClose();
  };

  const handleSubmit = async () => {
    const trimmed = description.trim();
    if (!trimmed || !config.jiraProxyUrl) return;

    setSubmitting(true);
    setErrorMessage('');

    try {
      const token = await SecureStorageProvider.getItem(INTERNAL_JWT_KEY);
      const res = await fetch(`${config.jiraProxyUrl}/bug`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          // No client-side sanitization needed: jira-proxy's buildDescription()
          // (lambdas/jira-proxy/src/JiraClient.ts) places this text into an
          // Atlassian Document Format `text` node, not interpolated HTML/wiki
          // markup, so there's no injection surface here — same as web's
          // BugReportButton, which sends this field unsanitized too.
          summary: buildSummary(trimmed) || 'Bug report',
          description: trimmed,
          labels: ['user-reported', 'mobile'],
          priority: 'Medium',
          appVersion: config.appVersion,
          commitSha: config.commitSha,
          environment: __DEV__ ? 'local' : 'production',
          userAgent: `${Platform.OS} ${String(Platform.Version)}`,
          timestamp: new Date().toISOString(),
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? `HTTP ${String(res.status)}`);
      }

      const data = (await res.json()) as { issueKey?: string };
      setSuccessMessage(
        data.issueKey
          ? `Thanks! Created ${data.issueKey}.`
          : 'Thanks for the report!',
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Something went wrong.';
      const errorObj = err instanceof Error ? err : new Error(message);
      LOGGER.error('Failed to submit native bug report', errorObj);
      captureError(errorObj);
      setErrorMessage(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={resetAndClose}
    >
      <View
        backgroundColor={modalScrim}
        flex={1}
        justifyContent="center"
        alignItems="center"
        padding="$4"
      >
        <YStack
          backgroundColor="$background"
          borderRadius="$5"
          padding="$5"
          width="90%"
          maxWidth={420}
          gap="$4"
        >
          {successMessage ? (
            <YStack gap="$3" alignItems="center" paddingVertical="$4">
              <Text fontSize={36}>✅</Text>
              <Text
                fontSize="$4"
                fontWeight="600"
                color="$green10"
                textAlign="center"
              >
                {successMessage}
              </Text>
              <Button size="$3" onPress={resetAndClose}>
                <Text>Close</Text>
              </Button>
            </YStack>
          ) : (
            <>
              <YStack gap="$1">
                <Text fontSize={18} fontWeight="700" color="$color">
                  Report a Bug
                </Text>
                <Text fontSize="$3" color="$colorPress">
                  Describe what happened and we&apos;ll file a ticket
                  automatically.
                </Text>
              </YStack>

              <TextArea
                value={description}
                onChangeText={setDescription}
                maxLength={MAX_DESCRIPTION_LENGTH}
                numberOfLines={5}
                placeholder="Describe the issue, steps to reproduce, and what you expected to happen..."
                aria-label="Bug description"
                editable={!submitting}
              />

              {errorMessage ? (
                <Text fontSize="$2" color="$red10">
                  ⚠ {errorMessage}
                </Text>
              ) : null}

              <XStack gap="$3" justifyContent="flex-end">
                <Button
                  size="$3"
                  backgroundColor="transparent"
                  borderWidth={1}
                  borderColor="$borderColor"
                  disabled={submitting}
                  onPress={resetAndClose}
                >
                  <Text>Cancel</Text>
                </Button>
                <Button
                  size="$3"
                  backgroundColor="$brandNavyLight"
                  disabled={submitting || !description.trim()}
                  opacity={submitting || !description.trim() ? 0.6 : 1}
                  onPress={() => void handleSubmit()}
                >
                  {submitting ? (
                    <Spinner color="white" />
                  ) : (
                    <Text color="white" fontWeight="600">
                      Submit Report
                    </Text>
                  )}
                </Button>
              </XStack>
            </>
          )}
        </YStack>
      </View>
    </Modal>
  );
}
