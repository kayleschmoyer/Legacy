import React, { useState } from 'react';
import {
  Button,
  Paragraph,
  Separator,
  XStack,
  YStack,
} from '@legacy-sports/shared-components';
import { Input, Spinner, Text } from 'tamagui';
import { useNavigate } from 'react-router-dom';
import { styled } from 'tamagui';
import { useAuth } from '@legacy-sports/shared-components';
import {
  BRAND_GOLD_LIGHT,
  BRAND_NAVY_DARK,
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED,
  SURFACE_CARD,
  withAlpha,
} from '../../constants/colors';
import {
  useAdminGetUsersQuery,
  useImpersonateUserMutation,
} from '../../api/db/graphql.generated';

// ─── Styled components ────────────────────────────────────────────────────────

const PageContainer = styled(YStack, {
  padding: '$5',
  maxWidth: 900,
  width: '100%',
  alignSelf: 'center',
  gap: '$4',
});

const UserCard = styled(XStack, {
  padding: '$4',
  borderRadius: '$4',
  borderWidth: 1,
  borderColor: '$borderColor',
  gap: '$4',
  alignItems: 'center',
  backgroundColor: '$background',
  hoverStyle: { backgroundColor: '$color2' },
});

const AccessBadge = styled(Paragraph, {
  fontSize: '$2',
  fontWeight: '600',
  paddingHorizontal: '$2',
  paddingVertical: '$1',
  borderRadius: '$2',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
});

// ─── Component ────────────────────────────────────────────────────────────────

export function AdminPage(): React.JSX.Element {
  const navigate = useNavigate();
  const auth = useAuth();
  const [search, setSearch] = useState('');
  const [impersonatingId, setImpersonatingId] = useState<number | null>(null);

  const { data, loading, error } = useAdminGetUsersQuery({
    variables: { limit: 200, offset: 0 },
    skip: !auth.isAuthenticated,
  });

  const [impersonateMutation] = useImpersonateUserMutation();

  // Redirect non-admins
  if (!auth.isLoading && auth.user?.accessLevel !== 'admin') {
    void navigate('/');
    return <Spinner />;
  }

  const handleImpersonate = async (userId: number) => {
    setImpersonatingId(userId);
    try {
      const result = await impersonateMutation({ variables: { userId } });
      const token = result.data?.impersonateUser?.token;
      if (token) {
        auth.impersonateUser(token);
        void navigate('/');
      }
    } catch (err) {
      console.error('Impersonation failed:', err);
    } finally {
      setImpersonatingId(null);
    }
  };

  const filteredUsers = (data?.users ?? []).filter((u) => {
    const q = search.toLowerCase();
    return (
      u.email?.toLowerCase().includes(q) ||
      u.username?.toLowerCase().includes(q) ||
      String(u.id).includes(q)
    );
  });

  return (
    <PageContainer>
      {/* Header */}
      <YStack gap="$2">
        <Paragraph
          size="$8"
          fontWeight="700"
          color="$color"
          style={{ color: BRAND_GOLD_LIGHT }}
        >
          Admin Console
        </Paragraph>
        <Paragraph size="$4" color="$colorPress">
          Manage users and impersonate accounts for debugging.
        </Paragraph>
      </YStack>

      <Separator />

      {/* Users Section */}
      <YStack gap="$3">
        <XStack justifyContent="space-between" alignItems="center">
          <Paragraph size="$6" fontWeight="600" color="$color">
            Users
          </Paragraph>
          {data && (
            <Paragraph size="$3" color="$colorPress">
              {(data.users ?? []).length} total
            </Paragraph>
          )}
        </XStack>

        {/* Search */}
        <Input
          placeholder="Search by name, email, or ID…"
          value={search}
          onChangeText={setSearch}
          borderColor="$borderColor"
          backgroundColor="$color2"
        />

        {/* List */}
        {loading && <Spinner size="large" />}
        {error && (
          <Paragraph color="$red10">
            Failed to load users: {error.message}
          </Paragraph>
        )}

        {!loading && !error && filteredUsers.length === 0 && (
          <Paragraph color="$colorPress">No users found.</Paragraph>
        )}

        <YStack gap="$2">
          {filteredUsers.map((u) => {
            const isYou = u.id === auth.user?.id;
            const isAdmin = u.accessLevel === 'admin';

            return (
              <UserCard key={u.id}>
                {/* Avatar initial */}
                <YStack
                  width={40}
                  height={40}
                  borderRadius={20}
                  alignItems="center"
                  justifyContent="center"
                  flexShrink={0}
                  style={{
                    background: isAdmin
                      ? `linear-gradient(135deg, ${BRAND_NAVY_LIGHT} 0%, ${BRAND_NAVY_DARK} 100%)`
                      : `linear-gradient(135deg, ${SURFACE_CARD} 0%, ${withAlpha(BRAND_NAVY_LIGHT, 0.4)} 100%)`,
                    border: isAdmin
                      ? `2px solid ${BRAND_GOLD_LIGHT}`
                      : '2px solid transparent',
                  }}
                >
                  <Paragraph
                    size="$4"
                    fontWeight="700"
                    style={{ color: BRAND_GOLD_LIGHT }}
                  >
                    {(u.username ?? u.email ?? '?').charAt(0).toUpperCase()}
                  </Paragraph>
                </YStack>

                {/* User info */}
                <YStack flex={1} gap="$1">
                  <XStack gap="$2" alignItems="center">
                    <Paragraph size="$4" fontWeight="600" color="$color">
                      {u.username ?? '(no username)'}
                    </Paragraph>
                    {isYou && (
                      <AccessBadge
                        style={{
                          background: withAlpha(BRAND_NAVY_LIGHT, 0.25),
                          color: BRAND_GOLD_LIGHT,
                        }}
                      >
                        You
                      </AccessBadge>
                    )}
                  </XStack>
                  <Paragraph size="$3" color="$colorPress">
                    {u.email ?? '—'}
                  </Paragraph>
                </YStack>

                {/* Access level badge */}
                <AccessBadge
                  style={
                    isAdmin
                      ? {
                          background: withAlpha(BRAND_NAVY_LIGHT, 0.3),
                          color: BRAND_GOLD_LIGHT,
                        }
                      : {
                          background: withAlpha(BRAND_SEAM_RED, 0.15),
                          color: BRAND_SEAM_RED,
                        }
                  }
                >
                  {u.accessLevel ?? 'none'}
                </AccessBadge>

                {/* Impersonate button */}
                {!isYou && (
                  <Button
                    size="$3"
                    onPress={() => u.id != null && void handleImpersonate(u.id)}
                    disabled={impersonatingId !== null}
                    style={{
                      background:
                        impersonatingId === u.id
                          ? withAlpha(BRAND_NAVY_LIGHT, 0.3)
                          : `linear-gradient(135deg, ${BRAND_NAVY_LIGHT} 0%, ${BRAND_NAVY_DARK} 100%)`,
                      borderColor: BRAND_NAVY_LIGHT,
                      borderWidth: 1,
                    }}
                  >
                    {impersonatingId === u.id ? (
                      <XStack gap="$1" alignItems="center">
                        <Spinner size="small" />
                        <Text style={{ color: BRAND_GOLD_LIGHT }}>
                          Starting…
                        </Text>
                      </XStack>
                    ) : (
                      <Text
                        fontWeight="600"
                        style={{ color: BRAND_GOLD_LIGHT }}
                      >
                        Impersonate
                      </Text>
                    )}
                  </Button>
                )}
              </UserCard>
            );
          })}
        </YStack>
      </YStack>
    </PageContainer>
  );
}

export default AdminPage;
