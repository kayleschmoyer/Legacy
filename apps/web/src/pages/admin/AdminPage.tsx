import React, { useEffect, useState } from 'react';
import { Dialog } from '@legacy-sports/shared-components';
import { XStack, YStack } from '@legacy-sports/shared-components/ui';
import { LOGGER } from '@legacy-sports/logging';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@legacy-sports/shared-components/auth';
import { PageMeta } from '../../components/PageMeta';
import { FONT_BODY, FONT_DISPLAY, FONT_MONO } from '../../constants/typography';
import {
  BG_DARK,
  BORDER_STRONG,
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  BRAND_NAVY_DARK,
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED,
  INFO_FG,
  OUTLINE_SUBTLE,
  SCORE_LOSS,
  SUCCESS_FG,
  SURFACE_CARD,
  SURFACE_HOVER,
  SURFACE_PANEL,
  SURFACE_SUBTLE,
  TEXT_FG2,
  TEXT_MUTED,
  TEXT_ON_GOLD,
  TEXT_PRIMARY,
  TEXT_TERTIARY,
  WHITE,
  withAlpha,
} from '../../constants/colors';
import {
  useAdminGetUsersQuery,
  useGetUserByIdQuery,
} from '../../api/db/graphql.generated';

// ─── JWT helpers ──────────────────────────────────────────────────────────────

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

// ─── JSON syntax tinting ──────────────────────────────────────────────────────
// Mirrors the design mockup's .json-block colour scheme: keys = gold, strings =
// success-fg, numbers = info-fg, booleans/null = danger-fg, punctuation = fg4.

const JSON_TOKEN_RE =
  /("(?:\\.|[^"\\])*"\s*:)|("(?:\\.|[^"\\])*")|(\b(?:true|false|null)\b)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([{}[\],:])/g;

function renderJsonWithTints(value: unknown): React.ReactNode {
  const text = JSON.stringify(value, null, 2);
  if (text == null) return null;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;
  JSON_TOKEN_RE.lastIndex = 0;
  while ((match = JSON_TOKEN_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const [token] = match;
    let color: string | undefined;
    if (match[1] != null)
      color = BRAND_GOLD_LIGHT; // key
    else if (match[2] != null)
      color = SUCCESS_FG; // string (--success-fg)
    else if (match[3] != null)
      color = SCORE_LOSS; // bool/null (--danger-fg)
    else if (match[4] != null)
      color = INFO_FG; // number (--info-fg)
    else if (match[5] != null) color = TEXT_TERTIARY; // punctuation (--fg4)
    parts.push(
      color != null ? (
        <span key={key++} style={{ color }}>
          {token}
        </span>
      ) : (
        token
      ),
    );
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

// ─── Quick stat card ──────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string;
  accent?: string;
}

function StatCard({ label, value, accent }: StatCardProps) {
  return (
    <YStack
      gap={4}
      padding={14}
      borderRadius={8}
      style={{
        background: SURFACE_CARD,
        border: `1px solid ${OUTLINE_SUBTLE}`,
        minWidth: 100,
      }}
    >
      <span
        style={{
          fontFamily: FONT_BODY,
          fontSize: 11,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: TEXT_TERTIARY,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: FONT_DISPLAY,
          fontWeight: 800,
          fontSize: 28,
          lineHeight: 1,
          color: accent ?? TEXT_PRIMARY,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </span>
    </YStack>
  );
}

// ─── Section / accordion ──────────────────────────────────────────────────────

interface AdminSectionProps {
  number: string;
  title: string;
  count?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function AdminSection({
  number,
  title,
  count,
  defaultOpen = true,
  children,
}: AdminSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const sectionId = `admin-section-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  return (
    <YStack
      marginBottom={20}
      borderRadius={16}
      borderWidth={1}
      overflow="hidden"
      animation="quick"
      style={{
        background: SURFACE_PANEL,
        borderColor: open ? BORDER_STRONG : OUTLINE_SUBTLE,
        transition: 'border-color 200ms cubic-bezier(0.2, 0.8, 0.2, 1)',
      }}
    >
      <XStack
        tag="button"
        type="button"
        onPress={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={sectionId}
        alignItems="center"
        gap={14}
        paddingHorizontal={20}
        paddingVertical={18}
        borderWidth={0}
        cursor="pointer"
        animation="quick"
        style={{
          background: `linear-gradient(180deg, ${withAlpha(BRAND_NAVY, 0.18)} 0%, transparent 100%)`,
          textAlign: 'left',
          width: '100%',
          minHeight: 44,
        }}
        hoverStyle={{ backgroundColor: withAlpha(BRAND_NAVY, 0.12) }}
        $sm={{ paddingHorizontal: 14, paddingVertical: 14, gap: 10 }}
      >
        <span
          style={{
            fontFamily: FONT_MONO,
            fontSize: 12,
            fontWeight: 500,
            color: TEXT_TERTIARY,
            letterSpacing: '0.04em',
            fontVariantNumeric: 'tabular-nums',
          }}
          aria-hidden
        >
          {number}
        </span>
        <h2
          style={{
            flex: 1,
            margin: 0,
            fontFamily: FONT_DISPLAY,
            fontWeight: 800,
            fontSize: 22,
            letterSpacing: '-0.01em',
            color: TEXT_PRIMARY,
          }}
        >
          {title}
        </h2>
        {count != null && (
          <span
            style={{
              fontFamily: FONT_DISPLAY,
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: TEXT_MUTED,
              padding: '4px 10px',
              border: `1px solid ${OUTLINE_SUBTLE}`,
              borderRadius: 9999,
              background: SURFACE_SUBTLE,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {count}
          </span>
        )}
        <svg
          width={20}
          height={20}
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden
          style={{
            color: open ? BRAND_GOLD : TEXT_MUTED,
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1)',
            flexShrink: 0,
          }}
        >
          <path
            d="M7 5l6 5-6 5"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </XStack>

      {open && (
        <YStack
          id={sectionId}
          role="region"
          aria-label={title}
          paddingHorizontal={20}
          paddingTop={0}
          paddingBottom={22}
          gap={12}
          $sm={{ paddingHorizontal: 14, paddingBottom: 18 }}
        >
          {children}
        </YStack>
      )}
    </YStack>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AdminPage(): React.JSX.Element | null {
  const navigate = useNavigate();
  const auth = useAuth();
  const [search, setSearch] = useState('');
  const [impersonatingId, setImpersonatingId] = useState<number | null>(null);
  const [pendingImpersonation, setPendingImpersonation] = useState<{
    id: number;
    label: string;
  } | null>(null);

  // JWT decoder state
  const [jwtInput, setJwtInput] = useState('');
  const [jwtResult, setJwtResult] = useState<JwtDecoded | null>(null);
  const [jwtError, setJwtError] = useState<string | null>(null);

  const handleDecodeJwt = () => {
    setJwtResult(null);
    setJwtError(null);
    if (!jwtInput.trim()) return;
    try {
      setJwtResult(decodeJwtParts(jwtInput));
    } catch (err) {
      setJwtError(err instanceof Error ? err.message : 'Failed to decode JWT');
    }
  };

  const currentUserId = auth.user?.id ?? 0;
  const {
    data: serverUserData,
    loading: serverUserLoading,
    refetch: refetchServerUser,
  } = useGetUserByIdQuery({
    variables: { id: currentUserId },
    skip: !auth.isAuthenticated || currentUserId === 0,
    fetchPolicy: 'network-only',
  });

  useEffect(() => {
    const handleFocus = () => {
      if (auth.isAuthenticated && currentUserId !== 0) {
        void refetchServerUser();
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [auth.isAuthenticated, currentUserId, refetchServerUser]);

  const { data, loading, error } = useAdminGetUsersQuery({
    variables: { limit: 200, offset: 0 },
    skip: auth.user?.accessLevel !== 'admin',
    fetchPolicy: 'no-cache',
  });

  if (auth.isLoading || serverUserLoading) {
    return null;
  }
  const serverAccessLevel = serverUserData?.user?.accessLevel;
  if (serverAccessLevel !== 'admin') {
    return <Navigate to="/" replace />;
  }

  const handleImpersonate = (userId: number, label: string) => {
    setPendingImpersonation({ id: userId, label });
  };

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

  const allUsers = data?.users ?? [];
  const filteredUsers = allUsers.filter((u) => {
    const q = search.toLowerCase();
    return (
      u.email?.toLowerCase().includes(q) ||
      u.username?.toLowerCase().includes(q) ||
      String(u.id).includes(q)
    );
  });

  const algValue =
    jwtResult != null && typeof jwtResult.header['alg'] === 'string'
      ? jwtResult.header['alg']
      : null;

  return (
    <YStack
      minHeight="100vh"
      style={{
        background: BG_DARK,
        backgroundImage: `
          radial-gradient(ellipse at 50% -10%, ${withAlpha(BRAND_NAVY, 0.35)} 0%, transparent 55%),
          radial-gradient(ellipse at 90% 0%, ${withAlpha(BRAND_SEAM_RED, 0.06)} 0%, transparent 50%)
        `,
        backgroundAttachment: 'fixed',
      }}
    >
      <PageMeta
        title="Admin Console"
        description="Legacy Sports administration panel — manage users, review activity, and debug platform issues."
      />

      <YStack
        width="100%"
        maxWidth={1280}
        alignSelf="center"
        paddingHorizontal={20}
        paddingTop={28}
        paddingBottom={40}
        $sm={{ paddingHorizontal: 14, paddingTop: 18, paddingBottom: 28 }}
      >
        {/* Page header */}
        <YStack
          gap={6}
          paddingBottom={20}
          marginBottom={24}
          style={{ borderBottom: `1px solid ${OUTLINE_SUBTLE}` }}
        >
          <XStack alignItems="center" gap={8}>
            <span
              aria-hidden
              style={{
                width: 24,
                height: 1,
                background: BRAND_GOLD,
                display: 'inline-block',
              }}
            />
            <span
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: 700,
                fontSize: 12,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: BRAND_GOLD,
              }}
            >
              Backstage
            </span>
          </XStack>
          <h1
            style={{
              margin: 0,
              fontFamily: FONT_DISPLAY,
              fontWeight: 800,
              fontSize: 'clamp(28px, 5vw, 48px)',
              lineHeight: 1.05,
              letterSpacing: '-0.015em',
              color: WHITE,
            }}
          >
            Admin Console
          </h1>
          <p
            style={{
              margin: 0,
              fontFamily: FONT_BODY,
              fontSize: 16,
              lineHeight: 1.55,
              color: TEXT_MUTED,
              maxWidth: '62ch',
            }}
          >
            Manage users and impersonate accounts for debugging.
          </p>
          <Link
            to="/admin/revenue"
            className="adm-nav-link"
            style={{
              marginTop: 10,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              fontFamily: FONT_DISPLAY,
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: BRAND_GOLD_LIGHT,
              textDecoration: 'none',
              width: 'fit-content',
            }}
          >
            Revenue Analytics →
          </Link>
          <Link
            to="/admin/users"
            className="adm-nav-link"
            style={{
              marginTop: 6,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              fontFamily: FONT_DISPLAY,
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: BRAND_GOLD_LIGHT,
              textDecoration: 'none',
              width: 'fit-content',
            }}
          >
            User Management →
          </Link>
        </YStack>

        {/* Quick Stats & Actions — only rendered when user data has loaded */}
        {data && (
          <YStack gap={12} marginBottom={24}>
            <XStack gap={10} flexWrap="wrap">
              <StatCard label="Total Users" value={String(allUsers.length)} />
              <StatCard
                label="Admins"
                value={String(
                  allUsers.filter((u) => u.accessLevel === 'admin').length,
                )}
                accent={BRAND_GOLD}
              />
              <StatCard
                label="Standard"
                value={String(
                  allUsers.filter((u) => u.accessLevel !== 'admin').length,
                )}
              />
            </XStack>
            <XStack gap={8} flexWrap="wrap" alignItems="center">
              <span
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontWeight: 700,
                  fontSize: 11,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: TEXT_TERTIARY,
                  marginRight: 4,
                }}
              >
                Quick Actions
              </span>
              <Link
                to="/admin/revenue"
                className="adm-action-link"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontFamily: FONT_DISPLAY,
                  fontWeight: 700,
                  fontSize: 12,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: BRAND_GOLD_LIGHT,
                  textDecoration: 'none',
                  background: withAlpha(BRAND_GOLD, 0.08),
                  border: `1px solid ${withAlpha(BRAND_GOLD, 0.25)}`,
                  padding: '6px 12px',
                  borderRadius: 6,
                }}
              >
                Revenue Analytics →
              </Link>
            </XStack>
          </YStack>
        )}

        {/* Users section */}
        <AdminSection
          number="01"
          title="Users"
          count={data ? `${allUsers.length} TOTAL` : undefined}
        >
          {/* Search */}
          <YStack position="relative" marginTop={6} marginBottom={6}>
            <svg
              width={18}
              height={18}
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
              style={{
                position: 'absolute',
                left: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                color: TEXT_TERTIARY,
                pointerEvents: 'none',
              }}
            >
              <circle
                cx="11"
                cy="11"
                r="7"
                stroke="currentColor"
                strokeWidth={1.75}
              />
              <path
                d="M20 20l-3.5-3.5"
                stroke="currentColor"
                strokeWidth={1.75}
                strokeLinecap="round"
              />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email, or ID…"
              aria-label="Search users"
              style={{
                width: '100%',
                background: SURFACE_CARD,
                border: `1px solid ${OUTLINE_SUBTLE}`,
                color: TEXT_PRIMARY,
                fontFamily: FONT_BODY,
                fontSize: 15,
                padding: '12px 16px 12px 42px',
                borderRadius: 6,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </YStack>

          {/* Loading skeleton */}
          {loading && <UsersSkeleton />}

          {/* Error */}
          {error && (
            <XStack
              gap={14}
              padding={16}
              borderRadius={16}
              alignItems="flex-start"
              style={{
                background: withAlpha(BRAND_SEAM_RED, 0.1),
                border: `1px solid ${withAlpha(BRAND_SEAM_RED, 0.4)}`,
              }}
            >
              <svg
                width={24}
                height={24}
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden
                style={{ color: SCORE_LOSS, flexShrink: 0 }}
              >
                <path
                  d="M12 9v4m0 4h.01M10.29 3.86l-8.07 14a2 2 0 001.71 3h16.14a2 2 0 001.71-3l-8.07-14a2 2 0 00-3.42 0z"
                  stroke="currentColor"
                  strokeWidth={1.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <YStack flex={1} gap={4}>
                <h3
                  style={{
                    margin: 0,
                    fontFamily: FONT_DISPLAY,
                    fontWeight: 700,
                    fontSize: 16,
                    color: SCORE_LOSS,
                  }}
                >
                  Failed to load users
                </h3>
                <p
                  style={{
                    margin: 0,
                    fontFamily: FONT_BODY,
                    fontSize: 14,
                    color: TEXT_FG2,
                  }}
                >
                  <code
                    style={{
                      fontFamily: FONT_MONO,
                      fontSize: 12.5,
                      color: TEXT_MUTED,
                      background: 'rgba(8, 12, 20, 0.4)',
                      padding: '1px 6px',
                      borderRadius: 4,
                    }}
                  >
                    {error.message}
                  </code>
                </p>
              </YStack>
            </XStack>
          )}

          {/* Empty (no search results) */}
          {!loading && !error && filteredUsers.length === 0 && (
            <YStack
              alignItems="center"
              justifyContent="center"
              gap={14}
              paddingHorizontal={20}
              paddingVertical={40}
              borderRadius={16}
              style={{
                background: SURFACE_CARD,
                border: `1px dashed ${BORDER_STRONG}`,
                textAlign: 'center',
              }}
            >
              <YStack
                width={52}
                height={52}
                borderRadius={9999}
                alignItems="center"
                justifyContent="center"
                style={{
                  background: SURFACE_HOVER,
                  border: `1px solid ${BORDER_STRONG}`,
                  color: TEXT_TERTIARY,
                }}
              >
                <svg
                  width={22}
                  height={22}
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden
                >
                  <circle
                    cx="11"
                    cy="11"
                    r="7"
                    stroke="currentColor"
                    strokeWidth={1.75}
                  />
                  <path
                    d="M20 20l-3.5-3.5"
                    stroke="currentColor"
                    strokeWidth={1.75}
                    strokeLinecap="round"
                  />
                </svg>
              </YStack>
              <h3
                style={{
                  margin: 0,
                  fontFamily: FONT_DISPLAY,
                  fontWeight: 700,
                  fontSize: 18,
                  color: TEXT_PRIMARY,
                }}
              >
                No users found
              </h3>
              <p
                style={{
                  margin: 0,
                  fontFamily: FONT_BODY,
                  fontSize: 14,
                  color: TEXT_MUTED,
                  maxWidth: '50ch',
                }}
              >
                {search ? (
                  <>
                    Nothing matches{' '}
                    <span
                      style={{
                        fontFamily: FONT_MONO,
                        color: BRAND_GOLD_LIGHT,
                        background: withAlpha(BRAND_GOLD, 0.08),
                        padding: '1px 6px',
                        borderRadius: 4,
                      }}
                    >
                      “{search}”
                    </span>
                    . Try a different name, email, or ID.
                  </>
                ) : (
                  <>No users in the directory yet.</>
                )}
              </p>
            </YStack>
          )}

          {/* User list */}
          {!loading && !error && filteredUsers.length > 0 && (
            <YStack
              gap={1}
              borderRadius={8}
              overflow="hidden"
              style={{
                background: OUTLINE_SUBTLE,
                border: `1px solid ${OUTLINE_SUBTLE}`,
              }}
            >
              {filteredUsers.map((u) => {
                const isYou = u.id === auth.user?.id;
                const isAdmin = u.accessLevel === 'admin';
                const initial = (u.username ?? u.email ?? '?')
                  .charAt(0)
                  .toUpperCase();
                const avBackground = isYou
                  ? `linear-gradient(135deg, ${BRAND_GOLD} 0%, ${BRAND_NAVY_DARK} 100%)`
                  : isAdmin
                    ? `linear-gradient(135deg, ${BRAND_NAVY_LIGHT} 0%, ${BRAND_NAVY_DARK} 100%)`
                    : `linear-gradient(135deg, ${BRAND_NAVY} 0%, ${BRAND_GOLD} 100%)`;

                return (
                  <XStack
                    key={u.id}
                    alignItems="center"
                    gap={14}
                    paddingHorizontal={16}
                    paddingVertical={14}
                    animation="quick"
                    style={{ background: SURFACE_CARD }}
                    hoverStyle={{ backgroundColor: SURFACE_HOVER }}
                    $sm={{
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      paddingHorizontal: 12,
                      paddingVertical: 12,
                      gap: 10,
                    }}
                  >
                    {/* Avatar */}
                    <YStack
                      width={44}
                      height={44}
                      borderRadius={9999}
                      alignItems="center"
                      justifyContent="center"
                      flexShrink={0}
                      style={{
                        background: avBackground,
                        color: isYou ? TEXT_ON_GOLD : WHITE,
                        fontFamily: FONT_DISPLAY,
                        fontWeight: 800,
                        fontSize: 18,
                      }}
                      $sm={{ width: 38, height: 38 }}
                    >
                      <span style={{ fontSize: 18 }}>{initial}</span>
                    </YStack>

                    {/* Body */}
                    <YStack flex={1} minWidth={0} gap={4}>
                      <XStack alignItems="center" gap={8} flexWrap="wrap">
                        <span
                          style={{
                            fontFamily: FONT_BODY,
                            fontWeight: 600,
                            fontSize: 15,
                            color: u.username ? TEXT_PRIMARY : TEXT_TERTIARY,
                            fontStyle: u.username ? 'normal' : 'italic',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: '100%',
                          }}
                        >
                          {u.username ?? '(no username)'}
                        </span>
                        {isYou && (
                          <span
                            style={{
                              fontFamily: FONT_DISPLAY,
                              fontWeight: 700,
                              fontSize: 10.5,
                              letterSpacing: '0.12em',
                              textTransform: 'uppercase',
                              padding: '3px 8px',
                              borderRadius: 9999,
                              color: WHITE,
                              background: BRAND_NAVY,
                              border: `1px solid ${BRAND_NAVY_LIGHT}`,
                            }}
                          >
                            You
                          </span>
                        )}
                      </XStack>
                      <span
                        style={{
                          fontFamily: FONT_MONO,
                          fontSize: 12.5,
                          color: u.email ? TEXT_MUTED : TEXT_TERTIARY,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {u.email ?? '—'}
                      </span>
                    </YStack>

                    {/* Actions row: badge + impersonate button */}
                    <XStack alignItems="center" gap={8} flexShrink={0}>
                      {/* Access level badge */}
                      <span
                        style={{
                          fontFamily: FONT_DISPLAY,
                          fontWeight: 700,
                          fontSize: 10.5,
                          letterSpacing: '0.12em',
                          textTransform: 'uppercase',
                          padding: '3px 8px',
                          borderRadius: 9999,
                          flexShrink: 0,
                          ...(isAdmin
                            ? {
                                color: BRAND_GOLD_LIGHT,
                                border: `1px solid ${withAlpha(BRAND_GOLD, 0.45)}`,
                                background: withAlpha(BRAND_GOLD, 0.1),
                              }
                            : {
                                color: TEXT_MUTED,
                                border: `1px solid ${OUTLINE_SUBTLE}`,
                                background: SURFACE_SUBTLE,
                              }),
                        }}
                      >
                        {u.accessLevel ?? 'none'}
                      </span>

                      {/* Impersonate */}
                      {!isYou && !isAdmin && (
                        <button
                          type="button"
                          onClick={() => {
                            if (u.id == null) return;
                            handleImpersonate(
                              u.id,
                              u.username ?? u.email ?? `user #${u.id}`,
                            );
                          }}
                          disabled={impersonatingId !== null}
                          style={{
                            appearance: 'none',
                            fontFamily: FONT_DISPLAY,
                            fontWeight: 700,
                            fontSize: 11,
                            letterSpacing: '0.1em',
                            textTransform: 'uppercase',
                            padding: '7px 12px',
                            borderRadius: 12,
                            cursor:
                              impersonatingId !== null
                                ? 'not-allowed'
                                : 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            transition:
                              'all 150ms cubic-bezier(0.2, 0.8, 0.2, 1)',
                            whiteSpace: 'nowrap',
                            color: WHITE,
                            background: BRAND_NAVY,
                            border: `1px solid ${BRAND_NAVY_LIGHT}`,
                            boxShadow: '0 1px 2px rgba(8, 12, 20, 0.4)',
                            opacity: impersonatingId !== null ? 0.55 : 1,
                            minHeight: 36,
                          }}
                        >
                          {impersonatingId === u.id ? (
                            <>
                              <span
                                aria-hidden
                                style={{
                                  width: 13,
                                  height: 13,
                                  border: '1.6px solid currentColor',
                                  borderRightColor: 'transparent',
                                  borderRadius: '50%',
                                  animation: 'admin-spin 800ms linear infinite',
                                  display: 'inline-block',
                                }}
                              />
                              Starting…
                            </>
                          ) : (
                            <>Impersonate</>
                          )}
                        </button>
                      )}
                    </XStack>
                  </XStack>
                );
              })}
            </YStack>
          )}
        </AdminSection>

        {/* JWT Decoder section */}
        <AdminSection number="02" title="JWT Decoder" defaultOpen={false}>
          <p
            style={{
              margin: '6px 0 0',
              fontFamily: FONT_BODY,
              fontSize: 14,
              color: TEXT_MUTED,
              maxWidth: '60ch',
            }}
          >
            Paste an access or refresh token to inspect its claims. Tokens are
            decoded entirely in the browser; nothing is sent to the server.
          </p>

          <textarea
            value={jwtInput}
            onChange={(e) => setJwtInput(e.target.value)}
            placeholder="Paste JWT here…"
            aria-label="JWT input"
            rows={4}
            style={{
              width: '100%',
              background: SURFACE_CARD,
              border: `1px solid ${OUTLINE_SUBTLE}`,
              color: TEXT_PRIMARY,
              fontFamily: FONT_MONO,
              fontSize: 12.5,
              lineHeight: 1.55,
              padding: '12px 14px',
              borderRadius: 8,
              resize: 'vertical',
              minHeight: 110,
              outline: 'none',
              wordBreak: 'break-all',
              boxSizing: 'border-box',
            }}
          />

          <XStack gap={10} flexWrap="wrap">
            <button
              type="button"
              onClick={handleDecodeJwt}
              style={{
                appearance: 'none',
                fontFamily: FONT_DISPLAY,
                fontWeight: 700,
                fontSize: 12,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                padding: '9px 14px',
                borderRadius: 12,
                cursor: 'pointer',
                color: WHITE,
                background: BRAND_NAVY,
                border: `1px solid ${BRAND_NAVY_LIGHT}`,
                boxShadow: '0 1px 2px rgba(8, 12, 20, 0.4)',
                minHeight: 40,
              }}
            >
              Decode
            </button>
          </XStack>

          {jwtError && (
            <XStack
              gap={10}
              padding={12}
              borderRadius={8}
              alignItems="flex-start"
              style={{
                background: withAlpha(BRAND_SEAM_RED, 0.1),
                border: `1px solid ${withAlpha(BRAND_SEAM_RED, 0.4)}`,
              }}
            >
              <svg
                width={18}
                height={18}
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden
                style={{ color: SCORE_LOSS, flexShrink: 0, marginTop: 1 }}
              >
                <path
                  d="M12 9v4m0 4h.01M10.29 3.86l-8.07 14a2 2 0 001.71 3h16.14a2 2 0 001.71-3l-8.07-14a2 2 0 00-3.42 0z"
                  stroke="currentColor"
                  strokeWidth={1.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span
                style={{
                  fontFamily: FONT_BODY,
                  fontSize: 14,
                  color: SCORE_LOSS,
                }}
              >
                {jwtError}
              </span>
            </XStack>
          )}

          {jwtResult && (
            <YStack gap={14}>
              <ExpiryBanner
                isExpired={jwtResult.isExpired}
                expiresAt={jwtResult.expiresAt}
              />

              <JsonBlock label="Header" alg={algValue}>
                {renderJsonWithTints(jwtResult.header)}
              </JsonBlock>
              <JsonBlock label="Payload">
                {renderJsonWithTints(jwtResult.payload)}
              </JsonBlock>
            </YStack>
          )}
        </AdminSection>
      </YStack>

      <Dialog
        open={pendingImpersonation !== null}
        onOpenChange={(open) => {
          if (!open) setPendingImpersonation(null);
        }}
        eyebrow="Admin action"
        title="Impersonate user"
        description={`You are about to impersonate ${pendingImpersonation?.label ?? ''}. You will be signed in as this user until you sign out.`}
        confirmLabel="Impersonate"
        cancelLabel="Cancel"
        onConfirm={() => {
          void handleImpersonateConfirm();
        }}
        onCancel={() => setPendingImpersonation(null)}
      />

      {/* Keyframes for spinner — injected once at component scope. */}
      <style>{`@keyframes admin-spin { to { transform: rotate(360deg); } }
        @keyframes admin-shimmer {
          from { background-position: 200% 0; }
          to { background-position: -200% 0; }
        }
        .adm-nav-link:focus-visible {
          outline: 2px solid ${BRAND_GOLD};
          outline-offset: 2px;
          border-radius: 2px;
        }
        .adm-nav-link:hover, .adm-nav-link:focus-visible {
          text-decoration: underline;
        }
        .adm-action-link:focus-visible {
          outline: 2px solid ${BRAND_GOLD};
          outline-offset: 2px;
        }`}</style>
    </YStack>
  );
}

// ─── Expiry banner ────────────────────────────────────────────────────────────

interface ExpiryBannerProps {
  isExpired: boolean;
  expiresAt: Date | null;
}

function ExpiryBanner({ isExpired, expiresAt }: ExpiryBannerProps) {
  const state: 'valid' | 'expired' | 'none' = isExpired
    ? 'expired'
    : expiresAt
      ? 'valid'
      : 'none';

  const palette =
    state === 'valid'
      ? {
          bg: 'rgba(34, 110, 74, 0.14)',
          border: 'rgba(34, 110, 74, 0.5)',
          fg: SUCCESS_FG,
        }
      : state === 'expired'
        ? {
            bg: withAlpha(BRAND_SEAM_RED, 0.14),
            border: withAlpha(BRAND_SEAM_RED, 0.5),
            fg: SCORE_LOSS,
          }
        : {
            bg: SURFACE_SUBTLE,
            border: BORDER_STRONG,
            fg: TEXT_MUTED,
          };

  const label =
    state === 'valid'
      ? 'Token valid'
      : state === 'expired'
        ? 'Token expired'
        : 'No expiry';

  const detail =
    state === 'valid' && expiresAt
      ? `Expires ${expiresAt.toLocaleString()}`
      : state === 'expired' && expiresAt
        ? `Expired at ${expiresAt.toLocaleString()}`
        : 'The exp claim is absent from the payload.';

  return (
    <XStack
      gap={12}
      padding={12}
      borderRadius={8}
      alignItems="center"
      style={{
        background: palette.bg,
        border: `1px solid ${palette.border}`,
      }}
    >
      <YStack flex={1} gap={2} minWidth={0}>
        <span
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 700,
            fontSize: 12,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: palette.fg,
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontFamily: state === 'none' ? FONT_BODY : FONT_MONO,
            fontSize: 13,
            color: TEXT_FG2,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {detail}
        </span>
      </YStack>
    </XStack>
  );
}

// ─── JSON block ───────────────────────────────────────────────────────────────

interface JsonBlockProps {
  label: string;
  alg?: string | null;
  children: React.ReactNode;
}

function JsonBlock({ label, alg, children }: JsonBlockProps) {
  return (
    <YStack
      borderRadius={8}
      overflow="hidden"
      style={{
        background: SURFACE_CARD,
        border: `1px solid ${OUTLINE_SUBTLE}`,
      }}
    >
      <XStack
        alignItems="center"
        justifyContent="space-between"
        paddingHorizontal={14}
        paddingVertical={10}
        style={{
          background: `linear-gradient(180deg, ${withAlpha(BRAND_NAVY, 0.18)}, transparent)`,
          borderBottom: `1px solid ${OUTLINE_SUBTLE}`,
        }}
      >
        <span
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 700,
            fontSize: 11.5,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: TEXT_FG2,
          }}
        >
          {label}
        </span>
        {alg != null && (
          <span
            style={{
              fontFamily: FONT_MONO,
              fontSize: 11,
              color: BRAND_GOLD_LIGHT,
              background: withAlpha(BRAND_GOLD, 0.1),
              border: `1px solid ${withAlpha(BRAND_GOLD, 0.3)}`,
              padding: '2px 8px',
              borderRadius: 9999,
            }}
          >
            {alg}
          </span>
        )}
      </XStack>
      <pre
        style={{
          margin: 0,
          padding: '14px 16px',
          fontFamily: FONT_MONO,
          fontSize: 12.5,
          lineHeight: 1.6,
          color: TEXT_PRIMARY,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          overflowX: 'auto',
        }}
      >
        {children}
      </pre>
    </YStack>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function UsersSkeleton() {
  const skBg = `linear-gradient(90deg, ${SURFACE_CARD} 0%, ${SURFACE_HOVER} 50%, ${SURFACE_CARD} 100%)`;
  return (
    <YStack
      gap={1}
      borderRadius={8}
      overflow="hidden"
      style={{
        background: OUTLINE_SUBTLE,
        border: `1px solid ${OUTLINE_SUBTLE}`,
      }}
      aria-busy
      aria-label="Loading users"
    >
      {[0, 1, 2, 3].map((i) => (
        <XStack
          key={i}
          alignItems="center"
          gap={14}
          paddingHorizontal={16}
          paddingVertical={14}
          style={{ background: SURFACE_CARD }}
        >
          <YStack
            width={44}
            height={44}
            borderRadius={9999}
            flexShrink={0}
            style={{
              background: skBg,
              backgroundSize: '200% 100%',
              animation: 'admin-shimmer 1.4s linear infinite',
            }}
          />
          <YStack flex={1} gap={8}>
            <span
              style={{
                display: 'block',
                height: 12,
                width: '40%',
                borderRadius: 6,
                background: skBg,
                backgroundSize: '200% 100%',
                animation: 'admin-shimmer 1.4s linear infinite',
              }}
            />
            <span
              style={{
                display: 'block',
                height: 10,
                width: '60%',
                borderRadius: 6,
                background: skBg,
                backgroundSize: '200% 100%',
                animation: 'admin-shimmer 1.4s linear infinite',
              }}
            />
          </YStack>
        </XStack>
      ))}
    </YStack>
  );
}

export default AdminPage;
