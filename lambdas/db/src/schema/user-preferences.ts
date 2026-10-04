import { createDatabaseService } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils/node';
import { builder } from './builder';
import { AuthenticationError } from './graphql-errors';

// Create a single database service instance to reuse across all resolvers
const dbService = createDatabaseService(getDbOptions());

// Input type
const UserPreferenceInput = builder.inputType('UserPreferenceInput', {
  fields: (t) => ({
    statsFormat: t.string({ required: false }),
    audioEnabled: t.boolean({ required: false }),
    // Set-once: `true` stamps onboarding complete; an existing timestamp is
    // never cleared or overwritten, and `false`/omitted is a no-op (LS-10378).
    markOnboardingComplete: t.boolean({ required: false }),
  }),
});

// UserPreference type
const UserPreferenceRef = builder.objectRef<{
  id: number;
  userId: number;
  statsFormat: string;
  audioEnabled: boolean;
  onboardingCompletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}>('UserPreference');

UserPreferenceRef.implement({
  fields: (t) => ({
    id: t.exposeInt('id'),
    userId: t.exposeInt('userId'),
    statsFormat: t.exposeString('statsFormat'),
    audioEnabled: t.exposeBoolean('audioEnabled'),
    onboardingCompletedAt: t.string({
      nullable: true,
      resolve: (parent) => parent.onboardingCompletedAt?.toISOString() ?? null,
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
builder.queryField('getUserPreferences', (t) =>
  t.field({
    type: UserPreferenceRef,
    nullable: true,
    resolve: async (parent, args, context) => {
      // Security: Derive userId from authenticated context (not from arguments)
      if (!context.user) {
        throw AuthenticationError();
      }
      const userId = context.user.id;

      const prefs = await dbService.userPreferences.getUserPreferences(userId);
      if (!prefs) return null;
      return {
        id: Number(prefs.id),
        userId: Number(prefs.userId),
        statsFormat: prefs.statsFormat,
        audioEnabled: prefs.audioEnabled,
        onboardingCompletedAt: prefs.onboardingCompletedAt,
        createdAt: prefs.createdAt,
        updatedAt: prefs.updatedAt,
      };
    },
  }),
);

// Mutations
builder.mutationField('updateUserPreferences', (t) =>
  t.field({
    type: UserPreferenceRef,
    args: {
      input: t.arg({ type: UserPreferenceInput, required: true }),
    },
    resolve: async (parent, { input }, context) => {
      // Security: Derive userId from authenticated context (not from arguments)
      if (!context.user) {
        throw AuthenticationError();
      }
      const userId = context.user.id;

      // The service validates stats-format values; invalid/unknown values are
      // dropped rather than persisted. `audioEnabled` is nullable in the input
      // so an unrelated preference write doesn't reset it — only a genuine
      // boolean is forwarded (LS-10111).
      const prefs = await dbService.userPreferences.updateUserPreferences(
        userId,
        {
          statsFormat:
            input.statsFormat === 'standard' || input.statsFormat === 'expanded'
              ? input.statsFormat
              : undefined,
          audioEnabled:
            typeof input.audioEnabled === 'boolean'
              ? input.audioEnabled
              : undefined,
          markOnboardingComplete:
            input.markOnboardingComplete === true ? true : undefined,
        },
      );
      return {
        id: Number(prefs.id),
        userId: Number(prefs.userId),
        statsFormat: prefs.statsFormat,
        audioEnabled: prefs.audioEnabled,
        onboardingCompletedAt: prefs.onboardingCompletedAt,
        createdAt: prefs.createdAt,
        updatedAt: prefs.updatedAt,
      };
    },
  }),
);
