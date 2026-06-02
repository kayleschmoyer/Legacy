import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Button,
  Paragraph,
  XStack,
  YStack,
} from '@legacy-sports/shared-components/ui';
import { useAuth } from '@legacy-sports/shared-components/auth';
import { Dialog } from 'tamagui';
import { Bug } from '@tamagui/lucide-icons';
import { env } from '../../config/environment';
import { CSRF_HEADER, getCsrfToken } from '../../lib/csrf';
import type { CapturedError } from '../../lib/consoleErrorCapture';
import { getCapturedErrors } from '../../lib/consoleErrorCapture';

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

const MAX_ATTACHMENTS = 3;
const MAX_FILE_SIZE_MB = 2;
const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;
/** image/* plus common web-safe video formats */
const ALLOWED_ATTACHMENT_TYPES =
  /^(image\/|video\/(mp4|webm|quicktime|x-msvideo)$)/;

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${String(Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // result is "data:<type>;base64,<data>" — extract only the base64 part
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

interface SubmitState {
  status: 'idle' | 'loading' | 'success' | 'error';
  message?: string;
}

interface SimilarBug {
  issueKey: string;
  summary: string;
  status: string;
}

/** Minimum characters before triggering a duplicate search. */
const SEARCH_MIN_LENGTH = 10;
/** Maximum query length sent to the backend search endpoint. */
const SEARCH_MAX_LENGTH = 200;

/** Uncontrolled mode — renders its own trigger button. */
interface BugReportButtonUncontrolledProps {
  controlledOpen?: undefined;
  onDialogOpenChange?: (open: boolean) => void;
}

/** Controlled mode — dialog open state is managed externally, no trigger
 *  button rendered. `onDialogOpenChange` is required so internal close
 *  actions (overlay click, close button) propagate back to the parent. */
interface BugReportButtonControlledProps {
  controlledOpen: boolean;
  onDialogOpenChange: (open: boolean) => void;
}

type BugReportButtonProps =
  | BugReportButtonUncontrolledProps
  | BugReportButtonControlledProps;

/**
 * A minimal "Report a Bug" button that opens a small dialog.
 * Attaches auth info automatically so devs can reproduce the issue.
 */
export const BugReportButton: React.FC<BugReportButtonProps> = ({
  onDialogOpenChange,
  controlledOpen,
}) => {
  const auth = useAuth();
  const isControlled = controlledOpen !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = isControlled ? controlledOpen : internalOpen;
  const [description, setDescription] = useState('');
  const [submitState, setSubmitState] = useState<SubmitState>({
    status: 'idle',
  });
  const [showDetails, setShowDetails] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [attachmentError, setAttachmentError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [similarBugs, setSimilarBugs] = useState<SimilarBug[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchAbortRef = useRef<AbortController | null>(null);

  const resetForm = useCallback(() => {
    setDescription('');
    setSubmitState({ status: 'idle' });
    setShowDetails(false);
    setAttachments([]);
    setAttachmentError('');
    setSimilarBugs([]);
    setSearchLoading(false);
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
  }, []);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!isControlled) setInternalOpen(nextOpen);
      onDialogOpenChange?.(nextOpen);
      if (!nextOpen) resetForm();
    },
    [resetForm, onDialogOpenChange, isControlled],
  );

  const handleSearchSimilar = useCallback(() => {
    const trimmed = description.trim();
    if (trimmed.length < SEARCH_MIN_LENGTH || !env.jiraProxyUrl) {
      return;
    }

    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setSearchLoading(true);

    const csrfToken = getCsrfToken();
    fetch(`${env.jiraProxyUrl}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken ? { [CSRF_HEADER]: csrfToken } : {}),
      },
      credentials: 'include',
      signal: controller.signal,
      body: JSON.stringify({ query: trimmed.slice(0, SEARCH_MAX_LENGTH) }),
    })
      .then(async (res) => {
        if (!res.ok) {
          setSimilarBugs([]);
          return;
        }
        const data = (await res.json()) as {
          issues: SimilarBug[];
        };
        setSimilarBugs(data.issues ?? []);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setSimilarBugs([]);
      })
      .finally(() => setSearchLoading(false));
  }, [description]);

  // Clear stale similar-bug results whenever the description changes
  useEffect(() => {
    setSimilarBugs([]);
  }, [description]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      // Reset the input so the same file can be re-selected after removal
      e.target.value = '';
      setAttachmentError('');
      const newFiles: File[] = [];
      for (const file of files) {
        if (!ALLOWED_ATTACHMENT_TYPES.test(file.type)) {
          setAttachmentError(
            `${file.name}: unsupported type. Use images or MP4/WebM videos.`,
          );
          return;
        }
        if (file.size > MAX_FILE_SIZE) {
          setAttachmentError(
            `${file.name} is too large (max ${String(MAX_FILE_SIZE_MB)} MB per file).`,
          );
          return;
        }
        newFiles.push(file);
      }
      setAttachments((prev) => {
        const combined = [...prev, ...newFiles];
        if (combined.length > MAX_ATTACHMENTS) {
          setAttachmentError(
            `Maximum ${String(MAX_ATTACHMENTS)} attachments allowed.`,
          );
          return combined.slice(0, MAX_ATTACHMENTS);
        }
        return combined;
      });
    },
    [],
  );

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
    setAttachmentError('');
  }, []);

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

    // Auth is now carried by HttpOnly cookies; no need to read from localStorage.

    // Convert any attached files to base64 before building the payload
    let attachmentData: Array<{ name: string; type: string; data: string }> =
      [];
    if (attachments.length > 0) {
      try {
        attachmentData = await Promise.all(
          attachments.map(async (file) => ({
            name: file.name,
            type: file.type,
            data: await readFileAsBase64(file),
          })),
        );
      } catch {
        setSubmitState({
          status: 'error',
          message: 'Failed to read attachment files. Please try again.',
        });
        return;
      }
    }

    const recentErrors = getCapturedErrors();
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
      commitSha: env.commitSha,
      environment: detectEnvironment(),
      viewport: `${String(window.innerWidth)}x${String(window.innerHeight)}`,
      timestamp: new Date().toISOString(),
      ...(recentErrors.length > 0 ? { recentErrors } : {}),
      ...(attachmentData.length > 0 ? { attachments: attachmentData } : {}),
    };

    try {
      const csrfToken = getCsrfToken();
      const res = await fetch(`${jiraProxyUrl}/bug`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { [CSRF_HEADER]: csrfToken } : {}),
        },
        // Send HttpOnly JWT cookie for authentication
        credentials: 'include',
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
  }, [description, auth, attachments]);

  const isLoading = submitState.status === 'loading';
  const isSuccess = submitState.status === 'success';
  const capturedErrors = getCapturedErrors();

  // Don't render when the jira proxy URL is not configured
  if (!env.jiraProxyUrl) return null;

  return (
    <Dialog modal open={open} onOpenChange={handleOpenChange}>
      {!isControlled && (
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
            <Bug size={18} />
          </Button>
        </Dialog.Trigger>
      )}

      <Dialog.Portal>
        <Dialog.Overlay
          animation="medium"
          enterStyle={{ opacity: 0 }}
          exitStyle={{ opacity: 0 }}
          backgroundColor="rgba(0,0,0,0.55)"
        />
        <Dialog.Content
          data-testid="bug-report-dialog"
          bordered
          elevate
          width="92%"
          maxWidth={480}
          backgroundColor="$background"
          borderRadius="$6"
          animation="quick"
          enterStyle={{ opacity: 0, y: -16, scale: 0.97 }}
          exitStyle={{ opacity: 0, y: 8, scale: 0.98 }}
          aria-labelledby="bug-report-title"
          aria-describedby="bug-report-desc"
          onInteractOutside={(e: { preventDefault(): void }) => {
            // Prevent accidentally losing typed content or attachments when clicking outside
            if (description.trim() || attachments.length > 0) {
              e.preventDefault();
            }
          }}
        >
          <YStack gap="$4" padding="$5">
            {/* Header */}
            <XStack justifyContent="space-between" alignItems="center" gap="$2">
              <YStack gap="$1" flex={1}>
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
                  flexShrink={0}
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
                      border: '1px solid var(--borderColor, #d1d5db)',
                      backgroundColor: 'var(--background, #ffffff)',
                      color: 'var(--color, #0b1220)',
                      fontSize: 14,
                      lineHeight: 1.5,
                      resize: 'vertical',
                      fontFamily: 'inherit',
                      boxSizing: 'border-box',
                      outline: 'none',
                    }}
                  />
                  <Paragraph
                    data-testid="bug-char-counter"
                    size="$1"
                    color="$colorPress"
                    textAlign="right"
                  >
                    {description.length}/{MAX_DESCRIPTION_LENGTH}
                  </Paragraph>
                </YStack>

                {/* Search for similar bugs */}
                <Button
                  size="$2"
                  onPress={handleSearchSimilar}
                  disabled={
                    searchLoading ||
                    description.trim().length < SEARCH_MIN_LENGTH
                  }
                  alignSelf="flex-start"
                >
                  {searchLoading ? 'Searching…' : 'Search for similar reports'}
                </Button>

                {/* Similar existing bugs */}
                {similarBugs.length > 0 &&
                  description.trim().length >= SEARCH_MIN_LENGTH && (
                    <YStack
                      gap="$2"
                      backgroundColor="$yellow2"
                      borderRadius="$4"
                      padding="$3"
                      borderWidth={1}
                      borderColor="$yellow7"
                    >
                      <Paragraph size="$2" fontWeight="600" color="$yellow11">
                        {`Similar bug${similarBugs.length === 1 ? '' : 's'} already reported:`}
                      </Paragraph>
                      {similarBugs.map((bug) => (
                        <XStack
                          key={bug.issueKey}
                          gap="$2"
                          alignItems="flex-start"
                          paddingVertical="$1"
                        >
                          <Paragraph
                            size="$2"
                            fontWeight="600"
                            color="$yellow11"
                            flexShrink={0}
                          >
                            {bug.issueKey}
                          </Paragraph>
                          <YStack flex={1}>
                            <Paragraph
                              size="$2"
                              color="$color"
                              numberOfLines={2}
                            >
                              {bug.summary}
                            </Paragraph>
                            <Paragraph size="$1" color="$colorPress">
                              Status: {bug.status}
                            </Paragraph>
                          </YStack>
                        </XStack>
                      ))}
                      {similarBugs.length > 0 && (
                        <Paragraph size="$1" color="$yellow11">
                          You can still submit your report — it helps us know
                          more people are affected.
                        </Paragraph>
                      )}
                    </YStack>
                  )}

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
                        [
                          'Viewport',
                          `${String(window.innerWidth)}x${String(window.innerHeight)}`,
                        ],
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
                      {capturedErrors.length > 0 && (
                        <YStack gap="$1" marginTop="$2">
                          <Paragraph
                            size="$1"
                            color="$colorPress"
                            fontWeight="600"
                          >
                            Recent errors ({String(capturedErrors.length)}):
                          </Paragraph>
                          {capturedErrors.map((e: CapturedError, i: number) => (
                            <Paragraph
                              key={String(i)}
                              size="$1"
                              color="$red10"
                              numberOfLines={2}
                            >
                              {e.message}
                            </Paragraph>
                          ))}
                        </YStack>
                      )}
                    </YStack>
                  )}
                </YStack>

                {/* Attachments */}
                <YStack gap="$2">
                  <XStack alignItems="center" gap="$2">
                    <Paragraph size="$3" fontWeight="600" color="$color">
                      Attachments
                    </Paragraph>
                    <Paragraph size="$2" color="$colorPress">
                      (optional · images or videos · max {MAX_ATTACHMENTS}{' '}
                      files, {MAX_FILE_SIZE_MB} MB each)
                    </Paragraph>
                  </XStack>

                  {/* Hidden file input */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/mp4,video/webm,video/quicktime"
                    multiple
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                    aria-label="Add screenshot or video"
                  />

                  {/* File list */}
                  {attachments.length > 0 && (
                    <YStack gap="$1">
                      {attachments.map((file, i) => (
                        <XStack
                          key={`${file.name}-${String(i)}`}
                          alignItems="center"
                          gap="$2"
                          backgroundColor="$color2"
                          borderRadius="$3"
                          paddingVertical="$1"
                          paddingHorizontal="$2"
                        >
                          <Paragraph size="$2" flex={1} numberOfLines={1}>
                            {file.type.startsWith('image/') ? '🖼 ' : '🎥 '}
                            {file.name}
                          </Paragraph>
                          <Paragraph size="$1" color="$colorPress">
                            {formatFileSize(file.size)}
                          </Paragraph>
                          <Button
                            size="$1"
                            backgroundColor="transparent"
                            borderWidth={0}
                            padding="$1"
                            onPress={() => removeAttachment(i)}
                            aria-label={`Remove ${file.name}`}
                            disabled={isLoading}
                          >
                            <Paragraph size="$2" color="$colorPress">
                              ✕
                            </Paragraph>
                          </Button>
                        </XStack>
                      ))}
                    </YStack>
                  )}

                  {/* Add-file button */}
                  {attachments.length < MAX_ATTACHMENTS && (
                    <Button
                      size="$2"
                      backgroundColor="transparent"
                      borderWidth={1}
                      borderColor="$borderColor"
                      borderRadius="$4"
                      onPress={() => fileInputRef.current?.click()}
                      disabled={isLoading}
                      alignSelf="flex-start"
                    >
                      <Paragraph size="$2" color="$colorPress">
                        + Add screenshot or video
                      </Paragraph>
                    </Button>
                  )}

                  {attachmentError && (
                    <Paragraph size="$2" color="$red10">
                      ⚠ {attachmentError}
                    </Paragraph>
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
                      data-testid="bug-report-dialog-cancel"
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
