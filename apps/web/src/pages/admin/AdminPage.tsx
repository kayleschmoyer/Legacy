import React, { useState } from 'react';
import {
  Button,
  Paragraph,
  Separator,
  XStack,
  YStack,
} from '@legacy-sports/shared-components/ui';
import { LOGGER } from '@legacy-sports/logging';
import { Input, Spinner, Text, TextArea } from 'tamagui';
import { Link } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { styled } from 'tamagui';
import { useAuth } from '@legacy-sports/shared-components/auth';
import { PageMeta } from '../../components/PageMeta';
import {
  BRAND_GOLD_LIGHT,
  BRAND_NAVY_DARK,
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED,
  OUTLINE_SUBTLE,
  SURFACE_CARD,
  SURFACE_PANEL,
  withAlpha,
} from '../../constants/colors';
import {
  useAdminGetUsersQuery,
  useImpersonateUserMutation,
} from '../../api/db/graphql.generated';

// ─── JWT Helpers ──────────────────────────────────────────────────────────────

interface JwtDecoded {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  isExpired: boolean;
  expiresAt: Date | null;
}

function decodeJwtParts(token: string): JwtDecoded {
  const parts = token.trim().split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT: expected 3 dot-separated parts');
  }

  const decodeBase64Url = (s: string): Record<string, unknown> => {
    const base64 = s.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const json = decodeURIComponent(
      atob(padded)
        .split('')
        .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`)
        .join(''),
    );
    return JSON.parse(json) as Record<string, unknown>;
  };

  const header = decodeBase64Url(parts[0]);
  const payload = decodeBase64Url(parts[1]);

  let expiresAt: Date | null = null;
  let isExpired = false;
  if (typeof payload['exp'] === 'number') {
    expiresAt = new Date(payload['exp'] * 1000);
    isExpired = expiresAt < new Date();
  }

  return { header, payload, isExpired, expiresAt };
}

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

const AccordionPanel = styled(YStack, {
  borderRadius: '$4',
  borderWidth: 1,
  overflow: 'hidden',
  style: {
    borderColor: OUTLINE_SUBTLE,
  } as never,
});

const AccordionHeader = styled(XStack, {
  paddingHorizontal: '$4',
  paddingVertical: '$4',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '$3',
  cursor: 'pointer' as never,
  hoverStyle: { backgroundColor: '$color2' },
  animation: 'quick',
  style: {
    background: SURFACE_PANEL,
  } as never,
});

const AccordionBody = styled(YStack, {
  gap: '$3',
  padding: '$4',
  style: {
    borderTop: `1px solid ${OUTLINE_SUBTLE}`,
  } as never,
});

// ─── AdminSection ─────────────────────────────────────────────────────────────

interface AdminSectionProps {
  title: string;
  subtitle?: string;
  badge?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function AdminSection({
  title,
  subtitle,
  badge,
  defaultOpen = true,
  children,
}: AdminSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const sectionId = `admin-section-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  return (
    <AccordionPanel>
      <AccordionHeader
        onPress={() => setOpen((v) => !v)}
        role="button"
        aria-expanded={open}
        aria-controls={sectionId}
      >
        <YStack flex={1} gap="$1">
          <XStack gap="$2" alignItems="center">
            <Paragraph size="$6" fontWeight="600" color="$color">
              {title}
            </Paragraph>
            {badge != null && (
              <Paragraph
                size="$2"
                fontWeight="600"
                paddingHorizontal="$2"
                paddingVertical="$1"
                borderRadius="$2"
                style={{
                  background: withAlpha(BRAND_NAVY_LIGHT, 0.25),
                  color: BRAND_GOLD_LIGHT,
                }}
              >
                {badge}
              </Paragraph>
            )}
          </XStack>
          {subtitle != null && (
            <Paragraph size="$3" color="$colorPress">
              {subtitle}
            </Paragraph>
          )}
        </YStack>

        <Paragraph
          fontSize="$5"
          color={BRAND_GOLD_LIGHT}
          lineHeight={20}
          style={
            {
              transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s',
            } as never
          }
        >
          ▾
        </Paragraph>
      </AccordionHeader>

      {open && (
        <AccordionBody id={sectionId} role="region" aria-label={title}>
          {children}
        </AccordionBody>
      )}
    </AccordionPanel>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AdminPage(): React.JSX.Element {
  const navigate = useNavigate();
  const auth = useAuth();
  const [search, setSearch] = useState('');
  const [impersonatingId, setImpersonatingId] = useState<number | null>(null);

  // JWT decoder state
  const [jwtInput, setJwtInput] = useState('');
  const [jwtResult, setJwtResult] = useState<JwtDecoded | null>(null);
  const [jwtError, setJwtError] = useState<string | null>(null);

  const handleDecodejwt = () => {
    setJwtResult(null);
    setJwtError(null);
    if (!jwtInput.trim()) return;
    try {
      setJwtResult(decodeJwtParts(jwtInput));
    } catch (err) {
      setJwtError(err instanceof Error ? err.message : 'Failed to decode JWT');
    }
  };

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
      LOGGER.error('Impersonation failed:', String(err));
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
      <PageMeta
        title="Admin Console"
        description="Legacy Sports administration panel — manage users, review activity, and debug platform issues."
      />
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
        <XStack gap="$2" paddingTop="$1">
          <Link
            to="/admin/revenue"
            style={{
              fontSize: 14,
              color: BRAND_GOLD_LIGHT,
              textDecoration: 'none',
              padding: '4px 10px',
              borderRadius: 6,
              border: `1px solid ${BRAND_GOLD_LIGHT}`,
            }}
          >
            Revenue Analytics →
          </Link>
        </XStack>
      </YStack>

      <Separator />

      {/* Users Section */}
      <AdminSection
        title="Users"
        subtitle="Search and impersonate user accounts."
        badge={data ? String((data.users ?? []).length) : undefined}
      >
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

                {/* Impersonate button — hidden for other admins */}
                {!isYou && !isAdmin && (
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
      </AdminSection>

      {/* JWT Decoder Section */}
      <AdminSection
        title="JWT Decoder"
        subtitle="Paste an access token or refresh token to inspect its claims."
        defaultOpen={false}
      >
        <TextArea
          placeholder="Paste JWT here…"
          value={jwtInput}
          onChangeText={setJwtInput}
          minHeight={80}
          borderColor="$borderColor"
          backgroundColor="$color2"
          fontFamily="$mono"
          fontSize="$2"
          rows={4}
        />

        <XStack>
          <Button
            size="$3"
            onPress={handleDecodejwt}
            style={{
              background: `linear-gradient(135deg, ${BRAND_NAVY_LIGHT} 0%, ${BRAND_NAVY_DARK} 100%)`,
              borderColor: BRAND_NAVY_LIGHT,
              borderWidth: 1,
            }}
          >
            <Text fontWeight="600" style={{ color: BRAND_GOLD_LIGHT }}>
              Decode
            </Text>
          </Button>
        </XStack>

        {jwtError && (
          <Paragraph size="$3" style={{ color: BRAND_SEAM_RED }}>
            ⚠ {jwtError}
          </Paragraph>
        )}

        {jwtResult && (
          <YStack gap="$3">
            {/* Expiry banner */}
            <XStack
              padding="$3"
              borderRadius="$3"
              alignItems="center"
              gap="$2"
              style={{
                background: jwtResult.isExpired
                  ? withAlpha(BRAND_SEAM_RED, 0.15)
                  : withAlpha(BRAND_NAVY_LIGHT, 0.15),
                border: `1px solid ${jwtResult.isExpired ? BRAND_SEAM_RED : BRAND_NAVY_LIGHT}`,
              }}
            >
              <Paragraph
                size="$3"
                fontWeight="600"
                style={{
                  color: jwtResult.isExpired
                    ? BRAND_SEAM_RED
                    : BRAND_GOLD_LIGHT,
                }}
              >
                {jwtResult.isExpired
                  ? `⚠ Token expired at ${jwtResult.expiresAt?.toLocaleString() ?? 'unknown'}`
                  : jwtResult.expiresAt
                    ? `✓ Token valid · expires ${jwtResult.expiresAt.toLocaleString()}`
                    : '✓ Token has no expiry (exp claim absent)'}
              </Paragraph>
            </XStack>

            {/* Header */}
            <YStack
              gap="$2"
              padding="$3"
              borderRadius="$3"
              style={{
                background: SURFACE_PANEL,
                border: `1px solid ${OUTLINE_SUBTLE}`,
              }}
            >
              <Paragraph
                size="$3"
                fontWeight="700"
                style={{ color: BRAND_GOLD_LIGHT }}
              >
                Header
              </Paragraph>
              <Paragraph
                size="$2"
                fontFamily="$mono"
                style={{
                  color: '#C8D6F0',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {JSON.stringify(jwtResult.header, null, 2)}
              </Paragraph>
            </YStack>

            {/* Payload */}
            <YStack
              gap="$2"
              padding="$3"
              borderRadius="$3"
              style={{
                background: SURFACE_PANEL,
                border: `1px solid ${OUTLINE_SUBTLE}`,
              }}
            >
              <Paragraph
                size="$3"
                fontWeight="700"
                style={{ color: BRAND_GOLD_LIGHT }}
              >
                Payload
              </Paragraph>
              <Paragraph
                size="$2"
                fontFamily="$mono"
                style={{
                  color: '#C8D6F0',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {JSON.stringify(jwtResult.payload, null, 2)}
              </Paragraph>
            </YStack>
          </YStack>
        )}
      </AdminSection>
    </PageContainer>
  );
}

export default AdminPage;
