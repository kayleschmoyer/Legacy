import React, { useEffect, useState } from 'react';
import { LOGGER } from '@legacy-sports/logging';
import { XStack, YStack } from '@legacy-sports/shared-components/ui';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@legacy-sports/shared-components/auth';
import { Spinner } from 'tamagui';
import {
  useGetAllUsersQuery,
  useGetUserByIdQuery,
  useGetUsersCountQuery,
} from '@legacy-sports/graphql';
import { PageMeta } from '../../components/PageMeta';
import { FONT_BODY, FONT_DISPLAY, FONT_MONO } from '../../constants/typography';
import {
  BRAND_GOLD,
  BRAND_NAVY,
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED,
  SUCCESS_FG,
  TEXT_ON_GOLD,
  withAlpha,
} from '../../constants/colors';

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
// Mirrors the design mockup's .json-block colour scheme: keys = brandGoldLight,
// strings = green10, numbers = blue11, booleans/null = brandSeamRedLight,
// punctuation = color10.

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
      color = 'var(--brandGoldLight)'; // key
    else if (match[2] != null)
      color = 'var(--green10)'; // string
    else if (match[3] != null)
      color = 'var(--brandSeamRedLight)'; // bool/null
    else if (match[4] != null)
      color = 'var(--blue11)'; // number
    else if (match[5] != null) color = 'var(--color10)'; // punctuation
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
        background: 'var(--surfaceCard)',
        border: `1px solid var(--outlineSubtle)`,
        minWidth: 100,
      }}
    >
      <span
        style={{
          fontFamily: FONT_BODY,
          fontSize: 11,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--color10)',
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
          color: accent ?? 'var(--color)',
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
      // Animated Tamagui components must use $token props, not var(--token):
      // the react-native animation driver interpolates colour values through
      // RN's normalizer, which cannot parse a CSS custom property and returns
      // null — crashing the page at runtime.
      backgroundColor="$surfacePanel"
      borderColor={open ? '$outlineStrong' : '$outlineSubtle'}
      style={{
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
            color: 'var(--color10)',
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
            color: 'var(--color)',
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
              color: 'var(--textMuted)',
              padding: '4px 10px',
              border: `1px solid var(--outlineSubtle)`,
              borderRadius: 9999,
              background: 'var(--surfaceSubtle)',
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
            color: open ? 'var(--brandGold)' : 'var(--textMuted)',
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

// ─── Admin nav hub ────────────────────────────────────────────────────────────

interface NavCardProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  description: string;
}

function NavCard({ to, icon, label, description }: NavCardProps) {
  const [hovered, setHovered] = React.useState(false);
  const descriptionId = `nav-card-desc-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <Link
      to={to}
      aria-label={label}
      aria-describedby={descriptionId}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: '18px 20px',
        borderRadius: 12,
        background: hovered ? 'var(--color4)' : 'var(--surfaceCard)',
        border: `1px solid ${hovered ? 'var(--outlineStrong)' : 'var(--outlineSubtle)'}`,
        textDecoration: 'none',
        transition: 'background 150ms ease, border-color 150ms ease',
        flex: '1 1 160px',
        minWidth: 0,
      }}
    >
      <span
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: withAlpha(BRAND_NAVY, 0.6),
          border: `1px solid ${withAlpha(BRAND_NAVY_LIGHT, 0.4)}`,
          color: 'var(--brandGoldLight)',
          flexShrink: 0,
        }}
      >
        {icon}
      </span>
      <span
        style={{
          fontFamily: FONT_DISPLAY,
          fontWeight: 800,
          fontSize: 15,
          color: 'var(--color)',
          letterSpacing: '-0.01em',
        }}
      >
        {label}
      </span>
      <span
        id={descriptionId}
        style={{
          fontFamily: FONT_BODY,
          fontSize: 13,
          color: 'var(--textMuted)',
          lineHeight: 1.45,
        }}
      >
        {description}
      </span>
    </Link>
  );
}

function AdminNavHub() {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 12,
        marginTop: 16,
      }}
      aria-label="Admin navigation"
      role="navigation"
    >
      <NavCard
        to="/admin/users"
        label="Users"
        description="Browse, search, and manage all registered accounts."
        icon={
          <svg
            width={18}
            height={18}
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
          >
            <circle
              cx="9"
              cy="7"
              r="4"
              stroke="currentColor"
              strokeWidth={1.75}
            />
            <path
              d="M2 21c0-4 3.134-7 7-7h4c3.866 0 7 3 7 7"
              stroke="currentColor"
              strokeWidth={1.75}
              strokeLinecap="round"
            />
          </svg>
        }
      />
      <NavCard
        to="/admin/revenue"
        label="Revenue"
        description="Subscription metrics, MRR, and payment analytics."
        icon={
          <svg
            width={18}
            height={18}
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
          >
            <path
              d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"
              stroke="currentColor"
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        }
      />
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AdminPage(): React.JSX.Element | null {
  const navigate = useNavigate();
  const auth = useAuth();
  const [showAccessToast, setShowAccessToast] = useState(false);

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
      setJwtInput('');
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
    if (currentUserId !== 0) {
      LOGGER.error('Admin panel opened', {
        audit: true,
        actor: { id: currentUserId },
      });
    }
  }, [currentUserId]);

  useEffect(() => {
    const handleFocus = () => {
      if (auth.isAuthenticated && currentUserId !== 0) {
        void refetchServerUser();
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [auth.isAuthenticated, currentUserId, refetchServerUser]);

  const { data: countData } = useGetUsersCountQuery({
    skip: auth.user?.accessLevel !== 'admin',
    fetchPolicy: 'cache-and-network',
  });

  const { data: recentData, loading: recentLoading } = useGetAllUsersQuery({
    variables: { limit: 5, offset: 0, orderBy: 'id', orderDirection: 'desc' },
    skip: auth.user?.accessLevel !== 'admin',
    fetchPolicy: 'cache-and-network',
  });

  const serverAccessLevel = serverUserData?.user?.accessLevel;
  const isNotAdmin =
    !auth.isLoading && !serverUserLoading && serverAccessLevel !== 'admin';
  const isAuthenticatedNotAdmin = isNotAdmin && auth.isAuthenticated;

  useEffect(() => {
    if (!isNotAdmin) return;
    if (isAuthenticatedNotAdmin) {
      setShowAccessToast(true);
      const t = setTimeout(() => void navigate('/', { replace: true }), 2500);
      return () => clearTimeout(t);
    }
    void navigate('/', { replace: true });
    return undefined;
  }, [isNotAdmin, isAuthenticatedNotAdmin, navigate]);

  if (auth.isLoading || serverUserLoading) {
    return (
      <YStack
        flex={1}
        alignItems="center"
        justifyContent="center"
        minHeight={200}
        data-testid="admin-auth-loading"
      >
        <Spinner size="large" />
      </YStack>
    );
  }

  if (isNotAdmin) {
    if (showAccessToast) {
      return (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 9999,
            maxWidth: 380,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 16px',
            borderRadius: 10,
            background: 'var(--brandNavy)',
            border: `1px solid ${withAlpha(BRAND_GOLD, 0.35)}`,
            boxShadow: '0 8px 32px var(--shadowColor)',
            color: 'var(--color11)',
            fontSize: 13,
            fontWeight: 500,
            lineHeight: 1.5,
            animation: 'adminAccessFadeIn 0.2s ease-out',
          }}
        >
          <span aria-hidden="true" style={{ fontSize: 15, flexShrink: 0 }}>
            🔒
          </span>
          <span>You don&apos;t have access to admin tools.</span>
          <style>{`
            @keyframes adminAccessFadeIn {
              from { opacity: 0; transform: translateY(6px); }
              to   { opacity: 1; transform: translateY(0); }
            }
          `}</style>
        </div>
      );
    }
    return null;
  }

  const isImpersonating = !!auth.user?.impersonatedBy;

  const totalUsers = countData?.usersCount ?? 0;
  const recentUsers = recentData?.users ?? [];

  const algValue =
    jwtResult != null && typeof jwtResult.header['alg'] === 'string'
      ? jwtResult.header['alg']
      : null;

  return (
    <YStack
      minHeight="100vh"
      style={{
        background: 'var(--background)',
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
          style={{ borderBottom: `1px solid var(--outlineSubtle)` }}
        >
          <XStack alignItems="center" gap={8}>
            <span
              aria-hidden
              style={{
                width: 24,
                height: 1,
                background: 'var(--brandGold)',
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
                color: 'var(--brandGold)',
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
              color: 'var(--textOnAccent)',
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
              color: 'var(--textMuted)',
              maxWidth: '62ch',
            }}
          >
            Platform overview and developer tools. Manage users via{' '}
            <Link
              to="/admin/users"
              style={{ color: 'var(--brandGoldLight)', textDecoration: 'none' }}
            >
              User Management
            </Link>
            .
          </p>
          <AdminNavHub />
        </YStack>

        {/* Impersonation banner */}
        {isImpersonating && (
          <XStack
            gap={14}
            padding={16}
            borderRadius={12}
            alignItems="flex-start"
            marginBottom={20}
            role="alert"
            aria-live="assertive"
            style={{
              background: withAlpha(BRAND_SEAM_RED, 0.12),
              border: `1px solid ${withAlpha(BRAND_SEAM_RED, 0.55)}`,
            }}
          >
            <svg
              width={22}
              height={22}
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
              style={{
                color: 'var(--brandSeamRedLight)',
                flexShrink: 0,
                marginTop: 1,
              }}
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
              <span
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontWeight: 700,
                  fontSize: 13,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--brandSeamRedLight)',
                }}
              >
                Impersonation Active
              </span>
              <span
                style={{
                  fontFamily: FONT_BODY,
                  fontSize: 14,
                  color: 'var(--color11)',
                  lineHeight: 1.5,
                }}
              >
                You are viewing admin tools as{' '}
                <span
                  style={{
                    fontFamily: FONT_MONO,
                    fontSize: 13,
                    color: 'var(--brandSeamRedLight)',
                    background: withAlpha(BRAND_SEAM_RED, 0.15),
                    padding: '1px 6px',
                    borderRadius: 4,
                  }}
                >
                  {auth.user?.impersonatedBy?.username ?? 'Unknown Admin'}
                </span>
                . Mutating actions are disabled for this session.
              </span>
            </YStack>
          </XStack>
        )}

        {/* Quick Stats & Actions */}
        <YStack gap={12} marginBottom={24}>
          <XStack gap={10} flexWrap="wrap">
            <StatCard
              label="Total Users"
              value={totalUsers > 0 ? String(totalUsers) : '—'}
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
                color: 'var(--color10)',
                marginRight: 4,
              }}
            >
              Quick Actions
            </span>
            <Link
              to="/admin/users"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontFamily: FONT_DISPLAY,
                fontWeight: 700,
                fontSize: 12,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--brandGoldLight)',
                textDecoration: 'none',
                background: withAlpha(BRAND_GOLD, 0.08),
                border: `1px solid ${withAlpha(BRAND_GOLD, 0.25)}`,
                padding: '6px 12px',
                borderRadius: 6,
              }}
            >
              Manage Users →
            </Link>
            <Link
              to="/admin/revenue"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontFamily: FONT_DISPLAY,
                fontWeight: 700,
                fontSize: 12,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--brandGoldLight)',
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

        {/* Recent Signups section */}
        <AdminSection number="01" title="Recent Signups" defaultOpen={true}>
          <p
            style={{
              margin: '0 0 12px',
              fontFamily: FONT_BODY,
              fontSize: 14,
              color: 'var(--textMuted)',
            }}
          >
            The 5 most recently registered accounts. For search, filtering, role
            management, and impersonation, use the{' '}
            <Link
              to="/admin/users"
              style={{ color: 'var(--brandGoldLight)', textDecoration: 'none' }}
            >
              User Management page
            </Link>
            .
          </p>

          {recentLoading && <UsersSkeleton />}

          {!recentLoading && recentUsers.length > 0 && (
            <YStack
              gap={1}
              borderRadius={8}
              overflow="hidden"
              style={{
                background: 'var(--outlineSubtle)',
                border: `1px solid var(--outlineSubtle)`,
              }}
            >
              {recentUsers.map((u) => {
                const isYou = u.id === auth.user?.id;
                const isAdmin = u.accessLevel === 'admin';
                const initial = (u.username ?? u.email ?? '?')
                  .charAt(0)
                  .toUpperCase();
                const avBackground = isYou
                  ? `linear-gradient(135deg, var(--brandGold) 0%, var(--brandNavyDark) 100%)`
                  : isAdmin
                    ? `linear-gradient(135deg, var(--brandNavyLight) 0%, var(--brandNavyDark) 100%)`
                    : `linear-gradient(135deg, var(--brandNavy) 0%, var(--brandGold) 100%)`;

                return (
                  <XStack
                    key={u.id}
                    alignItems="center"
                    gap={14}
                    paddingHorizontal={16}
                    paddingVertical={14}
                    animation="quick"
                    backgroundColor="$surfaceCard"
                    hoverStyle={{ backgroundColor: '$color4' }}
                  >
                    <YStack
                      width={40}
                      height={40}
                      borderRadius={9999}
                      alignItems="center"
                      justifyContent="center"
                      flexShrink={0}
                      style={{
                        background: avBackground,
                        color: isYou ? TEXT_ON_GOLD : 'var(--textOnAccent)',
                        fontFamily: FONT_DISPLAY,
                        fontWeight: 800,
                        fontSize: 16,
                      }}
                    >
                      <span>{initial}</span>
                    </YStack>
                    <YStack flex={1} minWidth={0} gap={3}>
                      <span
                        style={{
                          fontFamily: FONT_BODY,
                          fontWeight: 600,
                          fontSize: 14,
                          color: u.username ? 'var(--color)' : 'var(--color10)',
                          fontStyle: u.username ? 'normal' : 'italic',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {u.username ?? '(no username)'}
                      </span>
                      <span
                        style={{
                          fontFamily: FONT_MONO,
                          fontSize: 12,
                          color: 'var(--textMuted)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {u.email ?? '—'}
                      </span>
                    </YStack>
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
                              color: 'var(--brandGoldLight)',
                              border: `1px solid ${withAlpha(BRAND_GOLD, 0.45)}`,
                              background: withAlpha(BRAND_GOLD, 0.1),
                            }
                          : {
                              color: 'var(--textMuted)',
                              border: `1px solid var(--outlineSubtle)`,
                              background: 'var(--surfaceSubtle)',
                            }),
                      }}
                    >
                      {u.accessLevel ?? 'none'}
                    </span>
                  </XStack>
                );
              })}
            </YStack>
          )}

          <Link
            to="/admin/users"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontFamily: FONT_DISPLAY,
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--brandGoldLight)',
              textDecoration: 'none',
              background: withAlpha(BRAND_GOLD, 0.08),
              border: `1px solid ${withAlpha(BRAND_GOLD, 0.25)}`,
              padding: '8px 14px',
              borderRadius: 6,
              marginTop: 4,
              width: 'fit-content',
            }}
          >
            View All Users →
          </Link>
        </AdminSection>

        {/* JWT Decoder section */}
        <AdminSection number="02" title="JWT Decoder" defaultOpen={false}>
          <p
            style={{
              margin: '6px 0 0',
              fontFamily: FONT_BODY,
              fontSize: 14,
              color: 'var(--textMuted)',
              maxWidth: '60ch',
            }}
          >
            Paste an access or refresh token to inspect its claims. Tokens are
            decoded entirely in the browser; nothing is sent to the server.
          </p>

          <XStack
            gap={10}
            padding={12}
            borderRadius={8}
            alignItems="flex-start"
            style={{
              background: withAlpha(BRAND_GOLD, 0.08),
              border: `1px solid ${withAlpha(BRAND_GOLD, 0.35)}`,
            }}
          >
            <svg
              width={16}
              height={16}
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
              style={{ color: 'var(--brandGold)', flexShrink: 0, marginTop: 2 }}
            >
              <path
                d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                stroke="currentColor"
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span
              style={{
                fontFamily: FONT_BODY,
                fontSize: 13,
                color: 'var(--brandGold)',
                lineHeight: 1.5,
              }}
            >
              Tokens you paste are visible in browser memory and to any
              installed extensions. Do not paste tokens belonging to other users
              or customers. The input is cleared after decoding.
            </span>
          </XStack>

          <textarea
            value={jwtInput}
            onChange={(e) => setJwtInput(e.target.value)}
            placeholder="Paste JWT here…"
            aria-label="JWT input"
            data-sentry-mask
            rows={4}
            style={{
              width: '100%',
              background: 'var(--surfaceCard)',
              border: `1px solid var(--outlineSubtle)`,
              color: 'var(--color)',
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
              disabled={isImpersonating}
              style={{
                appearance: 'none',
                fontFamily: FONT_DISPLAY,
                fontWeight: 700,
                fontSize: 12,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                padding: '9px 14px',
                borderRadius: 12,
                cursor: isImpersonating ? 'not-allowed' : 'pointer',
                color: 'var(--textOnAccent)',
                background: 'var(--brandNavy)',
                border: `1px solid var(--brandNavyLight)`,
                boxShadow: '0 1px 2px var(--shadowColor)',
                minHeight: 40,
                opacity: isImpersonating ? 0.55 : 1,
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
                style={{
                  color: 'var(--brandSeamRedLight)',
                  flexShrink: 0,
                  marginTop: 1,
                }}
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
                  color: 'var(--brandSeamRedLight)',
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

      <style>{`@keyframes admin-shimmer {
          from { background-position: 200% 0; }
          to { background-position: -200% 0; }
        }
        .adm-nav-link:focus-visible {
          outline: 2px solid var(--brandGold);
          outline-offset: 2px;
          border-radius: 2px;
        }
        .adm-nav-link:hover, .adm-nav-link:focus-visible {
          text-decoration: underline;
        }
        .adm-action-link:focus-visible {
          outline: 2px solid var(--brandGold);
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
          bg: 'var(--successMuted)',
          border: withAlpha(SUCCESS_FG, 0.5),
          fg: 'var(--green10)',
        }
      : state === 'expired'
        ? {
            bg: withAlpha(BRAND_SEAM_RED, 0.14),
            border: withAlpha(BRAND_SEAM_RED, 0.5),
            fg: 'var(--brandSeamRedLight)',
          }
        : {
            bg: 'var(--surfaceSubtle)',
            border: 'var(--outlineStrong)',
            fg: 'var(--textMuted)',
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
            color: 'var(--color11)',
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
        background: 'var(--surfaceCard)',
        border: `1px solid var(--outlineSubtle)`,
      }}
    >
      <XStack
        alignItems="center"
        justifyContent="space-between"
        paddingHorizontal={14}
        paddingVertical={10}
        style={{
          background: `linear-gradient(180deg, ${withAlpha(BRAND_NAVY, 0.18)}, transparent)`,
          borderBottom: `1px solid var(--outlineSubtle)`,
        }}
      >
        <span
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 700,
            fontSize: 11.5,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--color11)',
          }}
        >
          {label}
        </span>
        {alg != null && (
          <span
            style={{
              fontFamily: FONT_MONO,
              fontSize: 11,
              color: 'var(--brandGoldLight)',
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
          color: 'var(--color)',
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
  const skBg = `linear-gradient(90deg, var(--surfaceCard) 0%, var(--color4) 50%, var(--surfaceCard) 100%)`;
  return (
    <YStack
      gap={1}
      borderRadius={8}
      overflow="hidden"
      style={{
        background: 'var(--outlineSubtle)',
        border: `1px solid var(--outlineSubtle)`,
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
          style={{ background: 'var(--surfaceCard)' }}
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
