/**
 * Admin management of the Android download allowlist (LS-9456).
 *
 * The point of this page is that an address can be invited before its owner
 * has ever used the product — that is the normal case for a new tester. So the
 * "Account" column is information, never a gate: a row with no account behind
 * it is marked, not disabled, and adding such an address is the expected flow.
 *
 * Access is checked at page level rather than by a route guard, matching
 * AdminRevenuePage: a non-admin who lands here sees an explanation instead of
 * being bounced to the home page. The server re-checks on every field, so this
 * is presentation only.
 */

import React, { useState } from 'react';
import {
  Button,
  Paragraph,
  XStack,
  YStack,
} from '@legacy-sports/shared-components/ui';
import { useAuth } from '@legacy-sports/shared-components/auth';
import { Card, H1, Input, Spinner, Text } from 'tamagui';
import { Lock } from '@tamagui/lucide-icons/icons/Lock';
import {
  AppDownloadAllowlist,
  type AppDownloadAllowlistQuery,
  useAddAppDownloadAllowlistEntryMutation,
  useAppDownloadAllowlistQuery,
  useGetUserByIdQuery,
  useSetAppDownloadAllowlistRevokedMutation,
} from '@legacy-sports/graphql';
import type { ApolloCache } from '@apollo/client';
import { LOGGER } from '@legacy-sports/logging';
import { PageMeta } from '../../components/PageMeta';
import {
  BRAND_GOLD,
  BRAND_NAVY,
  BRAND_SEAM_RED,
  GREEN,
  withAlpha,
} from '../../constants/colors';

/** Renders a timestamp for scanning, not for precision. */
function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString();
}

/**
 * Replace the cached allowlist with the list a mutation just returned.
 *
 * Both mutations return the whole refreshed list precisely so the page can do
 * this: normalisation alone would update the fields of rows Apollo already
 * knows, but it would not add a newly created row to the `appDownloadAllowlist`
 * result, so an add would appear only after a refetch.
 */
function writeAllowlist(
  cache: ApolloCache,
  entries: AppDownloadAllowlistQuery['appDownloadAllowlist'],
): void {
  cache.writeQuery<AppDownloadAllowlistQuery>({
    query: AppDownloadAllowlist,
    data: { __typename: 'Query', appDownloadAllowlist: entries },
  });
}

export default function AdminAppDownloadsPage() {
  const auth = useAuth();
  const [emailInput, setEmailInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [feedback, setFeedback] = useState<{
    tone: 'ok' | 'error';
    text: string;
  } | null>(null);
  const [pendingRowId, setPendingRowId] = useState<number | null>(null);

  const currentUserId = auth.user?.id ?? 0;
  const { data: serverUserData, loading: serverUserLoading } =
    useGetUserByIdQuery({
      variables: { id: currentUserId },
      skip: !auth.isAuthenticated || currentUserId === 0,
      fetchPolicy: 'network-only',
    });

  // Server-verified access level, not the JWT claim — same reason
  // requireAdmin re-reads the database on the resolver side.
  const isAdmin = serverUserData?.user?.accessLevel === 'admin';

  const { data, loading, error } = useAppDownloadAllowlistQuery({
    fetchPolicy: 'cache-and-network',
    skip: !isAdmin,
  });

  const [addEntry, { loading: adding }] =
    useAddAppDownloadAllowlistEntryMutation();
  const [setRevoked] = useSetAppDownloadAllowlistRevokedMutation();

  if (auth.isLoading || serverUserLoading) return null;

  if (!isAdmin) {
    return (
      <YStack
        padding="$5"
        gap="$5"
        maxWidth={900}
        alignSelf="center"
        width="100%"
      >
        <PageMeta title="Access Restricted" description="" />
        <Card
          padding="$5"
          style={{
            background: 'var(--surfacePanel)',
            borderColor: withAlpha(BRAND_SEAM_RED, 0.4),
          }}
        >
          <YStack gap="$3" alignItems="center" paddingVertical="$4">
            <Lock size={40} color="$brandSeamRed" />
            <YStack gap="$2" alignItems="center">
              <Paragraph
                size="$6"
                fontWeight="700"
                style={{ color: 'var(--brandSeamRed)' }}
              >
                Admin Access Required
              </Paragraph>
              <Paragraph
                size="$4"
                style={{ color: 'var(--textMuted)', textAlign: 'center' }}
              >
                This page is restricted to administrators. If you believe you
                should have access, please contact support.
              </Paragraph>
            </YStack>
          </YStack>
        </Card>
      </YStack>
    );
  }

  const entries = data?.appDownloadAllowlist ?? [];

  async function handleAdd() {
    const email = emailInput.trim();
    if (email.length === 0) return;

    setFeedback(null);
    try {
      const result = await addEntry({
        variables: { email, note: noteInput.trim() || null },
        update: (cache, { data: payload }) => {
          const list = payload?.addAppDownloadAllowlistEntry?.entries;
          if (list) writeAllowlist(cache, list);
        },
      });
      const payload = result.data?.addAppDownloadAllowlistEntry;
      if (payload?.success) {
        setEmailInput('');
        setNoteInput('');
        setFeedback({ tone: 'ok', text: `${email} can now download the app.` });
      } else {
        setFeedback({
          tone: 'error',
          text: payload?.message ?? 'Could not add that address.',
        });
      }
    } catch (err) {
      LOGGER.error(
        'Failed to add app download allowlist entry:',
        err instanceof Error ? err : String(err),
      );
      setFeedback({
        tone: 'error',
        text:
          err instanceof Error ? err.message : 'Could not add that address.',
      });
    }
  }

  async function handleToggleRevoked(id: number, revoked: boolean) {
    setFeedback(null);
    setPendingRowId(id);
    try {
      const result = await setRevoked({
        variables: { id, revoked },
        update: (cache, { data: payload }) => {
          const list = payload?.setAppDownloadAllowlistRevoked?.entries;
          if (list) writeAllowlist(cache, list);
        },
      });
      const payload = result.data?.setAppDownloadAllowlistRevoked;
      if (!payload?.success) {
        setFeedback({
          tone: 'error',
          text: payload?.message ?? 'Could not update that entry.',
        });
      }
    } catch (err) {
      LOGGER.error(
        'Failed to update app download allowlist entry:',
        err instanceof Error ? err : String(err),
      );
      setFeedback({
        tone: 'error',
        text:
          err instanceof Error ? err.message : 'Could not update that entry.',
      });
    } finally {
      setPendingRowId(null);
    }
  }

  return (
    <YStack
      padding="$5"
      gap="$5"
      maxWidth={900}
      alignSelf="center"
      width="100%"
    >
      <PageMeta
        title="App Download Allowlist"
        description="Manage who can download the Android build."
      />

      <YStack gap="$2">
        <H1 size="$8" color="$color">
          App Download Allowlist
        </H1>
        <Paragraph size="$4" style={{ color: 'var(--textMuted)' }}>
          Addresses listed here can download the Android build after signing in
          with Google. An address does not need an account yet — the account is
          created the first time that person signs in. Admins can always
          download, listed or not.
        </Paragraph>
      </YStack>

      {/* Add form */}
      <Card
        padding="$4"
        data-testid="allowlist-add-form"
        style={{
          background: 'var(--surfacePanel)',
          borderColor: withAlpha(BRAND_NAVY, 0.4),
        }}
      >
        <YStack gap="$3">
          <XStack gap="$3" flexWrap="wrap" alignItems="center">
            <Input
              flex={1}
              minWidth={220}
              value={emailInput}
              onChangeText={setEmailInput}
              placeholder="tester@example.com"
              aria-label="Email address"
              autoCapitalize="none"
            />
            <Input
              flex={1}
              minWidth={180}
              value={noteInput}
              onChangeText={setNoteInput}
              placeholder="Note (optional)"
              aria-label="Note"
            />
            <Button
              onPress={() => void handleAdd()}
              disabled={adding || emailInput.trim().length === 0}
              opacity={adding || emailInput.trim().length === 0 ? 0.55 : 1}
              backgroundColor={withAlpha(BRAND_GOLD, 0.12)}
              borderColor="$brandGold"
              borderWidth={1}
              color="$brandGold"
            >
              {adding ? <Spinner size="small" /> : 'Add'}
            </Button>
          </XStack>

          {feedback && (
            <Paragraph
              size="$3"
              role="alert"
              style={{
                color:
                  feedback.tone === 'ok'
                    ? 'var(--brandGold)'
                    : 'var(--brandSeamRed)',
              }}
            >
              {feedback.text}
            </Paragraph>
          )}
        </YStack>
      </Card>

      {loading && entries.length === 0 && <Spinner size="large" />}

      {error && (
        <Paragraph
          size="$4"
          role="alert"
          style={{ color: 'var(--brandSeamRed)' }}
        >
          Could not load the allowlist: {error.message}
        </Paragraph>
      )}

      {/* `!error` guard: a failed load also yields zero entries, and telling an
          admin the list is empty when it merely could not be fetched would
          invite them to re-add testers who are already on it. */}
      {!loading && !error && entries.length === 0 && (
        <Paragraph size="$4" style={{ color: 'var(--textMuted)' }}>
          Nobody is on the allowlist yet. Add an email address above.
        </Paragraph>
      )}

      <YStack gap="$3">
        {entries.map((entry) => {
          const id = entry?.id ?? 0;
          const isRevoked = entry?.revokedAt != null;
          return (
            <Card
              key={id}
              padding="$4"
              data-testid="allowlist-row"
              style={{
                background: 'var(--surfacePanel)',
                borderColor: isRevoked
                  ? withAlpha(BRAND_SEAM_RED, 0.35)
                  : 'var(--panelBorder)',
                opacity: isRevoked ? 0.7 : 1,
              }}
            >
              <XStack
                gap="$3"
                flexWrap="wrap"
                alignItems="center"
                justifyContent="space-between"
              >
                <YStack gap="$1" flex={1} minWidth={240}>
                  <XStack gap="$2" alignItems="center" flexWrap="wrap">
                    <Text fontWeight="700" color="$color">
                      {entry?.email}
                    </Text>
                    {entry?.hasAccount ? (
                      <Text
                        fontSize={11}
                        style={{
                          color: GREEN,
                          border: `1px solid ${withAlpha(GREEN, 0.5)}`,
                          borderRadius: 999,
                          padding: '1px 8px',
                        }}
                      >
                        Has account
                      </Text>
                    ) : (
                      <Text
                        fontSize={11}
                        data-testid="allowlist-no-account"
                        style={{
                          color: 'var(--textMuted)',
                          border: '1px solid var(--panelBorder)',
                          borderRadius: 999,
                          padding: '1px 8px',
                        }}
                      >
                        No account yet
                      </Text>
                    )}
                    {isRevoked && (
                      <Text
                        fontSize={11}
                        style={{
                          color: BRAND_SEAM_RED,
                          border: `1px solid ${withAlpha(BRAND_SEAM_RED, 0.5)}`,
                          borderRadius: 999,
                          padding: '1px 8px',
                        }}
                      >
                        Revoked
                      </Text>
                    )}
                  </XStack>

                  {entry?.note && (
                    <Paragraph size="$3" style={{ color: 'var(--textMuted)' }}>
                      {entry.note}
                    </Paragraph>
                  )}

                  <Paragraph size="$2" style={{ color: 'var(--textMuted)' }}>
                    Added {formatDate(entry?.createdAt)}
                    {entry?.addedByEmail ? ` by ${entry.addedByEmail}` : ''} ·
                    Last download {formatDate(entry?.lastDownloadAt)}
                  </Paragraph>
                </YStack>

                <Button
                  size="$3"
                  onPress={() => void handleToggleRevoked(id, !isRevoked)}
                  disabled={pendingRowId !== null}
                  opacity={pendingRowId !== null ? 0.55 : 1}
                  borderWidth={1}
                  borderColor={isRevoked ? '$brandNavy' : '$brandSeamRed'}
                  backgroundColor={
                    isRevoked
                      ? withAlpha(BRAND_NAVY, 0.12)
                      : withAlpha(BRAND_SEAM_RED, 0.12)
                  }
                >
                  {pendingRowId === id ? (
                    <Spinner size="small" />
                  ) : isRevoked ? (
                    'Re-instate'
                  ) : (
                    'Revoke'
                  )}
                </Button>
              </XStack>
            </Card>
          );
        })}
      </YStack>
    </YStack>
  );
}
