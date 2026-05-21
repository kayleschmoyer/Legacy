import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { LOGGER } from '@legacy-sports/logging';
import { PageMeta } from '../../components/PageMeta';
import {
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  BRAND_SEAM_RED,
  BRAND_SEAM_RED_LIGHT,
  withAlpha,
} from '../../constants/colors';
import { FONT_BODY, FONT_DISPLAY } from '../../constants/typography';
import {
  useGetNotificationHistoryQuery,
  useGetUnreadNotificationCountQuery,
  useMarkAllNotificationsAsReadMutation,
  useMarkNotificationAsReadMutation,
} from '../../api/db/graphql.generated';
import { formatTimeAgo } from '../../utils/formatTimeAgo';

const PAGE_SIZE = 20;

/* ─── Editorial palette (mirrors the design bundle) ─── */
const BG_PANEL = '#111B2F';
const BG_SUBTLE = '#0D1526';
const BG_ELEVATED = '#16223A';
const BORDER = '#1E2D45';
const BORDER_STRONG = '#2F3B53';
const TEXT_PRIMARY = '#E8EDF5';
const TEXT_SECONDARY = '#8A9BB5';
const TEXT_QUIET = '#6C80BA';
const TEXT_STRONG = '#FFFFFF';
const INFO_BLUE = '#5B84C4';

const PAGE_BACKGROUND: React.CSSProperties = {
  background: `
    radial-gradient(ellipse at 18% 0%, ${withAlpha(BRAND_NAVY, 0.22)} 0%, transparent 55%),
    radial-gradient(ellipse at 80% 6%, ${withAlpha(BRAND_SEAM_RED, 0.1)} 0%, transparent 45%),
    radial-gradient(ellipse at 50% 92%, ${withAlpha(BRAND_GOLD, 0.08)} 0%, transparent 50%),
    #0A0F1A
  `,
  backgroundAttachment: 'fixed',
  minHeight: '100vh',
  fontFamily: FONT_BODY,
  color: TEXT_PRIMARY,
};

/* ─── Notification-type taxonomy ─── */

type TypeCategory = 'matchup' | 'result' | 'trade' | 'draft' | 'system';

const TYPE_STRIPE: Record<TypeCategory, string> = {
  matchup: BRAND_GOLD,
  result: BRAND_SEAM_RED,
  trade: '#2C4A7C',
  draft: '#4AAE7C',
  system: '#7C8794',
};

const TYPE_BADGE_FG: Record<TypeCategory, string> = {
  matchup: BRAND_GOLD_LIGHT,
  result: BRAND_SEAM_RED_LIGHT,
  trade: '#8FB4E8',
  draft: '#6FD39A',
  system: TEXT_SECONDARY,
};

const TYPE_LABEL: Record<TypeCategory, string> = {
  matchup: 'Matchup',
  result: 'Result',
  trade: 'Trade',
  draft: 'Draft',
  system: 'League',
};

export function categorize(
  notificationType: string | null | undefined,
): TypeCategory {
  const t = (notificationType ?? '').toLowerCase();
  if (t.includes('draft')) return 'draft';
  if (t.includes('trade')) return 'trade';
  if (t.includes('ended') || t.includes('result') || t.includes('lost'))
    return 'result';
  if (t.includes('matchup') || t.includes('reminder') || t.includes('close'))
    return 'matchup';
  return 'system';
}

/* ─── Day-grouping helpers ─── */

const DAY_LABEL_FMT = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'short',
  day: 'numeric',
});

export function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function daySeparatorLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  const prefix = sameDay(d, today)
    ? 'Today'
    : sameDay(d, yesterday)
      ? 'Yesterday'
      : null;
  const formatted = DAY_LABEL_FMT.format(d);
  return prefix ? `${prefix} · ${formatted}` : formatted;
}

/* ─── Atomic style fragments ─── */

const eyebrow: React.CSSProperties = {
  fontFamily: FONT_DISPLAY,
  fontWeight: 700,
  fontSize: 12,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: BRAND_GOLD_LIGHT,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
};

const pageTitle: React.CSSProperties = {
  fontFamily: FONT_DISPLAY,
  fontWeight: 800,
  fontSize: 'clamp(40px, 6vw, 64px)',
  lineHeight: 0.95,
  letterSpacing: '-0.02em',
  color: TEXT_STRONG,
  margin: 0,
};

const headMeta: React.CSSProperties = {
  fontFamily: FONT_BODY,
  fontSize: 16,
  color: TEXT_SECONDARY,
  maxWidth: '70ch',
  lineHeight: 1.55,
  margin: 0,
};

const ghostButton: React.CSSProperties = {
  fontFamily: FONT_DISPLAY,
  fontWeight: 700,
  fontSize: 12,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  padding: '11px 18px',
  borderRadius: 12,
  background: 'transparent',
  color: TEXT_PRIMARY,
  border: `1px solid ${BORDER_STRONG}`,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  whiteSpace: 'nowrap',
  transition: 'border-color 150ms, background 150ms',
};

const daySepStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  margin: '18px 0 6px',
  fontFamily: FONT_DISPLAY,
  fontWeight: 700,
  fontSize: 11,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: TEXT_QUIET,
};

/* ─── Inline SVG icons ─── */

const IconCheckDouble: React.FC = () => (
  <svg
    width={14}
    height={14}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M20 6L9 17l-5-5" />
    <path d="M20 12L9 23l-5-5" opacity={0.5} />
  </svg>
);

const IconEye: React.FC = () => (
  <svg
    width={18}
    height={18}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx={12} cy={12} r={3} />
  </svg>
);

const IconChevron: React.FC<{ direction: 'left' | 'right' }> = ({
  direction,
}) => (
  <svg
    width={16}
    height={16}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={direction === 'left' ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} />
  </svg>
);

const IconBell: React.FC = () => (
  <svg
    width={48}
    height={48}
    viewBox="0 0 32 32"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M16 4c-4.4 0-8 3.6-8 8v5l-2 4h20l-2-4v-5c0-4.4-3.6-8-8-8z" />
    <path d="M13 25a3 3 0 0 0 6 0" />
    <path d="M22.5 8.5l1.5-1.5" stroke={BRAND_SEAM_RED} />
    <path d="M9.5 8.5L8 7" stroke={BRAND_SEAM_RED} />
  </svg>
);

const IconAlert: React.FC = () => (
  <svg
    width={32}
    height={32}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M10.3 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </svg>
);

const IconRetry: React.FC = () => (
  <svg
    width={14}
    height={14}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="23 4 23 10 17 10" />
    <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
  </svg>
);

/* ─── Notification card ─── */

type Notification = {
  id?: number | null;
  notificationType?: string | null;
  title?: string | null;
  message?: string | null;
  sentAt?: string | null;
  read?: boolean | null;
};

const NotificationCard: React.FC<{
  notification: Notification;
  onMarkRead: (id: number) => void;
}> = ({ notification, onMarkRead }) => {
  const category = categorize(notification.notificationType);
  const isUnread = !notification.read;
  const stripe = TYPE_STRIPE[category];

  const cardStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '12px minmax(0, 1fr) auto',
    alignItems: 'stretch',
    gap: 16,
    padding: '18px 20px 18px 0',
    background: isUnread
      ? `linear-gradient(180deg, ${withAlpha(BRAND_NAVY, 0.18)} 0%, ${BG_ELEVATED} 100%)`
      : BG_SUBTLE,
    border: `1px solid ${
      isUnread ? withAlpha(INFO_BLUE, 0.3) : 'rgba(255, 255, 255, 0.04)'
    }`,
    borderRadius: 14,
    textDecoration: 'none',
    color: 'inherit',
    cursor: isUnread ? 'pointer' : 'default',
    transition: 'border-color 150ms, background 150ms',
    position: 'relative',
    width: '100%',
    textAlign: 'left',
    font: 'inherit',
  };

  const onClick = () => {
    if (isUnread && notification.id != null) {
      onMarkRead(notification.id);
    }
  };

  return (
    <button type="button" onClick={onClick} style={cardStyle}>
      {/* 1px type-color stripe */}
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 14,
          bottom: 14,
          left: 0,
          width: 1,
          background: stripe,
          borderRadius: 1,
        }}
      />
      {/* Dot column */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
          padding: '22px 0 0 12px',
        }}
      >
        <span
          aria-label={isUnread ? 'Unread' : 'Read'}
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: isUnread ? INFO_BLUE : 'transparent',
            boxShadow: isUnread
              ? `0 0 0 4px ${withAlpha(INFO_BLUE, 0.18)}`
              : 'none',
          }}
        />
      </div>
      {/* Body */}
      <div
        style={{
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <h3
            style={{
              fontFamily: FONT_DISPLAY,
              fontWeight: isUnread ? 800 : 600,
              fontSize: 19,
              lineHeight: 1.15,
              letterSpacing: '-0.005em',
              color: isUnread ? TEXT_STRONG : TEXT_PRIMARY,
              margin: 0,
            }}
          >
            {notification.title}
          </h3>
          {notification.sentAt && (
            <span
              style={{
                fontFamily: FONT_BODY,
                fontVariantNumeric: 'tabular-nums',
                fontSize: 12,
                color: TEXT_QUIET,
                whiteSpace: 'nowrap',
              }}
            >
              {formatTimeAgo(notification.sentAt)}
            </span>
          )}
        </div>
        <p
          style={{
            fontFamily: FONT_BODY,
            fontSize: 14.5,
            lineHeight: 1.55,
            color: TEXT_SECONDARY,
            margin: 0,
            maxWidth: '70ch',
          }}
        >
          {notification.message}
        </p>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginTop: 4,
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              fontFamily: FONT_DISPLAY,
              fontWeight: 700,
              fontSize: 10,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              padding: '3px 8px',
              borderRadius: 4,
              background: withAlpha(stripe, 0.08),
              color: TYPE_BADGE_FG[category],
              border: `1px solid ${withAlpha(stripe, 0.35)}`,
            }}
          >
            {TYPE_LABEL[category]}
          </span>
        </div>
      </div>
      {/* Action */}
      {isUnread && notification.id != null && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            paddingTop: 14,
          }}
        >
          <span
            role="button"
            aria-label="Mark as read"
            title="Mark as read"
            tabIndex={0}
            onClick={(event) => {
              event.stopPropagation();
              if (notification.id != null) onMarkRead(notification.id);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.stopPropagation();
                if (notification.id != null) onMarkRead(notification.id);
              }
            }}
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: 'transparent',
              border: `1px solid ${BORDER}`,
              color: TEXT_SECONDARY,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 150ms, border-color 150ms, background 150ms',
            }}
          >
            <IconEye />
          </span>
        </div>
      )}
    </button>
  );
};

/* ─── Skeleton loading card ─── */

const SkeletonShimmerStyle = (
  <style>{`
    @keyframes ls-notif-shimmer {
      0% { background-position: -400px 0; }
      100% { background-position: 400px 0; }
    }
    .ls-notif-skel {
      background: linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.10) 50%, rgba(255,255,255,0.04) 100%);
      background-size: 800px 100%;
      animation: ls-notif-shimmer 1.4s linear infinite;
      border-radius: 6px;
    }
    @media (prefers-reduced-motion: reduce) {
      .ls-notif-skel { animation: none; background: rgba(255,255,255,0.06); }
    }
  `}</style>
);

const SkeletonCard: React.FC<{ titleWidth?: string }> = ({
  titleWidth = '60%',
}) => (
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: '12px minmax(0, 1fr) auto',
      alignItems: 'stretch',
      gap: 16,
      padding: '18px 20px 18px 0',
      background: BG_PANEL,
      border: `1px solid ${BORDER}`,
      borderRadius: 14,
    }}
  >
    <div style={{ padding: '22px 0 0 12px' }}>
      <div
        className="ls-notif-skel"
        style={{ width: 10, height: 10, borderRadius: '50%' }}
      />
    </div>
    <div style={{ paddingTop: 6 }}>
      <div
        className="ls-notif-skel"
        style={{ width: titleWidth, height: 18, marginBottom: 12 }}
      />
      <div
        className="ls-notif-skel"
        style={{ width: '92%', height: 12, marginBottom: 8 }}
      />
      <div
        className="ls-notif-skel"
        style={{ width: '64%', height: 12, marginBottom: 8 }}
      />
      <div
        className="ls-notif-skel"
        style={{ width: '40%', height: 10, marginTop: 6 }}
      />
    </div>
    <div style={{ paddingTop: 8 }}>
      <div
        className="ls-notif-skel"
        style={{ width: 44, height: 44, borderRadius: 12 }}
      />
    </div>
  </div>
);

/* ─── Page ─── */

const NotificationsPage: React.FC = () => {
  const [page, setPage] = useState(0);

  const { data, loading, error, refetch } = useGetNotificationHistoryQuery({
    variables: { limit: PAGE_SIZE, offset: page * PAGE_SIZE },
    fetchPolicy: 'cache-and-network',
  });
  const { data: countData } = useGetUnreadNotificationCountQuery();
  const [markAsRead] = useMarkNotificationAsReadMutation();
  const [markAllAsRead] = useMarkAllNotificationsAsReadMutation();

  useEffect(() => {
    if (error) {
      LOGGER.error('Failed to fetch notification history', error);
    }
  }, [error]);

  const notifications = useMemo(
    () => data?.getNotificationHistory ?? [],
    [data?.getNotificationHistory],
  );
  const unreadCount = countData?.getUnreadNotificationCount ?? 0;
  const hasNextPage = notifications.length === PAGE_SIZE;
  const hasPreviousPage = page > 0;
  const isError = error != null && notifications.length === 0;
  const isLoading = loading && notifications.length === 0;
  const isEmpty =
    !isLoading && !isError && notifications.length === 0 && page === 0;

  const handleMarkAsRead = useCallback(
    (notificationId: number) => {
      void markAsRead({
        variables: { notificationId },
        refetchQueries: [
          'GetNotificationHistory',
          'GetUnreadNotificationCount',
        ],
      });
    },
    [markAsRead],
  );

  const handleMarkAllAsRead = useCallback(() => {
    void markAllAsRead({
      refetchQueries: ['GetNotificationHistory', 'GetUnreadNotificationCount'],
    });
  }, [markAllAsRead]);

  /* Group notifications into day sections, preserving server order. */
  const dayGroups = useMemo(() => {
    const groups: { key: string; label: string; items: Notification[] }[] = [];
    for (const n of notifications) {
      if (!n.sentAt) {
        const last = groups[groups.length - 1];
        if (last && last.key === 'undated') last.items.push(n);
        else groups.push({ key: 'undated', label: 'Earlier', items: [n] });
        continue;
      }
      const key = dayKey(n.sentAt);
      const last = groups[groups.length - 1];
      if (last && last.key === key) {
        last.items.push(n);
      } else {
        groups.push({ key, label: daySeparatorLabel(n.sentAt), items: [n] });
      }
    }
    return groups;
  }, [notifications]);

  const headlineCopy = isError
    ? 'We’re having trouble reaching the wire. Your unread count is preserved.'
    : isLoading
      ? 'Pulling the latest dispatches from the wire…'
      : unreadCount > 0
        ? `You have ${unreadCount} unread dispatch${unreadCount === 1 ? '' : 'es'} from across your leagues. Newest first.`
        : 'You’re all caught up. The press box is quiet.';

  return (
    <div style={PAGE_BACKGROUND}>
      {SkeletonShimmerStyle}
      <PageMeta
        title="Notifications"
        description="View and manage your Legacy Sports notifications."
      />
      <main
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          padding: '40px 24px 96px',
        }}
      >
        {/* HEADER */}
        <header
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            paddingBottom: 28,
            borderBottom: `1px solid ${BORDER}`,
            marginBottom: 24,
          }}
        >
          <div style={eyebrow}>
            <span>Press Box</span>
            <span style={{ color: TEXT_QUIET }}>·</span>
            <span>Your dispatches</span>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              gap: 24,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <h1 style={pageTitle}>Notifications</h1>
              <p style={{ ...headMeta, marginTop: 14 }}>{headlineCopy}</p>
            </div>
            {unreadCount > 0 && !isLoading && !isError && (
              <button
                type="button"
                onClick={handleMarkAllAsRead}
                style={ghostButton}
              >
                <IconCheckDouble />
                Mark all as read
              </button>
            )}
          </div>
        </header>

        {/* STATE: ERROR */}
        {isError && (
          <section
            role="alert"
            style={{
              marginTop: 24,
              padding: '56px 32px',
              background: `radial-gradient(ellipse at 50% 0%, ${withAlpha(BRAND_SEAM_RED, 0.1)}, transparent 60%), ${BG_PANEL}`,
              border: `1px solid ${withAlpha(BRAND_SEAM_RED, 0.35)}`,
              borderRadius: 20,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              gap: 18,
            }}
          >
            <div
              aria-hidden="true"
              style={{
                width: 72,
                height: 72,
                borderRadius: 18,
                background: withAlpha(BRAND_SEAM_RED, 0.12),
                border: `1px solid ${withAlpha(BRAND_SEAM_RED, 0.4)}`,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: BRAND_SEAM_RED_LIGHT,
              }}
            >
              <IconAlert />
            </div>
            <h2
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: 800,
                fontSize: 28,
                color: TEXT_STRONG,
                margin: 0,
                letterSpacing: '-0.005em',
              }}
            >
              Unable to load your notifications
            </h2>
            <p
              style={{
                fontFamily: FONT_BODY,
                fontSize: 15,
                lineHeight: 1.55,
                color: TEXT_SECONDARY,
                margin: 0,
                maxWidth: '50ch',
              }}
            >
              The dispatch line is down. Your unread count is still safe — once
              we reconnect we’ll catch you up to the minute.
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: 700,
                fontSize: 13,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                padding: '12px 22px',
                borderRadius: 12,
                background: BRAND_NAVY,
                color: '#fff',
                border: `1px solid #2C4A7C`,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 4,
              }}
            >
              <IconRetry />
              Try again
            </button>
          </section>
        )}

        {/* STATE: LOADING */}
        {isLoading && (
          <section
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              marginTop: 4,
            }}
          >
            <SkeletonCard titleWidth="60%" />
            <SkeletonCard titleWidth="50%" />
            <SkeletonCard titleWidth="70%" />
            <SkeletonCard titleWidth="45%" />
            <SkeletonCard titleWidth="55%" />
          </section>
        )}

        {/* STATE: EMPTY */}
        {isEmpty && (
          <section
            style={{
              marginTop: 24,
              padding: '64px 32px',
              background: BG_PANEL,
              border: `1px solid ${BORDER}`,
              borderRadius: 20,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              gap: 18,
            }}
          >
            <div
              aria-hidden="true"
              style={{
                width: 96,
                height: 96,
                borderRadius: 24,
                background: `radial-gradient(circle at 50% 40%, ${withAlpha(BRAND_GOLD, 0.18)}, transparent 70%), ${BG_ELEVATED}`,
                border: `1px solid ${withAlpha(BRAND_GOLD, 0.25)}`,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: BRAND_GOLD_LIGHT,
              }}
            >
              <IconBell />
            </div>
            <h2
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: 800,
                fontSize: 32,
                letterSpacing: '-0.005em',
                color: TEXT_STRONG,
                margin: 0,
              }}
            >
              No notifications yet
            </h2>
            <p
              style={{
                fontFamily: FONT_BODY,
                fontSize: 16,
                lineHeight: 1.6,
                color: TEXT_SECONDARY,
                margin: 0,
                maxWidth: '48ch',
              }}
            >
              When a matchup starts, a trade hits your inbox, or your
              commissioner posts a ruling, you’ll see the dispatch here. We’ll
              keep the press box quiet until something happens.
            </p>
          </section>
        )}

        {/* STATE: POPULATED */}
        {!isLoading && !isError && notifications.length > 0 && (
          <section
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              marginTop: 4,
            }}
          >
            {dayGroups.map((group) => (
              <React.Fragment key={group.key}>
                <div style={daySepStyle}>
                  <span>{group.label}</span>
                  <span
                    aria-hidden="true"
                    style={{
                      flex: 1,
                      height: 1,
                      background: BORDER,
                    }}
                  />
                </div>
                {group.items.map((notification) => (
                  <NotificationCard
                    key={
                      notification.id ?? `${group.key}-${notification.title}`
                    }
                    notification={notification}
                    onMarkRead={handleMarkAsRead}
                  />
                ))}
              </React.Fragment>
            ))}

            {/* Pagination */}
            <nav
              aria-label="Pagination"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
                marginTop: 32,
                padding: '18px 6px 0',
                borderTop: `1px solid ${BORDER}`,
              }}
            >
              <div
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontWeight: 800,
                  fontSize: 14,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: TEXT_SECONDARY,
                }}
              >
                Page{' '}
                <span
                  style={{
                    fontVariantNumeric: 'tabular-nums',
                    color: TEXT_PRIMARY,
                    margin: '0 4px',
                  }}
                >
                  {page + 1}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  aria-label="Previous page"
                  disabled={!hasPreviousPage}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: 'transparent',
                    border: `1px solid ${BORDER_STRONG}`,
                    color: TEXT_PRIMARY,
                    cursor: hasPreviousPage ? 'pointer' : 'not-allowed',
                    opacity: hasPreviousPage ? 1 : 0.35,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'border-color 150ms, color 150ms',
                  }}
                >
                  <IconChevron direction="left" />
                </button>
                <button
                  type="button"
                  aria-label="Next page"
                  disabled={!hasNextPage}
                  onClick={() => setPage((p) => p + 1)}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: 'transparent',
                    border: `1px solid ${BORDER_STRONG}`,
                    color: TEXT_PRIMARY,
                    cursor: hasNextPage ? 'pointer' : 'not-allowed',
                    opacity: hasNextPage ? 1 : 0.35,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'border-color 150ms, color 150ms',
                  }}
                >
                  <IconChevron direction="right" />
                </button>
              </div>
            </nav>
          </section>
        )}
      </main>
    </div>
  );
};

export default NotificationsPage;
