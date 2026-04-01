import React, { useEffect, useState } from 'react';
import { Button, XStack, YStack } from '@legacy-sports/shared-components/ui';
import { useAuth } from '@legacy-sports/shared-components/auth';
import { Card, H1, Input, Paragraph, Spinner, Text } from 'tamagui';
import { Navigate } from 'react-router-dom';
import {
  useGetAllUsersQuery,
  useGetUsersCountQuery,
  useUpdateUserRoleMutation,
} from '../../api/db/graphql.generated';
import {
  BRAND_GOLD,
  BRAND_NAVY,
  BRAND_SEAM_RED,
  withAlpha,
} from '../../constants/colors';

const PAGE_SIZE = 25;

/**
 * AdminUsersPage — allows admins to view all users and promote/demote admin access.
 * Supports server-side search (debounced) and paginated results.
 * Only accessible to users with accessLevel === 'admin'.
 */
export default function AdminUsersPage() {
  const { user } = useAuth();
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [feedbackMap, setFeedbackMap] = useState<Record<number, string>>({});

  const isAdmin = user?.accessLevel === 'admin';

  // Debounce search input by 400ms; reset to page 1 on new search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setCurrentPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const searchVar = debouncedSearch.length > 0 ? debouncedSearch : undefined;
  const offset = (currentPage - 1) * PAGE_SIZE;

  const { data, loading, error, refetch } = useGetAllUsersQuery({
    variables: { limit: PAGE_SIZE, offset, search: searchVar },
    fetchPolicy: 'cache-and-network',
    skip: !isAdmin,
  });

  const { data: countData, loading: countLoading } = useGetUsersCountQuery({
    variables: { search: searchVar },
    fetchPolicy: 'cache-and-network',
    skip: !isAdmin,
  });

  const [updateUserRole, { loading: updating }] = useUpdateUserRoleMutation();

  // Redirect non-admins
  if (!user || !isAdmin) {
    return <Navigate to="/" replace />;
  }

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

  return (
    <YStack
      padding="$5"
      gap="$5"
      maxWidth={900}
      alignSelf="center"
      width="100%"
    >
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
                          color={BRAND_GOLD}
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
                        void handleToggleRole(displayId, u.accessLevel)
                      }
                      disabled={updating}
                      backgroundColor={
                        isUserAdmin
                          ? withAlpha(BRAND_SEAM_RED, 0.12)
                          : withAlpha(BRAND_NAVY, 0.12)
                      }
                      borderColor={isUserAdmin ? BRAND_SEAM_RED : BRAND_NAVY}
                      borderWidth={1}
                      color={isUserAdmin ? BRAND_SEAM_RED : BRAND_NAVY}
                      hoverStyle={{
                        backgroundColor: isUserAdmin
                          ? withAlpha(BRAND_SEAM_RED, 0.2)
                          : withAlpha(BRAND_NAVY, 0.2),
                      }}
                    >
                      {isUserAdmin ? 'Revoke Admin' : 'Make Admin'}
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
                      page === currentPage ? BRAND_NAVY : '$borderColor'
                    }
                    borderWidth={1}
                    color={page === currentPage ? BRAND_NAVY : '$color'}
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
    </YStack>
  );
}
