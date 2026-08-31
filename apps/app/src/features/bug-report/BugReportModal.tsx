import React, { useState } from 'react';
import { Modal, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Button, Spinner, Text, TextArea, View, XStack, YStack } from 'tamagui';
import { modalScrim } from '@legacy-sports/design-tokens';
import { config } from '@legacy-sports/app-config/native';
import { SecureStorageProvider } from '@legacy-sports/shared-components';
import { LOGGER } from '@legacy-sports/logging';
import { captureError } from '@legacy-sports/rollbar/native';
import { INTERNAL_JWT_KEY } from '../../common/auth/jwtRefresh';

const MAX_DESCRIPTION_LENGTH = 1000;

/**
 * Attachment limits. These deliberately mirror the jira-proxy server-side
 * constants of the same name (lambdas/jira-proxy/src/index.ts) so the client
 * rejects a file with a readable message instead of letting the request fail
 * with a generic 400. Keep the two in sync.
 */
const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_SIZE_MB = 2;
const MAX_ATTACHMENT_SIZE_BYTES = MAX_ATTACHMENT_SIZE_MB * 1024 * 1024;
/**
 * Images only. The backend also accepts video, but the native picker here is
 * scoped to screenshots — the common case for a mobile bug report.
 */
const ALLOWED_ATTACHMENT_TYPES = /^image\//;

/**
 * JPEG compression applied to picked images. Screenshots of UI defects need to
 * stay legible, so this sits well above the picker's typical downscale while
 * still keeping a phone screenshot comfortably inside the 2 MB cap.
 */
const IMAGE_PICKER_QUALITY = 0.8;

/** Build the Jira summary line from the user description, capped at 80 chars. */
function buildSummary(description: string): string {
  const first = description.trim().split('\n')[0] ?? '';
  return first.length > 80 ? `${first.slice(0, 77)}...` : first;
}

/** A screenshot the user picked, already base64-encoded and validated. */
interface PickedAttachment {
  /** Filename sent to Jira (sanitized server-side before upload). */
  name: string;
  /** MIME type, e.g. "image/jpeg". */
  type: string;
  /** Base64 file content, no data-URI prefix — the shape jira-proxy expects. */
  data: string;
  /** Decoded byte size, for display and the size cap. */
  size: number;
}

/**
 * Decoded byte count for a base64 payload, using the *same* estimate the
 * jira-proxy applies (`Math.ceil(len * 3 / 4)`). Matching the server's formula
 * exactly is what guarantees a file accepted here is not rejected there.
 */
function estimateDecodedBytes(base64: string): number {
  return Math.ceil((base64.length * 3) / 4);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${String(Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Derive a filename when the picker doesn't supply one (common on Android). */
function fallbackFilename(mimeType: string, index: number): string {
  const ext = mimeType.split('/')[1] ?? 'jpg';
  return `screenshot-${String(Date.now())}-${String(index)}.${ext}`;
}

/** Which kind of feedback this modal collects. */
export type ReportKind = 'bug' | 'feature';

/**
 * Per-kind copy and Jira payload shape. Feature requests file as `Task` so they
 * do not land in the client-bug backlog as defects to reproduce (LS-9247).
 */
const REPORT_KINDS = {
  bug: {
    issueType: 'Bug',
    title: 'Report a Bug',
    subtitle: "Describe what happened and we'll file a ticket automatically.",
    placeholder:
      'Describe the issue, steps to reproduce, and what you expected to happen...',
    inputLabel: 'Bug description',
    submitLabel: 'Submit Report',
    fallbackSummary: 'Bug report',
    labels: ['user-reported', 'mobile'],
  },
  feature: {
    issueType: 'Task',
    title: 'Suggest a Feature',
    subtitle: "Tell us your idea and we'll file it for the team to review.",
    placeholder:
      'Describe the feature you want, and what it would let you do...',
    inputLabel: 'Feature request description',
    submitLabel: 'Submit Suggestion',
    fallbackSummary: 'Feature request',
    labels: ['user-reported', 'mobile', 'feature-request'],
  },
} as const satisfies Record<
  ReportKind,
  {
    issueType: string;
    title: string;
    subtitle: string;
    placeholder: string;
    inputLabel: string;
    submitLabel: string;
    fallbackSummary: string;
    labels: readonly string[];
  }
>;

export interface BugReportModalProps {
  visible: boolean;
  onClose: () => void;
  /** Which flow to render. Defaults to the bug-report flow. */
  kind?: ReportKind;
}

/**
 * In-app feedback flow for native, covering both "Report a Bug" and
 * "Suggest a Feature" (`kind`). Submits directly to the jira-proxy `/bug`
 * endpoint — the same destination and Jira project as the web bug report modal
 * (apps/web/src/components/layout/BugReportButton.tsx) — with the issue type
 * and labels varying by kind.
 */
export default function BugReportModal({
  visible,
  onClose,
  kind = 'bug',
}: BugReportModalProps): React.JSX.Element {
  const copy = REPORT_KINDS[kind];
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [attachments, setAttachments] = useState<PickedAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState('');

  const resetAndClose = () => {
    setDescription('');
    setSubmitting(false);
    setErrorMessage('');
    setSuccessMessage('');
    setAttachments([]);
    setAttachmentError('');
    onClose();
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
    setAttachmentError('');
  };

  const handleAddImage = async () => {
    setAttachmentError('');

    const remaining = MAX_ATTACHMENTS - attachments.length;
    if (remaining <= 0) {
      setAttachmentError(`Maximum ${String(MAX_ATTACHMENTS)} images allowed.`);
      return;
    }

    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setAttachmentError(
          'Photo library permission is required to attach an image.',
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        base64: true,
        quality: IMAGE_PICKER_QUALITY,
        allowsMultipleSelection: true,
        selectionLimit: remaining,
      });
      if (result.canceled) return;

      const picked: PickedAttachment[] = [];
      for (const [index, asset] of result.assets.entries()) {
        const type = asset.mimeType ?? 'image/jpeg';
        if (!ALLOWED_ATTACHMENT_TYPES.test(type)) {
          setAttachmentError(
            `Unsupported file type "${type}". Please choose an image.`,
          );
          return;
        }
        if (!asset.base64) {
          setAttachmentError('Could not read that image. Please try again.');
          return;
        }
        const size = estimateDecodedBytes(asset.base64);
        const name = asset.fileName ?? fallbackFilename(type, index);
        if (size > MAX_ATTACHMENT_SIZE_BYTES) {
          setAttachmentError(
            `${name} is too large (${formatFileSize(size)}). Maximum ${String(MAX_ATTACHMENT_SIZE_MB)} MB per image.`,
          );
          return;
        }
        picked.push({ name, type, data: asset.base64, size });
      }

      // Defensive: the picker honours `selectionLimit`, but never let the list
      // exceed what the backend accepts even if a platform ignores it.
      setAttachments((prev) => [...prev, ...picked].slice(0, MAX_ATTACHMENTS));
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      LOGGER.error('Failed to pick bug report image', errorObj);
      captureError(errorObj);
      setAttachmentError('Could not open the image library.');
    }
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
          summary: buildSummary(trimmed) || copy.fallbackSummary,
          description: trimmed,
          issueType: copy.issueType,
          labels: [...copy.labels],
          priority: 'Medium',
          appVersion: config.appVersion,
          commitSha: config.commitSha,
          environment: __DEV__ ? 'local' : 'production',
          userAgent: `${Platform.OS} ${String(Platform.Version)}`,
          timestamp: new Date().toISOString(),
          // Omit the key entirely when nothing is attached, so the payload is
          // byte-for-byte what it was before attachments existed.
          ...(attachments.length > 0
            ? {
                attachments: attachments.map(({ name, type, data }) => ({
                  name,
                  type,
                  data,
                })),
              }
            : {}),
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
          : 'Thanks for the feedback!',
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Something went wrong.';
      const errorObj = err instanceof Error ? err : new Error(message);
      LOGGER.error(`Failed to submit native ${kind} report`, errorObj);
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
                  {copy.title}
                </Text>
                <Text fontSize="$3" color="$colorPress">
                  {copy.subtitle}
                </Text>
              </YStack>

              <TextArea
                value={description}
                onChangeText={setDescription}
                maxLength={MAX_DESCRIPTION_LENGTH}
                numberOfLines={5}
                placeholder={copy.placeholder}
                aria-label={copy.inputLabel}
                editable={!submitting}
              />

              <YStack gap="$2">
                <Text fontSize="$3" fontWeight="600" color="$color">
                  Screenshots
                </Text>
                <Text fontSize="$2" color="$colorPress">
                  Optional · up to {MAX_ATTACHMENTS} images ·{' '}
                  {MAX_ATTACHMENT_SIZE_MB} MB each
                </Text>

                {attachments.map((attachment, index) => (
                  <XStack
                    key={`${attachment.name}-${String(index)}`}
                    alignItems="center"
                    gap="$2"
                    backgroundColor="$color2"
                    borderRadius="$3"
                    paddingVertical="$1"
                    paddingHorizontal="$2"
                  >
                    <Text fontSize="$2" flex={1} numberOfLines={1}>
                      🖼 {attachment.name}
                    </Text>
                    <Text fontSize="$1" color="$colorPress">
                      {formatFileSize(attachment.size)}
                    </Text>
                    <Button
                      size="$1"
                      backgroundColor="transparent"
                      borderWidth={0}
                      disabled={submitting}
                      aria-label={`Remove ${attachment.name}`}
                      onPress={() => removeAttachment(index)}
                    >
                      <Text fontSize="$2" color="$colorPress">
                        ✕
                      </Text>
                    </Button>
                  </XStack>
                ))}

                {attachments.length < MAX_ATTACHMENTS ? (
                  <Button
                    size="$2"
                    backgroundColor="transparent"
                    borderWidth={1}
                    borderColor="$borderColor"
                    borderRadius="$4"
                    alignSelf="flex-start"
                    disabled={submitting}
                    onPress={() => void handleAddImage()}
                  >
                    <Text fontSize="$2" color="$colorPress">
                      + Add screenshot
                    </Text>
                  </Button>
                ) : null}

                {attachmentError ? (
                  <Text fontSize="$2" color="$red10">
                    ⚠ {attachmentError}
                  </Text>
                ) : null}
              </YStack>

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
                      {copy.submitLabel}
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
