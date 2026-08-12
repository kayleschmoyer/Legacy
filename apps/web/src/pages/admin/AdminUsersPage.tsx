import React, { useEffect, useState } from 'react';
import { Button, XStack, YStack } from '@legacy-sports/shared-components/ui';
import { useAuth } from '@legacy-sports/shared-components/auth';
import { useReducedMotion } from '@legacy-sports/shared-components/utils';
import { Card, Dialog, H1, Input, Paragraph, Spinner, Text } from 'tamagui';
import { Navigate, useNavigate } from 'react-router-dom';
import { LOGGER } from '@legacy-sports/logging';
import {
  useGetAllUsersQuery,
  useGetUserByIdQuery,
  useGetUsersCountQuery,
  useGrantTemporaryPremiumMutation,
  useUpdateUserRoleMutation,
} from '@legacy-sports/graphql';
import {
  BRAND_GOLD,
  BRAND_NAVY,
  BRAND_SEAM_RED,
  withAlpha,
} from '../../constants/colors';

const PAGE_SIZE = 25;

// Mirrors MAX_TEMPORARY_PREMIUM_GRANT_DAYS in
// lambdas/db/src/schema/subscriptions.ts — the server is the source of truth
// and re-validates; this only avoids a round-trip for an out-of-range value.
const MIN_GRANT_DAYS = 1;
const MAX_GRANT_DAYS = 90;

function isValidGrantDays(value: string): boolean {
  const days = Number(value);
  return (
    Number.isInteger(days) && days >= MIN_GRANT_DAYS && days <= MAX_GRANT_DAYS
  );
}

type SortField = 'email' | 'username' | 'id';
type SortDirection = 'asc' | 'desc';
type AccessLevelFilter = 'all' | 'admin' | 'none';

const SORT_FIELD_LABELS: Record<SortField, string> = {
  email: 'Email',
  username: 'Username',
  id: 'ID',
};

const ACCESS_LEVEL_LABELS: Record<AccessLevelFilter, string> = {
  all: 'All Users',
  admin: 'Admins Only',
  none: 'Non-Admins',
};

export default function AdminUsersPage() {
  const auth = useAuth();
  const { user, isLoading, isAuthenticated } = auth;
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [feedbackMap, setFeedbackMap] = useState<Record<number, string>>({});
  const [sortField, setSortField] = useState<SortField>('email');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [accessLevelFilter, setAccessLevelFilter] =
    useState<AccessLevelFilter>('all');
  // Client-side only — resets to hidden on every fresh page load (LS-9223 AC4).
  const [showTestUsers, setShowTestUsers] = useState(false);
  // Springs settle at browser-dependent real-world durations; collapse to a
  // near-instant timing animation under prefers-reduced-motion so both
  // confirmation dialogs' enter/exit is deterministic for users who request
  // it (and for E2E, which forces this media feature — LS-8995).
  const dialogAnimation = useReducedMotion() ? '100ms' : 'quick';
  const [pendingToggle, setPendingToggle] = useState<{
    userId: number;
    currentLevel: string | null | undefined;
    label: string;
    isSelf: boolean;
  } | null>(null);
  const [impersonatingId, setImpersonatingId] = useState<number | null>(null);
  const [pendingImpersonation, setPendingImpersonation] = useState<{
    id: number;
    label: string;
  } | null>(null);
  const [pendingGrant, setPendingGrant] = useState<{
    id: number;
    label: string;
  } | null>(null);
  const [grantDaysInput, setGrantDaysInput] = useState('7');
  const [grantingId, setGrantingId] = useState<number | null>(null);

  const currentUserId = user?.id ?? 0;
  const { data: serverUserData, loading: serverUserLoading } =
    useGetUserByIdQuery({
      variables: { id: currentUserId },
      skip: !isAuthenticated || currentUserId === 0,
      fetchPolicy: 'network-only',
    });

  const isAdmin = serverUserData?.user?.accessLevel === 'admin';

  // Debounce search input by 400ms; reset to page 1 on new search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setCurrentPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Reset to page 1 when sort or filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [sortField, sortDirection, accessLevelFilter, showTestUsers]);

  const searchVar = debouncedSearch.length > 0 ? debouncedSearch : undefined;
  const accessLevelVar =
    accessLevelFilter === 'all' ? undefined : accessLevelFilter;
  const offset = (currentPage - 1) * PAGE_SIZE;

  const { data, loading, error, refetch } = useGetAllUsersQuery({
    variables: {
      limit: PAGE_SIZE,
      offset,
      search: searchVar,
      orderBy: sortField,
      orderDirection: sortDirection,
      accessLevel: accessLevelVar,
      includeTestUsers: showTestUsers,
    },
    fetchPolicy: 'cache-and-network',
    skip: !isAdmin,
  });

  const { data: countData, loading: countLoading } = useGetUsersCountQuery({
    variables: {
      search: searchVar,
      accessLevel: accessLevelVar,
      includeTestUsers: showTestUsers,
    },
    fetchPolicy: 'cache-and-network',
    skip: !isAdmin,
  });

  const [updateUserRole, { loading: updating }] = useUpdateUserRoleMutation();
  const [grantTemporaryPremium] = useGrantTemporaryPremiumMutation();

  if (isLoading || serverUserLoading) {
    return null;
  }

  // Redirect non-admins — gate on server-verified access level, not JWT claim
  if (!user || !isAdmin) {
    return <Navigate to="/" replace />;
  }

  const isImpersonating = !!auth.user?.impersonatedBy;

  const users = data?.users ?? [];
  const totalCount = countData?.usersCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  async function handleToggleRole(
    userId: number,
    currentLevel: string | null | undefined,
  ) {
    const newLevel = currentLevel === 'admin' ? 'none' : 'admin';
    try {
      await updateUserRole({ variables: { userId, accessLevel: newLevel } });
      setFeedbackMap((prev) => ({
        ...prev,
        [userId]: newLevel === 'admin' ? 'Promoted to admin' : 'Revoked admin',
      }));
      void refetch();
      setTimeout(() => {
        setFeedbackMap((prev) => {
          const next = { ...prev };
          delete next[userId];
          return next;
        });
      }, 3000);
    } catch (err) {
      setFeedbackMap((prev) => ({
        ...prev,
        [userId]: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      }));
    }
  }

  function handlePageChange(page: number) {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  }

  function handleSortField(field: SortField) {
    if (field === sortField) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  }

  const handleImpersonateConfirm = async () => {
    if (!pendingImpersonation) return;
    const { id } = pendingImpersonation;
    setPendingImpersonation(null);
    setImpersonatingId(id);
    try {
      await auth.impersonateUser(id);
      void navigate('/');
    } catch (err) {
      LOGGER.error(
        'Impersonation failed:',
        err instanceof Error ? err : String(err),
      );
    } finally {
      setImpersonatingId(null);
    }
  };

  const handleGrantConfirm = async () => {
    if (!pendingGrant) return;
    const { id: userId } = pendingGrant;
    const days = parseInt(grantDaysInput, 10);
    setPendingGrant(null);
    setGrantingId(userId);
    try {
      const result = await grantTemporaryPremium({
        variables: { userId, days },
      });
      const expiresAt = result.data?.grantTemporaryPremium?.expiresAt;
      setFeedbackMap((prev) => ({
        ...prev,
        [userId]: expiresAt
          ? `Granted premium until ${new Date(expiresAt).toLocaleDateString()}`
          : 'Granted temporary premium',
      }));
      setTimeout(() => {
        setFeedbackMap((prev) => {
          const next = { ...prev };
          delete next[userId];
          return next;
        });
      }, 5000);
    } catch (err) {
      LOGGER.error(
        'Failed to grant temporary premium:',
        err instanceof Error ? err : String(err),
      );
      setFeedbackMap((prev) => ({
        ...prev,
        [userId]: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      }));
    } finally {
      setGrantingId(null);
    }
  };

  // Build visible page numbers (at most 7: first, last, current ±1, with ellipsis)
  function getPageNumbers(): (number | '...')[] {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages: (number | '...')[] = [];
    pages.push(1);
    if (currentPage > 3) pages.push('...');
    for (
      let i = Math.max(2, currentPage - 1);
      i <= Math.min(totalPages - 1, currentPage + 1);
      i++
    ) {
      pages.push(i);
    }
    if (currentPage < totalPages - 2) pages.push('...');
    pages.push(totalPages);
    return pages;
  }

  const sortIndicator = (field: SortField) => {
    if (sortField !== field) return ' ↕';
    return sortDirection === 'asc' ? ' ↑' : ' ↓';
  };

  return (
    <YStack
      padding="$5"
      gap="$5"
      maxWidth={900}
      alignSelf="center"
      width="100%"
    >
      {/* Impersonation banner */}
      {isImpersonating && (
        <Card
          padding="$4"
          role="alert"
          style={{
            background: withAlpha(BRAND_SEAM_RED, 0.12),
            border: `1px solid ${withAlpha(BRAND_SEAM_RED, 0.55)}`,
            borderRadius: 12,
          }}
        >
          <Text
            fontWeight="700"
            fontSize={13}
            style={{
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--brandSeamRed)',
              display: 'block',
              marginBottom: 4,
            }}
          >
            Impersonation Active
          </Text>
          <Paragraph size="$3" color="$color">
            You are viewing admin tools as{' '}
            <Text fontWeight="700" style={{ color: 'var(--brandSeamRed)' }}>
              {auth.user?.impersonatedBy?.username ?? 'Unknown Admin'}
            </Text>
            . Mutating actions are disabled for this session.
          </Paragraph>
        </Card>
      )}

      {/* Page header */}
      <YStack gap="$2">
        <H1 size="$8" color="$color">
          Admin User Management
        </H1>
        <Paragraph color="$colorPress">
          Manage admin access for all registered users. Only admins can view
          this page.
        </Paragraph>
      </YStack>

      {/* Search */}
      <XStack gap="$3" alignItems="center">
        <Input
          flex={1}
          placeholder="Search by email or username…"
          value={searchInput}
          onChangeText={setSearchInput}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searchInput.length > 0 && (
          <Button
            size="$3"
            onPress={() => {
              setSearchInput('');
            }}
          >
            Clear
          </Button>
        )}
      </XStack>

      {/* Sort and filter controls */}
      <XStack gap="$3" alignItems="center" flexWrap="wrap">
        <Paragraph color="$colorPress" size="$3" flexShrink={0}>
          Sort by:
        </Paragraph>
        {(['email', 'username', 'id'] as SortField[]).map((field) => (
          <Button
            key={field}
            size="$3"
            onPress={() => handleSortField(field)}
            backgroundColor={
              sortField === field ? withAlpha(BRAND_NAVY, 0.12) : undefined
            }
            borderColor={sortField === field ? '$brandNavy' : '$borderColor'}
            borderWidth={1}
            color={sortField === field ? '$brandNavy' : '$color'}
            fontWeight={sortField === field ? '700' : '400'}
          >
            {SORT_FIELD_LABELS[field]}
            {sortIndicator(field)}
          </Button>
        ))}

        <XStack flex={1} />

        <Paragraph color="$colorPress" size="$3" flexShrink={0}>
          Filter:
        </Paragraph>
        {(['all', 'admin', 'none'] as AccessLevelFilter[]).map((level) => (
          <Button
            key={level}
            size="$3"
            onPress={() => setAccessLevelFilter(level)}
            backgroundColor={
              accessLevelFilter === level
                ? withAlpha(BRAND_NAVY, 0.12)
                : undefined
            }
            borderColor={
              accessLevelFilter === level ? '$brandNavy' : '$borderColor'
            }
            borderWidth={1}
            color={accessLevelFilter === level ? '$brandNavy' : '$color'}
            fontWeight={accessLevelFilter === level ? '700' : '400'}
          >
            {ACCESS_LEVEL_LABELS[level]}
          </Button>
        ))}

        <Button
          size="$3"
          onPress={() => setShowTestUsers((prev) => !prev)}
          backgroundColor={
            showTestUsers ? withAlpha(BRAND_NAVY, 0.12) : undefined
          }
          borderColor={showTestUsers ? '$brandNavy' : '$borderColor'}
          borderWidth={1}
          color={showTestUsers ? '$brandNavy' : '$color'}
          fontWeight={showTestUsers ? '700' : '400'}
        >
          {showTestUsers ? 'Hide test users' : 'Show test users'}
        </Button>
      </XStack>

      {/* Initial loading state (no users yet) */}
      {(loading || countLoading) && users.length === 0 && (
        <XStack justifyContent="center" padding="$6">
          <Spinner size="large" />
        </XStack>
      )}

      {error && (
        <Card
          padding="$4"
          backgroundColor="$red2"
          borderColor="$red6"
          borderWidth={1}
        >
          <Paragraph color="$red10">
            Failed to load users: {error.message}
          </Paragraph>
        </Card>
      )}

      {!error && (
        <YStack gap="$3">
          {/* Result summary */}
          <XStack justifyContent="space-between" alignItems="center">
            <Paragraph color="$colorPress" size="$3">
              {countLoading ? (
                'Loading…'
              ) : (
                <>
                  {totalCount} user{totalCount !== 1 ? 's' : ''}
                  {debouncedSearch
                    ? ` matching "${debouncedSearch}"`
                    : accessLevelFilter !== 'all'
                      ? ` (${ACCESS_LEVEL_LABELS[accessLevelFilter].toLowerCase()})`
                      : ' total'}
                  {totalPages > 1
                    ? ` — page ${currentPage} of ${totalPages}`
                    : ''}
                </>
              )}
            </Paragraph>
            {loading && <Spinner size="small" />}
          </XStack>

          {users.length === 0 && !loading && (
            <Card padding="$4">
              <Paragraph color="$colorPress" textAlign="center">
                {debouncedSearch
                  ? 'No users match your search.'
                  : 'No users found.'}
              </Paragraph>
            </Card>
          )}

          {users.map((u) => {
            const isUserAdmin = u.accessLevel === 'admin';
            const feedback = feedbackMap[u.id as number];
            const displayId = u.id as number;

            return (
              <Card
                key={displayId}
                padding="$4"
                borderWidth={1}
                borderColor={
                  isUserAdmin ? withAlpha(BRAND_GOLD, 0.4) : '$borderColor'
                }
                backgroundColor={
                  isUserAdmin ? withAlpha(BRAND_NAVY, 0.08) : '$background'
                }
                pressStyle={{ scale: 0.995 }}
              >
                <XStack alignItems="center" gap="$4" flexWrap="wrap">
                  {/* User info */}
                  <YStack flex={1} gap="$1" minWidth={200}>
                    <XStack gap="$2" alignItems="center" flexWrap="wrap">
                      <Text fontWeight="600" color="$color">
                        {u.username ?? u.email ?? `User #${displayId}`}
                      </Text>
                      {isUserAdmin && (
                        <Text
                          fontSize={11}
                          fontWeight="700"
                          color="$brandGold"
                          textTransform="uppercase"
                          letterSpacing={0.5}
                          style={{
                            backgroundColor: withAlpha(BRAND_GOLD, 0.15),
                            borderRadius: 4,
                            paddingHorizontal: 6,
                            paddingVertical: 2,
                          }}
                        >
                          Admin
                        </Text>
                      )}
                    </XStack>
                    <Paragraph color="$colorPress" size="$3">
                      {u.email ?? '—'}
                    </Paragraph>
                    <Paragraph color="$colorPress" size="$2" opacity={0.6}>
                      ID: {displayId}
                    </Paragraph>
                  </YStack>

                  {/* Action + feedback */}
                  <XStack gap="$3" alignItems="center" flexShrink={0}>
                    {feedback && (
                      <Paragraph
                        size="$3"
                        color={
                          feedback.startsWith('Error') ? '$red10' : '$green10'
                        }
                      >
                        {feedback}
                      </Paragraph>
                    )}
                    <Button
                      size="$3"
                      onPress={() =>
                        setPendingToggle({
                          userId: displayId,
                          currentLevel: u.accessLevel,
                          label: u.username ?? u.email ?? `User #${displayId}`,
                          isSelf: displayId === user.id,
                        })
                      }
                      disabled={updating}
                      backgroundColor={
                        isUserAdmin
                          ? withAlpha(BRAND_SEAM_RED, 0.12)
                          : withAlpha(BRAND_NAVY, 0.12)
                      }
                      borderColor={isUserAdmin ? '$brandSeamRed' : '$brandNavy'}
                      borderWidth={1}
                      color={isUserAdmin ? '$brandSeamRed' : '$brandNavy'}
                      hoverStyle={{
                        backgroundColor: isUserAdmin
                          ? withAlpha(BRAND_SEAM_RED, 0.2)
                          : withAlpha(BRAND_NAVY, 0.2),
                      }}
                    >
                      {isUserAdmin ? 'Revoke Admin' : 'Make Admin'}
                    </Button>
                    {!isUserAdmin && displayId !== user.id && (
                      <Button
                        size="$3"
                        onPress={() =>
                          setPendingImpersonation({
                            id: displayId,
                            label:
                              u.username ?? u.email ?? `User #${displayId}`,
                          })
                        }
                        disabled={
                          impersonatingId !== null ||
                          updating ||
                          isImpersonating
                        }
                        opacity={
                          impersonatingId !== null || isImpersonating ? 0.55 : 1
                        }
                        backgroundColor={withAlpha(BRAND_NAVY, 0.08)}
                        borderColor="$borderColor"
                        borderWidth={1}
                      >
                        {impersonatingId === displayId ? (
                          <Spinner size="small" />
                        ) : (
                          'Impersonate'
                        )}
                      </Button>
                    )}
                    <Button
                      size="$3"
                      onPress={() =>
                        setPendingGrant({
                          id: displayId,
                          label: u.username ?? u.email ?? `User #${displayId}`,
                        })
                      }
                      disabled={grantingId !== null || isImpersonating}
                      opacity={
                        grantingId !== null || isImpersonating ? 0.55 : 1
                      }
                      backgroundColor={withAlpha(BRAND_GOLD, 0.12)}
                      borderColor="$brandGold"
                      borderWidth={1}
                      color="$brandGold"
                    >
                      {grantingId === displayId ? (
                        <Spinner size="small" />
                      ) : (
                        'Grant Temp Premium'
                      )}
                    </Button>
                  </XStack>
                </XStack>
              </Card>
            );
          })}

          {/* Pagination controls */}
          {totalPages > 1 && (
            <XStack
              justifyContent="center"
              alignItems="center"
              gap="$2"
              paddingTop="$2"
              flexWrap="wrap"
            >
              <Button
                size="$3"
                disabled={currentPage === 1}
                onPress={() => handlePageChange(currentPage - 1)}
                opacity={currentPage === 1 ? 0.4 : 1}
              >
                ← Prev
              </Button>

              {getPageNumbers().map((page, idx) =>
                page === '...' ? (
                  <Text
                    key={`ellipsis-${idx}`}
                    color="$colorPress"
                    paddingHorizontal="$2"
                  >
                    …
                  </Text>
                ) : (
                  <Button
                    key={page}
                    size="$3"
                    onPress={() => handlePageChange(page)}
                    backgroundColor={
                      page === currentPage
                        ? withAlpha(BRAND_NAVY, 0.15)
                        : undefined
                    }
                    borderColor={
                      page === currentPage ? '$brandNavy' : '$borderColor'
                    }
                    borderWidth={1}
                    color={page === currentPage ? '$brandNavy' : '$color'}
                    fontWeight={page === currentPage ? '700' : '400'}
                  >
                    {page}
                  </Button>
                ),
              )}

              <Button
                size="$3"
                disabled={currentPage === totalPages}
                onPress={() => handlePageChange(currentPage + 1)}
                opacity={currentPage === totalPages ? 0.4 : 1}
              >
                Next →
              </Button>
            </XStack>
          )}
        </YStack>
      )}

      {/* Confirmation dialog for impersonation */}
      <Dialog
        modal
        open={pendingImpersonation !== null}
        onOpenChange={(open) => {
          if (!open) setPendingImpersonation(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay
            key="overlay"
            animation={dialogAnimation}
            opacity={0.5}
            enterStyle={{ opacity: 0 }}
            exitStyle={{ opacity: 0 }}
          />
          <Dialog.Content
            bordered
            elevate
            key="content"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="impersonate-title"
            aria-describedby="impersonate-description"
            animateOnly={['transform', 'opacity']}
            animation={[
              dialogAnimation,
              { opacity: { overshootClamping: true } },
            ]}
            enterStyle={{ x: 0, y: -20, opacity: 0, scale: 0.9 }}
            exitStyle={{ x: 0, y: 10, opacity: 0, scale: 0.95 }}
            gap="$4"
            padding="$4"
            width={500}
          >
            <Dialog.Title id="impersonate-title">
              Impersonate {pendingImpersonation?.label}?
            </Dialog.Title>
            <Dialog.Description id="impersonate-description">
              You will be signed in as this user until you sign out. Use this
              only for debugging purposes.
            </Dialog.Description>
            <XStack gap="$3" justifyContent="flex-end">
              <Button onPress={() => setPendingImpersonation(null)}>
                Cancel
              </Button>
              <Button
                backgroundColor="$brandNavyLight"
                color="$textOnAccent"
                hoverStyle={{ backgroundColor: '$brandNavy' }}
                pressStyle={{ backgroundColor: '$brandNavyDark' }}
                onPress={() => {
                  void handleImpersonateConfirm();
                }}
                disabled={impersonatingId !== null || isImpersonating}
                icon={impersonatingId !== null ? <Spinner /> : undefined}
              >
                Impersonate
              </Button>
            </XStack>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>

      {/* Confirmation dialog for temporary premium grant */}
      <Dialog
        modal
        open={pendingGrant !== null}
        onOpenChange={(open) => {
          if (!open) setPendingGrant(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay
            key="overlay"
            animation={dialogAnimation}
            opacity={0.5}
            enterStyle={{ opacity: 0 }}
            exitStyle={{ opacity: 0 }}
          />
          <Dialog.Content
            bordered
            elevate
            key="content"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="grant-premium-title"
            aria-describedby="grant-premium-description"
            animateOnly={['transform', 'opacity']}
            animation={[
              dialogAnimation,
              { opacity: { overshootClamping: true } },
            ]}
            enterStyle={{ x: 0, y: -20, opacity: 0, scale: 0.9 }}
            exitStyle={{ x: 0, y: 10, opacity: 0, scale: 0.95 }}
            gap="$4"
            padding="$4"
            width={500}
          >
            <Dialog.Title id="grant-premium-title">
              Grant temporary premium to {pendingGrant?.label}?
            </Dialog.Title>
            <Dialog.Description id="grant-premium-description">
              Creates a Stripe trial subscription (sandbox — no charge is ever
              made) that expires automatically after the chosen number of days.
            </Dialog.Description>
            <XStack gap="$3" alignItems="center">
              <Text color="$colorPress" fontSize={13}>
                Days ({MIN_GRANT_DAYS}-{MAX_GRANT_DAYS}):
              </Text>
              <Input
                width={80}
                keyboardType="numeric"
                value={grantDaysInput}
                onChangeText={setGrantDaysInput}
              />
            </XStack>
            <XStack gap="$3" justifyContent="flex-end">
              <Button onPress={() => setPendingGrant(null)}>Cancel</Button>
              <Button
                backgroundColor="$brandGold"
                color="$textOnAccent"
                onPress={() => {
                  void handleGrantConfirm();
                }}
                disabled={
                  grantingId !== null || !isValidGrantDays(grantDaysInput)
                }
                icon={grantingId !== null ? <Spinner /> : undefined}
              >
                Grant
              </Button>
            </XStack>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>

      {/* Confirmation dialog for admin role toggle */}
      <Dialog
        modal
        open={pendingToggle !== null}
        onOpenChange={(open) => {
          if (!open) setPendingToggle(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay
            key="overlay"
            animation={dialogAnimation}
            opacity={0.5}
            enterStyle={{ opacity: 0 }}
            exitStyle={{ opacity: 0 }}
          />
          <Dialog.Content
            bordered
            elevate
            key="content"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="toggle-admin-title"
            aria-describedby="toggle-admin-description"
            animateOnly={['transform', 'opacity']}
            animation={[
              dialogAnimation,
              { opacity: { overshootClamping: true } },
            ]}
            enterStyle={{ x: 0, y: -20, opacity: 0, scale: 0.9 }}
            exitStyle={{ x: 0, y: 10, opacity: 0, scale: 0.95 }}
            gap="$4"
            padding="$4"
            width={500}
          >
            {pendingToggle &&
              (() => {
                const willRevoke = pendingToggle.currentLevel === 'admin';
                const isSelfRevoke = pendingToggle.isSelf && willRevoke;
                const titleColor = willRevoke ? '$red11' : '$color';
                return (
                  <>
                    <Dialog.Title id="toggle-admin-title" color={titleColor}>
                      {isSelfRevoke
                        ? 'Cannot revoke your own admin access'
                        : willRevoke
                          ? `Revoke admin from ${pendingToggle.label}?`
                          : `Promote ${pendingToggle.label} to admin?`}
                    </Dialog.Title>
                    <Dialog.Description id="toggle-admin-description">
                      {isSelfRevoke
                        ? 'You cannot remove your own admin access. Ask another admin to make this change if needed.'
                        : willRevoke
                          ? 'This user will lose access to admin tools.'
                          : "This user will gain full access to admin tools, including the ability to change other users' roles."}
                    </Dialog.Description>
                    <XStack gap="$3" justifyContent="flex-end">
                      <Button
                        onPress={() => setPendingToggle(null)}
                        disabled={updating}
                      >
                        {isSelfRevoke ? 'Close' : 'Cancel'}
                      </Button>
                      {!isSelfRevoke && (
                        <Button
                          theme={willRevoke ? 'red' : undefined}
                          backgroundColor={
                            willRevoke ? undefined : '$brandNavyLight'
                          }
                          color={willRevoke ? undefined : '$textOnAccent'}
                          hoverStyle={
                            willRevoke
                              ? undefined
                              : { backgroundColor: '$brandNavy' }
                          }
                          pressStyle={
                            willRevoke
                              ? undefined
                              : { backgroundColor: '$brandNavyDark' }
                          }
                          onPress={() => {
                            const { userId, currentLevel } = pendingToggle;
                            setPendingToggle(null);
                            void handleToggleRole(userId, currentLevel);
                          }}
                          disabled={updating || isImpersonating}
                          icon={updating ? <Spinner /> : undefined}
                        >
                          {willRevoke ? 'Revoke admin' : 'Make admin'}
                        </Button>
                      )}
                    </XStack>
                  </>
                );
              })()}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>
    </YStack>
  );
}
