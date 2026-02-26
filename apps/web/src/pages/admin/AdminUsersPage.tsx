import React, { useState } from 'react';
import {
  Button,
  useAuth,
  XStack,
  YStack,
} from '@legacy-sports/shared-components';
import { Card, H1, Input, Paragraph, Spinner, Text } from 'tamagui';
import { Navigate } from 'react-router-dom';
import {
  useGetAllUsersQuery,
  useUpdateUserRoleMutation,
} from '../../api/db/graphql.generated';
import {
  BRAND_GOLD,
  BRAND_NAVY,
  BRAND_SEAM_RED,
  withAlpha,
} from '../../constants/colors';

/**
 * AdminUsersPage — allows admins to view all users and promote/demote admin access.
 * Only accessible to users with accessLevel === 'admin'.
 */
export default function AdminUsersPage() {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [feedbackMap, setFeedbackMap] = useState<Record<number, string>>({});

  const isAdmin = user?.accessLevel === 'admin';

  const { data, loading, error, refetch } = useGetAllUsersQuery({
    variables: { limit: 200 },
    fetchPolicy: 'cache-and-network',
    skip: !isAdmin,
  });

  const [updateUserRole, { loading: updating }] = useUpdateUserRoleMutation();

  // Redirect non-admins
  if (!user || !isAdmin) {
    return <Navigate to="/" replace />;
  }

  const allUsers = data?.users ?? [];
  const filtered = searchTerm.trim()
    ? allUsers.filter(
        (u) =>
          u.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          u.username?.toLowerCase().includes(searchTerm.toLowerCase()),
      )
    : allUsers;

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
          value={searchTerm}
          onChangeText={setSearchTerm}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searchTerm.length > 0 && (
          <Button size="$3" onPress={() => setSearchTerm('')}>
            Clear
          </Button>
        )}
      </XStack>

      {/* States */}
      {loading && (
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

      {!loading && !error && (
        <YStack gap="$3">
          <Paragraph color="$colorPress" size="$3">
            {filtered.length} user{filtered.length !== 1 ? 's' : ''} shown
          </Paragraph>

          {filtered.length === 0 && (
            <Card padding="$4">
              <Paragraph color="$colorPress" textAlign="center">
                No users match your search.
              </Paragraph>
            </Card>
          )}

          {filtered.map((u) => {
            const isAdmin = u.accessLevel === 'admin';
            const feedback = feedbackMap[u.id as number];
            const displayId = u.id as number;

            return (
              <Card
                key={displayId}
                padding="$4"
                borderWidth={1}
                borderColor={
                  isAdmin ? withAlpha(BRAND_GOLD, 0.4) : '$borderColor'
                }
                backgroundColor={
                  isAdmin ? withAlpha(BRAND_NAVY, 0.08) : '$background'
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
                      {isAdmin && (
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
                        isAdmin
                          ? withAlpha(BRAND_SEAM_RED, 0.12)
                          : withAlpha(BRAND_NAVY, 0.12)
                      }
                      borderColor={isAdmin ? BRAND_SEAM_RED : BRAND_NAVY}
                      borderWidth={1}
                      color={isAdmin ? BRAND_SEAM_RED : BRAND_NAVY}
                      hoverStyle={{
                        backgroundColor: isAdmin
                          ? withAlpha(BRAND_SEAM_RED, 0.2)
                          : withAlpha(BRAND_NAVY, 0.2),
                      }}
                    >
                      {isAdmin ? 'Revoke Admin' : 'Make Admin'}
                    </Button>
                  </XStack>
                </XStack>
              </Card>
            );
          })}
        </YStack>
      )}
    </YStack>
  );
}
