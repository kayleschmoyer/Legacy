import React, { useCallback, useState } from 'react';
import {
  Button,
  Paragraph,
  useAuth,
  XStack,
  YStack,
} from '@legacy-sports/shared-components';
import { Dialog } from 'tamagui';
import { env } from '../../config/environment';

/** Max length for user description in the text area. */
const MAX_DESCRIPTION_LENGTH = 1000;

/** Build the summary line from user description, capped at 80 chars. */
function buildSummary(description: string): string {
  const first = description.trim().split('\n')[0] ?? '';
  return first.length > 80 ? `${first.slice(0, 77)}...` : first;
}

/** Detect environment from URL. */
function detectEnvironment(): string {
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return 'local';
  if (host.includes('staging') || host.includes('dev')) return 'staging';
  return 'production';
}

interface SubmitState {
  status: 'idle' | 'loading' | 'success' | 'error';
  message?: string;
}

/**
 * A minimal "Report a Bug" button that opens a small dialog.
 * Attaches auth info automatically so devs can reproduce the issue.
 */
export const BugReportButton: React.FC = () => {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [submitState, setSubmitState] = useState<SubmitState>({
    status: 'idle',
  });
  const [showDetails, setShowDetails] = useState(false);

  const resetForm = useCallback(() => {
    setDescription('');
    setSubmitState({ status: 'idle' });
    setShowDetails(false);
  }, []);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      if (!nextOpen) resetForm();
    },
    [resetForm],
  );

  const handleSubmit = useCallback(async () => {
    if (!description.trim()) return;

    const jiraProxyUrl = env.jiraProxyUrl;
    if (!jiraProxyUrl) {
      setSubmitState({
        status: 'error',
        message: 'Bug reporting is not configured in this environment.',
      });
      return;
    }

    setSubmitState({ status: 'loading' });

    const token =
      typeof localStorage !== 'undefined'
        ? (localStorage.getItem('auth_jwt') ?? '')
        : '';

    const payload = {
      summary: buildSummary(description) || 'Bug report',
      description: description.trim(),
      labels: ['user-reported', 'web'],
      priority: 'Medium' as const,
      // reporterEmail / reporterUsername are overridden server-side from JWT
      reporterEmail: auth?.user?.email ?? '',
      pageUrl: window.location.href,
      userAgent: navigator.userAgent,
      appVersion: env.appVersion,
      environment: detectEnvironment(),
    };

    try {
      const res = await fetch(`${jiraProxyUrl}/jira/bug`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? `HTTP ${String(res.status)}`);
      }

      const data = (await res.json()) as { issueKey?: string };
      setSubmitState({
        status: 'success',
        message: data.issueKey
          ? `Thanks! Created ${data.issueKey}.`
          : 'Thanks for the report!',
      });
    } catch (err) {
      setSubmitState({
        status: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Something went wrong. Try again.',
      });
    }
  }, [description, auth]);

  const isLoading = submitState.status === 'loading';
  const isSuccess = submitState.status === 'success';

  // Don't render when the jira proxy URL is not configured
  if (!env.jiraProxyUrl) return null;

  return (
    <Dialog modal open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>
        <Button
          size="$3"
          borderRadius="$10"
          backgroundColor="transparent"
          borderWidth={0}
          paddingHorizontal="$2"
          hoverStyle={{ backgroundColor: '$color3' }}
          pressStyle={{ backgroundColor: '$color4', scale: 0.97 }}
          aria-label="Report a bug"
          title="Report a bug"
        >
          <Paragraph fontSize={16} lineHeight={18} marginBottom={0}>
            <span role="img" aria-hidden>
              🐛
            </span>
          </Paragraph>
        </Button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay
          animation="medium"
          enterStyle={{ opacity: 0 }}
          exitStyle={{ opacity: 0 }}
          backgroundColor="rgba(0,0,0,0.55)"
        />
        <Dialog.Content
          bordered
          elevate
          maxWidth={480}
          width="100%"
          backgroundColor="$background"
          borderRadius="$6"
          animation="quick"
          enterStyle={{ opacity: 0, y: -16, scale: 0.97 }}
          exitStyle={{ opacity: 0, y: 8, scale: 0.98 }}
          aria-labelledby="bug-report-title"
          aria-describedby="bug-report-desc"
        >
          <YStack gap="$4" padding="$5">
            {/* Header */}
            <XStack justifyContent="space-between" alignItems="center">
              <YStack gap="$1">
                <Paragraph
                  id="bug-report-title"
                  fontSize={18}
                  fontWeight="700"
                  color="$color"
                >
                  Report a Bug
                </Paragraph>
                <Paragraph id="bug-report-desc" size="$2" color="$colorPress">
                  Describe what happened and we&apos;ll file a ticket
                  automatically.
                </Paragraph>
              </YStack>
              <Dialog.Close asChild>
                <Button
                  size="$2"
                  backgroundColor="transparent"
                  borderWidth={0}
                  borderRadius="$10"
                  hoverStyle={{ backgroundColor: '$color3' }}
                  aria-label="Close"
                >
                  <Paragraph fontSize={16}>✕</Paragraph>
                </Button>
              </Dialog.Close>
            </XStack>

            {/* Success state */}
            {isSuccess ? (
              <YStack gap="$3" alignItems="center" paddingVertical="$4">
                <Paragraph fontSize={36} lineHeight={40}>
                  <span role="img" aria-label="success">
                    ✅
                  </span>
                </Paragraph>
                <Paragraph
                  size="$4"
                  color="$green10"
                  fontWeight="600"
                  textAlign="center"
                >
                  {submitState.message}
                </Paragraph>
                <Button
                  size="$3"
                  onPress={() => handleOpenChange(false)}
                  backgroundColor="$color3"
                  borderWidth={0}
                  borderRadius="$5"
                >
                  <Paragraph>Close</Paragraph>
                </Button>
              </YStack>
            ) : (
              <>
                {/* Description input */}
                <YStack gap="$2">
                  <Paragraph size="$3" fontWeight="600" color="$color">
                    What happened?
                  </Paragraph>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    maxLength={MAX_DESCRIPTION_LENGTH}
                    rows={5}
                    placeholder="Describe the issue, steps to reproduce, and what you expected to happen..."
                    aria-label="Bug description"
                    disabled={isLoading}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1px solid var(--borderColor, #334)',
                      backgroundColor: 'var(--background, #1a1a1a)',
                      color: 'var(--color, #eee)',
                      fontSize: 14,
                      lineHeight: 1.5,
                      resize: 'vertical',
                      fontFamily: 'inherit',
                      boxSizing: 'border-box',
                      outline: 'none',
                    }}
                  />
                  <Paragraph size="$1" color="$colorPress" textAlign="right">
                    {description.length}/{MAX_DESCRIPTION_LENGTH}
                  </Paragraph>
                </YStack>

                {/* Collapsible technical details */}
                <YStack gap="$2">
                  <Button
                    size="$2"
                    backgroundColor="transparent"
                    borderWidth={0}
                    paddingHorizontal={0}
                    onPress={() => setShowDetails((v) => !v)}
                    aria-expanded={showDetails}
                    alignSelf="flex-start"
                  >
                    <Paragraph size="$2" color="$colorPress">
                      {showDetails ? '▾' : '▸'} Technical details (included
                      automatically)
                    </Paragraph>
                  </Button>

                  {showDetails && (
                    <YStack
                      backgroundColor="$color2"
                      borderRadius="$4"
                      padding="$3"
                      gap="$1"
                    >
                      {[
                        ['User', auth?.user?.email ?? 'unauthenticated'],
                        ['Page', window.location.href],
                        ['Version', env.appVersion],
                        ['Commit', env.commitSha],
                        ['Environment', detectEnvironment()],
                        ['Browser', navigator.userAgent.slice(0, 80)],
                      ].map(([label, value]) => (
                        <XStack key={label} gap="$2">
                          <Paragraph
                            size="$1"
                            color="$colorPress"
                            fontWeight="600"
                            width={80}
                            flexShrink={0}
                          >
                            {label}:
                          </Paragraph>
                          <Paragraph
                            size="$1"
                            color="$colorPress"
                            flex={1}
                            numberOfLines={2}
                          >
                            {value}
                          </Paragraph>
                        </XStack>
                      ))}
                    </YStack>
                  )}
                </YStack>

                {/* Error message */}
                {submitState.status === 'error' && (
                  <Paragraph size="$2" color="$red10">
                    ⚠ {submitState.message}
                  </Paragraph>
                )}

                {/* Actions */}
                <XStack gap="$3" justifyContent="flex-end">
                  <Dialog.Close asChild>
                    <Button
                      size="$3"
                      backgroundColor="transparent"
                      borderWidth={1}
                      borderColor="$borderColor"
                      borderRadius="$5"
                      disabled={isLoading}
                    >
                      <Paragraph>Cancel</Paragraph>
                    </Button>
                  </Dialog.Close>
                  <Button
                    size="$3"
                    backgroundColor="$blue9"
                    borderWidth={0}
                    borderRadius="$5"
                    disabled={isLoading || !description.trim()}
                    onPress={() => void handleSubmit()}
                    opacity={isLoading || !description.trim() ? 0.6 : 1}
                  >
                    <Paragraph color="white" fontWeight="600">
                      {isLoading ? 'Submitting...' : 'Submit Report'}
                    </Paragraph>
                  </Button>
                </XStack>
              </>
            )}
          </YStack>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
};
