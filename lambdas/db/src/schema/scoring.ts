import { and, eq } from 'drizzle-orm';
import {
  createDatabaseService,
  PublicDb,
  PublicSchema,
} from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { getDbOptions } from '@legacy-sports/utils/node';
import type {
  LeagueScoringProfileEntry,
  ScoringStatDefinition,
  ScoringStatGroup,
} from '@legacy-sports/db-client';
import { builder } from './builder';
import { AuthenticationError, ForbiddenError } from './graphql-errors';

const dbService = createDatabaseService(getDbOptions());

const SCORING_GROUPS: ScoringStatGroup[] = ['batting', 'pitching', 'fielding'];

const ScoringStatGroupEnum = builder.enumType('ScoringStatGroup', {
  description: 'Grouping for fantasy scoring statistics',
  values: {
    batting: { value: 'batting' },
    pitching: { value: 'pitching' },
    fielding: { value: 'fielding' },
  },
});

const UpdateLeagueScoringMultiplierInput = builder.inputType(
  'UpdateLeagueScoringMultiplierInput',
  {
    fields: (t) => ({
      statDefinitionId: t.int({ required: true }),
      multiplier: t.float({ required: false }),
      isEnabled: t.boolean({ required: false }),
    }),
  },
);

interface ScoringConfigEntryWithDefinition extends LeagueScoringProfileEntry {
  definition: ScoringStatDefinition | null;
  numericMultiplier: number | null;
}

interface ScoringRule {
  definition: ScoringStatDefinition;
  multiplier: number;
  defaultMultiplier: number;
  isOverride: boolean;
  isEnabled: boolean;
}

interface ScoringMultiplierEntry {
  statKey: string;
  sourceColumn: string;
  multiplier: number;
}

interface ScoringRuleGroup {
  group: ScoringStatGroup;
  values: ScoringMultiplierEntry[];
}

interface ScoringConfigGraph {
  profileId: number | null;
  leagueId: number | null;
  profileName: string | null;
  definitions: ScoringStatDefinition[];
  entries: ScoringConfigEntryWithDefinition[];
  stats: ScoringRule[];
  multiplierGroups: ScoringRuleGroup[];
}

function parseNumeric(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
}

function buildMultiplierGroups(stats: ScoringRule[]): ScoringRuleGroup[] {
  return SCORING_GROUPS.map((group) => ({
    group,
    values: stats
      .filter((stat) => stat.definition.statGroup === group)
      .map((stat) => ({
        statKey: stat.definition.statKey,
        sourceColumn: stat.definition.sourceColumn,
        multiplier: stat.multiplier,
      })),
  }));
}

function attachDefinitionsToEntries(
  definitions: ScoringStatDefinition[],
  entries: LeagueScoringProfileEntry[],
): ScoringConfigEntryWithDefinition[] {
  const definitionById = new Map(definitions.map((def) => [def.id, def]));

  return entries.map((entry) => {
    const definition = definitionById.get(entry.statDefinitionId) ?? null;
    return {
      ...entry,
      definition,
      numericMultiplier: parseNumeric(entry.multiplier),
    };
  });
}

function buildStatValues(
  definitions: ScoringStatDefinition[],
  entries: ScoringConfigEntryWithDefinition[],
): ScoringRule[] {
  const entryByDefinitionId = new Map(
    entries.map((entry) => [entry.statDefinitionId, entry]),
  );

  return definitions.map((definition) => {
    const defaultMultiplier = parseNumeric(definition.defaultMultiplier) ?? 0;
    const entry = entryByDefinitionId.get(definition.id);

    const isEnabled = entry ? entry.isEnabled !== false : true;
    const overriddenMultiplier =
      entry && entry.isEnabled !== false ? entry.numericMultiplier : null;

    const multiplier =
      overriddenMultiplier !== null ? overriddenMultiplier : defaultMultiplier;

    return {
      definition,
      multiplier,
      defaultMultiplier,
      isOverride:
        overriddenMultiplier !== null &&
        overriddenMultiplier !== defaultMultiplier,
      isEnabled,
    };
  });
}

async function ensureLeagueAccess(
  db: PublicDb,
  leagueId: number,
  userId: number,
): Promise<void> {
  const membership = await db
    .select({ leagueId: PublicSchema.leagueMembers.leagueId })
    .from(PublicSchema.leagueMembers)
    .where(
      and(
        eq(PublicSchema.leagueMembers.leagueId, leagueId),
        eq(PublicSchema.leagueMembers.userId, userId),
      ),
    )
    .limit(1);

  if (membership.length === 0) {
    throw ForbiddenError('Access denied: You are not a member of this league');
  }
}

async function ensureLeagueCommissionerAccess(
  db: PublicDb,
  leagueId: number,
  userId: number,
): Promise<void> {
  await ensureLeagueAccess(db, leagueId, userId);

  const membership = await db
    .select({
      permissionLevel: PublicSchema.leagueMembers.permissionLevel,
    })
    .from(PublicSchema.leagueMembers)
    .where(
      and(
        eq(PublicSchema.leagueMembers.leagueId, leagueId),
        eq(PublicSchema.leagueMembers.userId, userId),
      ),
    )
    .limit(1);

  if (
    membership[0]?.permissionLevel !== 'general_manager' &&
    membership[0]?.permissionLevel !== 'assistant_manager' &&
    membership[0]?.permissionLevel !== 'commissioner'
  ) {
    throw ForbiddenError(
      'Commissioner or General Manager role required to update scoring profile',
    );
  }
}

async function loadLeagueScoringConfig(
  leagueId: number,
): Promise<ScoringConfigGraph> {
  const details = await dbService.scoring.getActiveProfileDetails(leagueId);
  const entriesWithDefinitions = attachDefinitionsToEntries(
    details.definitions,
    details.entries,
  );
  const stats = buildStatValues(details.definitions, entriesWithDefinitions);

  return {
    profileId: details.profileId,
    leagueId: details.leagueId,
    profileName: details.profileName,
    definitions: details.definitions,
    entries: entriesWithDefinitions,
    stats,
    multiplierGroups: buildMultiplierGroups(stats),
  };
}

async function loadDefaultScoringConfig(): Promise<ScoringConfigGraph> {
  const definitions = await dbService.scoring.getScoringDefinitions();
  const multipliers = await dbService.scoring.getDefaultMultipliers();

  const stats = definitions.map((definition) => {
    const defaultMultiplier = parseNumeric(definition.defaultMultiplier) ?? 0;
    const groupEntries = multipliers[definition.statGroup];
    const override = groupEntries
      ? parseNumeric(groupEntries[definition.sourceColumn])
      : null;

    const multiplier = override ?? defaultMultiplier;

    return {
      definition,
      multiplier,
      defaultMultiplier,
      isOverride: override !== null && override !== defaultMultiplier,
      isEnabled: true,
    } satisfies ScoringRule;
  });

  return {
    profileId: null,
    leagueId: null,
    profileName: 'Default',
    definitions,
    entries: [],
    stats,
    multiplierGroups: buildMultiplierGroups(stats),
  };
}

const ScoringStatDefinitionRef = builder.objectRef<ScoringStatDefinition>(
  'ScoringStatDefinition',
);

ScoringStatDefinitionRef.implement({
  fields: (t) => ({
    id: t.exposeInt('id'),
    statKey: t.exposeString('statKey'),
    statGroup: t.field({
      type: ScoringStatGroupEnum,
      resolve: (definition) => definition.statGroup,
    }),
    sourceTable: t.exposeString('sourceTable'),
    sourceColumn: t.exposeString('sourceColumn'),
    displayName: t.exposeString('displayName'),
    description: t.string({
      nullable: true,
      resolve: (definition) => definition.description ?? null,
    }),
    defaultMultiplier: t.float({
      resolve: (definition) => parseNumeric(definition.defaultMultiplier) ?? 0,
    }),
    minMultiplier: t.float({
      resolve: (definition) => parseNumeric(definition.minMultiplier) ?? 0,
    }),
    maxMultiplier: t.float({
      resolve: (definition) => parseNumeric(definition.maxMultiplier) ?? 0,
    }),
    stepSize: t.float({
      resolve: (definition) => parseNumeric(definition.stepSize) ?? 0.5,
    }),
    isRequired: t.exposeBoolean('isRequired'),
    enforcePositive: t.exposeBoolean('enforcePositive'),
    enforceNegative: t.exposeBoolean('enforceNegative'),
    createdAt: t.exposeString('createdAt'),
    updatedAt: t.exposeString('updatedAt'),
  }),
});

const ScoringMultiplierEntryRef = builder.objectRef<ScoringMultiplierEntry>(
  'ScoringMultiplierEntry',
);

ScoringMultiplierEntryRef.implement({
  fields: (t) => ({
    statKey: t.exposeString('statKey'),
    sourceColumn: t.exposeString('sourceColumn'),
    multiplier: t.float({
      resolve: (entry) => entry.multiplier,
    }),
  }),
});

const ScoringRuleGroupRef =
  builder.objectRef<ScoringRuleGroup>('ScoringRuleGroup');

ScoringRuleGroupRef.implement({
  fields: (t) => ({
    group: t.field({
      type: ScoringStatGroupEnum,
      resolve: (group) => group.group,
    }),
    values: t.field({
      type: [ScoringMultiplierEntryRef],
      resolve: (group) => group.values,
    }),
  }),
});

const ScoringRuleRef = builder.objectRef<ScoringRule>('ScoringRule');

ScoringRuleRef.implement({
  fields: (t) => ({
    definition: t.field({
      type: ScoringStatDefinitionRef,
      resolve: (value) => value.definition,
    }),
    multiplier: t.float({
      resolve: (value) => value.multiplier,
    }),
    defaultMultiplier: t.float({
      resolve: (value) => value.defaultMultiplier,
    }),
    isOverride: t.boolean({
      resolve: (value) => value.isOverride,
    }),
    isEnabled: t.boolean({
      resolve: (value) => value.isEnabled,
    }),
  }),
});

const ScoringConfigEntryRef =
  builder.objectRef<ScoringConfigEntryWithDefinition>('ScoringConfigEntry');

ScoringConfigEntryRef.implement({
  fields: (t) => ({
    id: t.exposeInt('id'),
    profileId: t.exposeInt('profileId'),
    statDefinitionId: t.exposeInt('statDefinitionId'),
    multiplier: t.float({
      resolve: (entry) => entry.numericMultiplier ?? 0,
    }),
    isEnabled: t.exposeBoolean('isEnabled'),
    definition: t.field({
      type: ScoringStatDefinitionRef,
      nullable: true,
      resolve: (entry) => entry.definition,
    }),
    createdAt: t.exposeString('createdAt'),
    updatedAt: t.exposeString('updatedAt'),
  }),
});

const ScoringConfigRef = builder.objectRef<ScoringConfigGraph>('ScoringConfig');

ScoringConfigRef.implement({
  fields: (t) => ({
    profileId: t.int({
      nullable: true,
      resolve: (profile) => profile.profileId,
    }),
    leagueId: t.int({
      nullable: true,
      resolve: (profile) => profile.leagueId,
    }),
    profileName: t.string({
      nullable: true,
      resolve: (profile) => profile.profileName,
    }),
    definitions: t.field({
      type: [ScoringStatDefinitionRef],
      resolve: (profile) => profile.definitions,
    }),
    entries: t.field({
      type: [ScoringConfigEntryRef],
      resolve: (profile) => profile.entries,
    }),
    stats: t.field({
      type: [ScoringRuleRef],
      resolve: (profile) => profile.stats,
    }),
    multiplierGroups: t.field({
      type: [ScoringRuleGroupRef],
      resolve: (profile) => profile.multiplierGroups,
    }),
  }),
});

builder.queryField('scoringDefinitions', (t) =>
  t.field({
    type: [ScoringStatDefinitionRef],
    resolve: () => dbService.scoring.getScoringDefinitions(),
  }),
);

builder.queryField('defaultScoringProfile', (t) =>
  t.field({
    type: ScoringConfigRef,
    resolve: () => loadDefaultScoringConfig(),
  }),
);

builder.queryField('leagueScoringProfile', (t) =>
  t.field({
    type: ScoringConfigRef,
    args: {
      leagueId: t.arg.int({ required: true }),
    },
    resolve: async (_, args, context) => {
      if (!context.user) {
        throw AuthenticationError(
          'Authentication required to fetch scoring profile',
        );
      }

      await ensureLeagueAccess(context.db, args.leagueId, context.user.id);
      return loadLeagueScoringConfig(args.leagueId);
    },
  }),
);

builder.mutationField('updateLeagueScoringProfile', (t) =>
  t.field({
    type: ScoringConfigRef,
    args: {
      leagueId: t.arg.int({ required: true }),
      updates: t.arg({
        type: [UpdateLeagueScoringMultiplierInput],
        required: true,
      }),
    },
    resolve: async (_, args, context) => {
      if (!context.user) {
        throw AuthenticationError(
          'Authentication required to update scoring profile',
        );
      }

      const updates = (args.updates ?? []).filter(
        (update): update is NonNullable<typeof update> => update !== null,
      );

      if (updates.length === 0) {
        throw new Error('At least one scoring update is required');
      }

      if (!context.user.isAdmin) {
        await ensureLeagueCommissionerAccess(
          context.db,
          args.leagueId,
          context.user.id,
        );
      }

      for (const update of updates) {
        const hasMultiplier = typeof update.multiplier === 'number';
        const hasEnabledFlag = typeof update.isEnabled === 'boolean';

        if (!hasMultiplier && !hasEnabledFlag) {
          throw new Error(
            'Each scoring update must include a multiplier or an isEnabled flag',
          );
        }

        if (hasMultiplier && !Number.isFinite(update.multiplier)) {
          throw new Error('Multiplier values must be finite numbers');
        }
      }

      // Fetch the current config BEFORE updating so we can describe what changed
      const previousConfig = await loadLeagueScoringConfig(args.leagueId);
      const previousStatsByDefId = new Map(
        previousConfig.stats.map((s) => [s.definition.id, s]),
      );

      await dbService.scoring.updateActiveProfile(
        args.leagueId,
        updates.map((update) => ({
          statDefinitionId: update.statDefinitionId,
          multiplier:
            typeof update.multiplier === 'number'
              ? update.multiplier
              : undefined,
          isEnabled:
            typeof update.isEnabled === 'boolean'
              ? update.isEnabled
              : undefined,
        })),
        context.user.id,
      );

      const config = await loadLeagueScoringConfig(args.leagueId);

      // Build a detailed change summary for the chat message
      const userId = context.user.id;
      const username = context.user.username ?? `user_${userId}`;

      const changeDescriptions: string[] = [];
      for (const update of updates) {
        const prevStat = previousStatsByDefId.get(update.statDefinitionId);
        if (!prevStat) continue;

        const statName = prevStat.definition.displayName;
        const prevMultiplier = prevStat.multiplier;

        if (typeof update.isEnabled === 'boolean' && !update.isEnabled) {
          changeDescriptions.push(`disabled ${statName}`);
        } else if (typeof update.multiplier === 'number') {
          changeDescriptions.push(
            `${statName}: ${prevMultiplier}x → ${update.multiplier}x`,
          );
        }
      }

      const changeSummary =
        changeDescriptions.length > 0
          ? changeDescriptions.length <= 5
            ? changeDescriptions.join(', ')
            : `${changeDescriptions.slice(0, 5).join(', ')} and ${changeDescriptions.length - 5} more`
          : 'scoring multipliers';

      const notificationText = `⚙️ ${username} updated scoring settings: ${changeSummary}`;

      const [chatMsg] = await context.db
        .insert(PublicSchema.leagueMessages)
        .values({
          leagueId: args.leagueId,
          userId,
          messageText: notificationText,
        })
        .returning();

      const notificationService = context.notificationService;
      if (notificationService) {
        notificationService
          .notifyLeagueChatMessage(args.leagueId, {
            leagueId: args.leagueId,
            messageId: chatMsg.id,
            senderId: userId,
            senderUsername: username,
            messageText: notificationText,
            timestamp: chatMsg.timestamp ?? new Date().toISOString(),
          })
          .catch((err: unknown) => {
            LOGGER.warn(
              'Failed to send league chat WS notification for scoring settings update',
              { err },
            );
          });
      }

      return config;
    },
  }),
);

export {
  ScoringConfigRef,
  ScoringRuleRef,
  ScoringRuleGroupRef,
  ScoringConfigEntryRef,
  loadLeagueScoringConfig,
  ensureLeagueAccess,
};
