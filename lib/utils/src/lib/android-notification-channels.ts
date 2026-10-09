/**
 * Android notification channels (LS-7650).
 *
 * Single source of truth shared by the mobile app (which registers the
 * channels via `setNotificationChannelAsync`) and the notifications lambda
 * (which sets `channelId` on each Expo push message), so the two cannot drift.
 *
 * Importance is a plain string key so this shared lib has no expo dependency;
 * the app maps it onto `AndroidImportance`.
 *
 * Ids are persisted in users' OS-level settings once released — never rename or
 * remove one. The 'default' id is the legacy channel and the fallback.
 */

export type AndroidNotificationChannelId =
  | 'default'
  | 'drafts'
  | 'league-activity'
  | 'live-scoring'
  | 'chat';

export type AndroidChannelImportanceKey = 'MAX' | 'HIGH' | 'DEFAULT';

export interface AndroidNotificationChannelDefinition {
  id: AndroidNotificationChannelId;
  name: string;
  importance: AndroidChannelImportanceKey;
}

export const ANDROID_NOTIFICATION_CHANNELS: readonly AndroidNotificationChannelDefinition[] =
  [
    { id: 'default', name: 'General', importance: 'MAX' },
    { id: 'drafts', name: 'Drafts', importance: 'MAX' },
    { id: 'league-activity', name: 'League activity', importance: 'HIGH' },
    { id: 'live-scoring', name: 'Live scoring', importance: 'HIGH' },
    { id: 'chat', name: 'Chat', importance: 'HIGH' },
  ];

/** Normalized (upper-case, separators removed) push type -> channel id. */
const CHANNEL_BY_NORMALIZED_TYPE: Readonly<
  Record<string, AndroidNotificationChannelId>
> = {
  DRAFTSTARTED: 'drafts',
  DRAFTONTHECLOCK: 'drafts',
  DRAFTINVITE: 'drafts',
  DRAFTCOMPLETED: 'drafts',
  TRADEOFFER: 'league-activity',
  LINEUPMODIFIEDBYADMIN: 'league-activity',
  LEAGUEMEMBERJOINED: 'league-activity',
  TDALERT: 'live-scoring',
  MATCHUPCLOSEGAME: 'live-scoring',
  LEAGUECHATMENTION: 'chat',
};

/**
 * Resolves the Android channel for a push `notificationType`. Matching ignores
 * case and `_`/`-` separators, because producers emit both `TRADE_OFFER` and
 * `draft_completed` styles. Unknown types fall back to 'default'.
 */
export function getAndroidChannelId(
  notificationType: string,
): AndroidNotificationChannelId {
  const normalized = notificationType.toUpperCase().replace(/[_-]/g, '');
  return CHANNEL_BY_NORMALIZED_TYPE[normalized] ?? 'default';
}
