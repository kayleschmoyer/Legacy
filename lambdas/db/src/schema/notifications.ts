import { createDatabaseService } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';
import { builder } from './builder';
import { AuthenticationError } from './graphql-errors';

// Create a single database service instance to reuse across all resolvers
const dbService = createDatabaseService(getDbOptions());

// Input types
const NotificationPreferenceInput = builder.inputType(
  'NotificationPreferenceInput',
  {
    fields: (t) => ({
      matchupStartedEnabled: t.boolean({ required: false }),
      matchupEndedEnabled: t.boolean({ required: false }),
      matchupCloseGameEnabled: t.boolean({ required: false }),
      matchupReminderEnabled: t.boolean({ required: false }),
      pushEnabled: t.boolean({ required: false }),
      emailEnabled: t.boolean({ required: false }),
      closeGameThreshold: t.int({ required: false }),
    }),
  },
);

const DeviceTokenInput = builder.inputType('DeviceTokenInput', {
  fields: (t) => ({
    deviceToken: t.string({ required: true }),
    platform: t.string({ required: true }),
  }),
});

// NotificationPreference type
const NotificationPreferenceRef = builder.objectRef<{
  id: number;
  userId: number;
  matchupStartedEnabled: boolean;
  matchupEndedEnabled: boolean;
  matchupCloseGameEnabled: boolean;
  matchupReminderEnabled: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
  closeGameThreshold: number;
  createdAt: Date;
  updatedAt: Date;
}>('NotificationPreference');

NotificationPreferenceRef.implement({
  fields: (t) => ({
    id: t.exposeInt('id'),
    userId: t.exposeInt('userId'),
    matchupStartedEnabled: t.exposeBoolean('matchupStartedEnabled'),
    matchupEndedEnabled: t.exposeBoolean('matchupEndedEnabled'),
    matchupCloseGameEnabled: t.exposeBoolean('matchupCloseGameEnabled'),
    matchupReminderEnabled: t.exposeBoolean('matchupReminderEnabled'),
    pushEnabled: t.exposeBoolean('pushEnabled'),
    emailEnabled: t.exposeBoolean('emailEnabled'),
    closeGameThreshold: t.exposeInt('closeGameThreshold'),
    createdAt: t.string({
      resolve: (parent) => parent.createdAt.toISOString(),
    }),
    updatedAt: t.string({
      resolve: (parent) => parent.updatedAt.toISOString(),
    }),
  }),
});

// DeviceToken type
const DeviceTokenRef = builder.objectRef<{
  id: number;
  userId: number;
  deviceToken: string;
  platform: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}>('DeviceToken');

DeviceTokenRef.implement({
  fields: (t) => ({
    id: t.exposeInt('id'),
    userId: t.exposeInt('userId'),
    deviceToken: t.exposeString('deviceToken'),
    platform: t.exposeString('platform'),
    isActive: t.exposeBoolean('isActive'),
    // Map isActive to enabled for frontend compatibility
    enabled: t.boolean({ resolve: (parent) => parent.isActive }),
    // endpointArn not in database yet, return null
    endpointArn: t.string({ nullable: true, resolve: () => null }),
    createdAt: t.string({
      resolve: (parent) => parent.createdAt.toISOString(),
    }),
    updatedAt: t.string({
      resolve: (parent) => parent.updatedAt.toISOString(),
    }),
  }),
});

// NotificationHistoryItem type
const NotificationHistoryItemRef = builder.objectRef<{
  id: number;
  userId: number;
  notificationType: string;
  title: string;
  body: string;
  data: unknown;
  isRead: boolean;
  sentAt: Date;
  readAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}>('NotificationHistoryItem');

NotificationHistoryItemRef.implement({
  fields: (t) => ({
    id: t.exposeInt('id'),
    userId: t.exposeInt('userId'),
    notificationType: t.exposeString('notificationType'),
    // Frontend-expected fields extracted from data JSON
    channel: t.string({ resolve: () => 'push' }), // Default channel
    matchupId: t.int({
      nullable: true,
      resolve: (parent) => {
        if (!parent.data || typeof parent.data !== 'object') return null;
        const data = parent.data as Record<string, unknown>;
        return typeof data.matchupId === 'number' ? data.matchupId : null;
      },
    }),
    leagueId: t.int({
      nullable: true,
      resolve: (parent) => {
        if (!parent.data || typeof parent.data !== 'object') return null;
        const data = parent.data as Record<string, unknown>;
        return typeof data.leagueId === 'number' ? data.leagueId : null;
      },
    }),
    title: t.exposeString('title'),
    message: t.string({ resolve: (parent) => parent.body }), // Map body to message
    body: t.exposeString('body'),
    metadata: t.string({
      nullable: true,
      resolve: (parent) => (parent.data ? JSON.stringify(parent.data) : null),
    }),
    data: t.string({
      nullable: true,
      resolve: (parent) => (parent.data ? JSON.stringify(parent.data) : null),
    }),
    read: t.boolean({ resolve: (parent) => parent.isRead }), // Map isRead to read
    isRead: t.exposeBoolean('isRead'),
    sentAt: t.string({
      resolve: (parent) => parent.sentAt.toISOString(),
    }),
    readAt: t.string({
      nullable: true,
      resolve: (parent) => (parent.readAt ? parent.readAt.toISOString() : null),
    }),
    createdAt: t.string({
      resolve: (parent) => parent.createdAt.toISOString(),
    }),
    updatedAt: t.string({
      resolve: (parent) => parent.updatedAt.toISOString(),
    }),
  }),
});

// Queries
builder.queryField('getUserNotificationPreferences', (t) =>
  t.field({
    type: NotificationPreferenceRef,
    nullable: true,
    resolve: async (parent, args, context) => {
      // Security: Derive userId from authenticated context (not from arguments)
      if (!context.user) {
        throw AuthenticationError();
      }
      const userId = context.user.id;

      const prefs =
        await dbService.notifications.getUserNotificationPreferences(userId);
      if (!prefs) return null;
      return {
        id: Number(prefs.id),
        userId: Number(prefs.userId),
        matchupStartedEnabled: prefs.matchupStartedEnabled,
        matchupEndedEnabled: prefs.matchupEndedEnabled,
        matchupCloseGameEnabled: prefs.matchupCloseGameEnabled,
        matchupReminderEnabled: prefs.matchupReminderEnabled,
        pushEnabled: prefs.pushEnabled,
        emailEnabled: prefs.emailEnabled,
        closeGameThreshold: prefs.closeGameThreshold,
        createdAt: prefs.createdAt,
        updatedAt: prefs.updatedAt,
      };
    },
  }),
);

builder.queryField('getNotificationHistory', (t) =>
  t.field({
    type: [NotificationHistoryItemRef],
    args: {
      limit: t.arg.int({ required: false }),
      offset: t.arg.int({ required: false }),
    },
    resolve: async (parent, { limit, offset }, context) => {
      // Security: Derive userId from authenticated context (not from arguments)
      if (!context.user) {
        throw AuthenticationError();
      }
      const userId = context.user.id;
      const history = await dbService.notifications.getNotificationHistory(
        userId,
        limit || 50,
        offset || 0,
      );
      return history.map((item) => ({
        id: Number(item.id),
        userId: Number(item.userId),
        notificationType: item.notificationType,
        title: item.title,
        body: item.body,
        data: item.data,
        isRead: item.isRead,
        sentAt: item.sentAt,
        readAt: item.readAt,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }));
    },
  }),
);

builder.queryField('getUnreadNotificationCount', (t) =>
  t.field({
    type: 'Int',
    resolve: async (parent, args, context) => {
      // Security: Derive userId from authenticated context (not from arguments)
      if (!context.user) {
        throw AuthenticationError();
      }
      const userId = context.user.id;

      return await dbService.notifications.getUnreadNotificationCount(userId);
    },
  }),
);

builder.queryField('getUserDeviceTokens', (t) =>
  t.field({
    type: [DeviceTokenRef],
    resolve: async (parent, args, context) => {
      // Security: Derive userId from authenticated context (not from arguments)
      if (!context.user) {
        throw AuthenticationError();
      }
      const userId = context.user.id;

      const tokens = await dbService.notifications.getUserDeviceTokens(userId);
      return tokens.map((token) => ({
        id: Number(token.id),
        userId: Number(token.userId),
        deviceToken: token.deviceToken,
        platform: token.platform,
        isActive: token.isActive,
        createdAt: token.createdAt,
        updatedAt: token.updatedAt,
      }));
    },
  }),
);

// Mutations
builder.mutationField('updateNotificationPreferences', (t) =>
  t.field({
    type: NotificationPreferenceRef,
    args: {
      input: t.arg({ type: NotificationPreferenceInput, required: true }),
    },
    resolve: async (parent, { input }, context) => {
      // Security: Derive userId from authenticated context (not from arguments)
      if (!context.user) {
        throw AuthenticationError();
      }
      const userId = context.user.id;
      // Filter out undefined values and cast null to undefined
      const cleanedUpdates = Object.fromEntries(
        Object.entries(input).filter(([, v]) => v !== undefined && v !== null),
      );
      const prefs = await dbService.notifications.updateNotificationPreferences(
        userId,
        cleanedUpdates,
      );
      return {
        id: Number(prefs.id),
        userId: Number(prefs.userId),
        matchupStartedEnabled: prefs.matchupStartedEnabled,
        matchupEndedEnabled: prefs.matchupEndedEnabled,
        matchupCloseGameEnabled: prefs.matchupCloseGameEnabled,
        matchupReminderEnabled: prefs.matchupReminderEnabled,
        pushEnabled: prefs.pushEnabled,
        emailEnabled: prefs.emailEnabled,
        closeGameThreshold: prefs.closeGameThreshold,
        createdAt: prefs.createdAt,
        updatedAt: prefs.updatedAt,
      };
    },
  }),
);

builder.mutationField('registerDeviceToken', (t) =>
  t.field({
    type: DeviceTokenRef,
    args: {
      input: t.arg({ type: DeviceTokenInput, required: true }),
    },
    resolve: async (parent, { input }, context) => {
      // Security: Derive userId from authenticated context (not from arguments)
      if (!context.user) {
        throw AuthenticationError();
      }
      const userId = context.user.id;
      const { deviceToken, platform } = input;
      const token = await dbService.notifications.registerDeviceToken(
        userId,
        deviceToken,
        platform,
      );
      return {
        id: Number(token.id),
        userId: Number(token.userId),
        deviceToken: token.deviceToken,
        platform: token.platform,
        isActive: token.isActive,
        createdAt: token.createdAt,
        updatedAt: token.updatedAt,
      };
    },
  }),
);

builder.mutationField('disableDeviceToken', (t) =>
  t.field({
    type: 'Boolean',
    args: {
      deviceToken: t.arg.string({ required: true }),
    },
    resolve: async (parent, { deviceToken }, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      await dbService.notifications.disableDeviceToken(
        context.user.id,
        deviceToken,
      );
      return true;
    },
  }),
);

builder.mutationField('markNotificationAsRead', (t) =>
  t.field({
    type: 'Boolean',
    args: {
      notificationId: t.arg.int({ required: true }),
    },
    resolve: async (parent, { notificationId }, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      await dbService.notifications.markNotificationAsRead(
        context.user.id,
        notificationId,
      );
      return true;
    },
  }),
);

builder.mutationField('markAllNotificationsAsRead', (t) =>
  t.field({
    type: 'Boolean',
    resolve: async (parent, args, context) => {
      // Security: Derive userId from authenticated context (not from arguments)
      if (!context.user) {
        throw AuthenticationError();
      }
      const userId = context.user.id;

      await dbService.notifications.markAllNotificationsAsRead(userId);
      return true;
    },
  }),
);
