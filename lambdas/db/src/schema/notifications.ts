import {
  disableDeviceToken,
  getUnreadNotificationCount,
  getUserDeviceTokens,
  getUserNotificationHistory,
  getUserNotificationPreferences,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  registerDeviceToken,
  runWithPublicClient,
  updateNotificationPreferences,
} from '@legacy-sports/db-client';
import type {
  DeviceTokenInput as DeviceTokenInputType,
  NotificationPreferenceInput as NotificationPreferenceInputType,
} from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';
import { builder } from './builder';

// Enums
const NotificationType = builder.enumType('NotificationType', {
  values: [
    'matchup_started',
    'matchup_ended',
    'matchup_close_game',
    'matchup_reminder',
  ] as const,
});

const NotificationChannel = builder.enumType('NotificationChannel', {
  values: ['in_app', 'push', 'email'] as const,
});

// NotificationPreference Type
const NotificationPreference = builder.objectRef<{
  id: number;
  userId: number;
  matchupStartedEnabled: boolean;
  matchupEndedEnabled: boolean;
  matchupCloseGameEnabled: boolean;
  matchupReminderEnabled: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
  closeGameThreshold: string | null;
  createdAt: string;
  updatedAt: string;
}>('NotificationPreference');

builder.objectType(NotificationPreference, {
  description: 'User notification preferences',
  fields: (t) => ({
    id: t.exposeID('id'),
    userId: t.exposeInt('userId'),
    matchupStartedEnabled: t.exposeBoolean('matchupStartedEnabled'),
    matchupEndedEnabled: t.exposeBoolean('matchupEndedEnabled'),
    matchupCloseGameEnabled: t.exposeBoolean('matchupCloseGameEnabled'),
    matchupReminderEnabled: t.exposeBoolean('matchupReminderEnabled'),
    pushEnabled: t.exposeBoolean('pushEnabled'),
    emailEnabled: t.exposeBoolean('emailEnabled'),
    closeGameThreshold: t.float({
      nullable: true,
      resolve: (pref) =>
        pref.closeGameThreshold ? parseFloat(pref.closeGameThreshold) : null,
    }),
    createdAt: t.exposeString('createdAt'),
    updatedAt: t.exposeString('updatedAt'),
  }),
});

// DeviceToken Type
const DeviceToken = builder.objectRef<{
  id: number;
  userId: number;
  deviceToken: string;
  platform: string;
  endpointArn: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}>('DeviceToken');

builder.objectType(DeviceToken, {
  description: 'Mobile device token for push notifications',
  fields: (t) => ({
    id: t.exposeID('id'),
    userId: t.exposeInt('userId'),
    deviceToken: t.exposeString('deviceToken'),
    platform: t.exposeString('platform'),
    endpointArn: t.exposeString('endpointArn', { nullable: true }),
    enabled: t.exposeBoolean('enabled'),
    createdAt: t.exposeString('createdAt'),
    updatedAt: t.exposeString('updatedAt'),
  }),
});

// NotificationHistoryItem Type
const NotificationHistoryItem = builder.objectRef<{
  id: number;
  userId: number;
  notificationType:
    | 'matchup_started'
    | 'matchup_ended'
    | 'matchup_close_game'
    | 'matchup_reminder';
  channel: 'in_app' | 'push' | 'email';
  matchupId: number | null;
  leagueId: number | null;
  title: string;
  message: string;
  metadata: Record<string, unknown> | null;
  read: boolean;
  sentAt: string;
  readAt: string | null;
  createdAt: string;
}>('NotificationHistoryItem');

builder.objectType(NotificationHistoryItem, {
  description: 'Historical record of a sent notification',
  fields: (t) => ({
    id: t.exposeID('id'),
    userId: t.exposeInt('userId'),
    notificationType: t.field({
      type: NotificationType,
      resolve: (item) => item.notificationType,
    }),
    channel: t.field({
      type: NotificationChannel,
      resolve: (item) => item.channel,
    }),
    matchupId: t.exposeInt('matchupId', { nullable: true }),
    leagueId: t.exposeInt('leagueId', { nullable: true }),
    title: t.exposeString('title'),
    message: t.exposeString('message'),
    metadata: t.string({
      nullable: true,
      resolve: (item) => (item.metadata ? JSON.stringify(item.metadata) : null),
    }),
    read: t.exposeBoolean('read'),
    sentAt: t.exposeString('sentAt'),
    readAt: t.exposeString('readAt', { nullable: true }),
    createdAt: t.exposeString('createdAt'),
  }),
});

// Input Types
const NotificationPreferenceInput = builder.inputType(
  'NotificationPreferenceInput',
  {
    fields: (t) => ({
      matchupStartedEnabled: t.boolean(),
      matchupEndedEnabled: t.boolean(),
      matchupCloseGameEnabled: t.boolean(),
      matchupReminderEnabled: t.boolean(),
      pushEnabled: t.boolean(),
      emailEnabled: t.boolean(),
      closeGameThreshold: t.float(),
    }),
  },
);

const DeviceTokenInput = builder.inputType('DeviceTokenInput', {
  fields: (t) => ({
    userId: t.int({ required: true }),
    deviceToken: t.string({ required: true }),
    platform: t.string({ required: true }),
    endpointArn: t.string(),
  }),
});

// Queries
builder.queryField('getUserNotificationPreferences', (t) =>
  t.field({
    type: NotificationPreference,
    args: {
      userId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args) => {
      return await runWithPublicClient(getDbOptions(), async (db) => {
        return await getUserNotificationPreferences(db, args.userId);
      });
    },
  }),
);

builder.queryField('getNotificationHistory', (t) =>
  t.field({
    type: [NotificationHistoryItem],
    args: {
      userId: t.arg.int({ required: true }),
      limit: t.arg.int({ defaultValue: 50 }),
    },
    resolve: async (_parent, args) => {
      return await runWithPublicClient(getDbOptions(), async (db) => {
        return await getUserNotificationHistory(
          db,
          args.userId,
          args.limit ?? undefined,
        );
      });
    },
  }),
);

builder.queryField('getUnreadNotificationCount', (t) =>
  t.int({
    args: {
      userId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args) => {
      return await runWithPublicClient(getDbOptions(), async (db) => {
        return await getUnreadNotificationCount(db, args.userId);
      });
    },
  }),
);

builder.queryField('getUserDeviceTokens', (t) =>
  t.field({
    type: [DeviceToken],
    args: {
      userId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args) => {
      return await runWithPublicClient(getDbOptions(), async (db) => {
        return await getUserDeviceTokens(db, args.userId);
      });
    },
  }),
);

// Mutations
builder.mutationField('updateNotificationPreferences', (t) =>
  t.field({
    type: NotificationPreference,
    args: {
      userId: t.arg.int({ required: true }),
      input: t.arg({ type: NotificationPreferenceInput, required: true }),
    },
    resolve: async (_parent, args) => {
      return await runWithPublicClient(getDbOptions(), async (db) => {
        const input: NotificationPreferenceInputType = {
          matchupStartedEnabled: args.input.matchupStartedEnabled ?? undefined,
          matchupEndedEnabled: args.input.matchupEndedEnabled ?? undefined,
          matchupCloseGameEnabled:
            args.input.matchupCloseGameEnabled ?? undefined,
          matchupReminderEnabled:
            args.input.matchupReminderEnabled ?? undefined,
          pushEnabled: args.input.pushEnabled ?? undefined,
          emailEnabled: args.input.emailEnabled ?? undefined,
          closeGameThreshold: args.input.closeGameThreshold ?? undefined,
        };
        return await updateNotificationPreferences(db, args.userId, input);
      });
    },
  }),
);

builder.mutationField('registerDeviceToken', (t) =>
  t.field({
    type: DeviceToken,
    args: {
      input: t.arg({ type: DeviceTokenInput, required: true }),
    },
    resolve: async (_parent, args) => {
      return await runWithPublicClient(getDbOptions(), async (db) => {
        const input: DeviceTokenInputType = {
          userId: args.input.userId,
          deviceToken: args.input.deviceToken,
          platform: args.input.platform as 'ios' | 'android' | 'expo',
          endpointArn: args.input.endpointArn ?? undefined,
        };
        return await registerDeviceToken(db, input);
      });
    },
  }),
);

builder.mutationField('disableDeviceToken', (t) =>
  t.boolean({
    args: {
      deviceToken: t.arg.string({ required: true }),
    },
    resolve: async (_parent, args) => {
      await runWithPublicClient(getDbOptions(), async (db) => {
        await disableDeviceToken(db, args.deviceToken);
      });
      return true;
    },
  }),
);

builder.mutationField('markNotificationAsRead', (t) =>
  t.boolean({
    args: {
      notificationId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args) => {
      await runWithPublicClient(getDbOptions(), async (db) => {
        await markNotificationAsRead(db, args.notificationId);
      });
      return true;
    },
  }),
);

builder.mutationField('markAllNotificationsAsRead', (t) =>
  t.boolean({
    args: {
      userId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args) => {
      await runWithPublicClient(getDbOptions(), async (db) => {
        await markAllNotificationsAsRead(db, args.userId);
      });
      return true;
    },
  }),
);
