/**
 * League Dues — GraphQL types, queries, and mutations.
 *
 * Commissioners can enable dues for a league, set an amount, and configure
 * optional reminders.  They can also mark individual members as paid/unpaid.
 * All league members can view who has and hasn't paid.
 */
import { LOGGER } from '@legacy-sports/logging';
import { PublicSchema } from '@legacy-sports/db-client';
import { and, eq, sql } from 'drizzle-orm';
import { builder, type Context } from './builder';
import {
  AuthenticationError,
  ForbiddenError,
  UserInputError,
} from './graphql-errors';
import {
  verifyCommissionerAccess,
  verifyLeagueMembership,
} from './authorization';
import { assertAuthorized } from './matchups/system-auth';
import { isValidDiscordWebhookUrl } from '../services/discord-league';

// ─── GraphQL object types ────────────────────────────────────────────────────

interface DuesSettingsShape {
  id: number;
  leagueId: number;
  enabled: boolean;
  amountCents: number;
  reminderEnabled: boolean;
  reminderDayOfWeek: number | null;
  createdAt: Date;
  updatedAt: Date;
}

const DuesSettingsRef =
  builder.objectRef<DuesSettingsShape>('LeagueDuesSettings');

DuesSettingsRef.implement({
  description: 'Per-league dues configuration set by the commissioner',
  fields: (t) => ({
    id: t.exposeInt('id'),
    leagueId: t.exposeInt('leagueId'),
    enabled: t.exposeBoolean('enabled'),
    amountCents: t.exposeInt('amountCents', {
      description: 'Dues amount in cents (e.g. 5000 = $50.00)',
    }),
    reminderEnabled: t.exposeBoolean('reminderEnabled'),
    reminderDayOfWeek: t.exposeInt('reminderDayOfWeek', {
      nullable: true,
      description: 'Day of week for reminders (0=Sunday, 6=Saturday)',
    }),
    createdAt: t.string({ resolve: (s) => s.createdAt.toISOString() }),
    updatedAt: t.string({ resolve: (s) => s.updatedAt.toISOString() }),
  }),
});

interface MemberPaymentStatusShape {
  id: number;
  leagueId: number;
  userId: number;
  username: string | null;
  paid: boolean;
  paidAt: Date | null;
  markedBy: number | null;
  createdAt: Date;
  updatedAt: Date;
}

const MemberPaymentStatusRef = builder.objectRef<MemberPaymentStatusShape>(
  'LeagueMemberPaymentStatus',
);

MemberPaymentStatusRef.implement({
  description: 'Payment status for a single league member',
  fields: (t) => ({
    id: t.exposeInt('id'),
    leagueId: t.exposeInt('leagueId'),
    userId: t.exposeInt('userId'),
    username: t.exposeString('username', { nullable: true }),
    paid: t.exposeBoolean('paid'),
    paidAt: t.string({
      nullable: true,
      resolve: (s) => (s.paidAt ? s.paidAt.toISOString() : null),
    }),
    markedBy: t.exposeInt('markedBy', { nullable: true }),
    createdAt: t.string({ resolve: (s) => s.createdAt.toISOString() }),
    updatedAt: t.string({ resolve: (s) => s.updatedAt.toISOString() }),
  }),
});

// ─── Queries ─────────────────────────────────────────────────────────────────

builder.queryField('leagueDuesSettings', (t) =>
  t.field({
    type: DuesSettingsRef,
    nullable: true,
    description: 'Get dues settings for a league. Requires league membership.',
    args: {
      leagueId: t.arg.int({ required: true }),
    },
    resolve: async (_root, { leagueId }, context) => {
      if (!context.user) throw AuthenticationError();

      await verifyLeagueMembership(context.db, leagueId, context.user.id);

      const rows = await context.db
        .select({
          id: PublicSchema.leagueDuesSettings.id,
          leagueId: PublicSchema.leagueDuesSettings.leagueId,
          enabled: PublicSchema.leagueDuesSettings.enabled,
          amountCents: PublicSchema.leagueDuesSettings.amountCents,
          reminderEnabled: PublicSchema.leagueDuesSettings.reminderEnabled,
          reminderDayOfWeek: PublicSchema.leagueDuesSettings.reminderDayOfWeek,
          createdAt: PublicSchema.leagueDuesSettings.createdAt,
          updatedAt: PublicSchema.leagueDuesSettings.updatedAt,
        })
        .from(PublicSchema.leagueDuesSettings)
        .where(eq(PublicSchema.leagueDuesSettings.leagueId, leagueId))
        .limit(1);

      if (rows.length === 0) return null;

      return {
        ...rows[0],
        createdAt: new Date(rows[0].createdAt),
        updatedAt: new Date(rows[0].updatedAt),
      };
    },
  }),
);

builder.queryField('leagueDuesStatus', (t) =>
  t.field({
    type: [MemberPaymentStatusRef],
    description:
      'Get payment status for all league members. Requires league membership.',
    args: {
      leagueId: t.arg.int({ required: true }),
    },
    resolve: async (_root, { leagueId }, context) => {
      if (!context.user) throw AuthenticationError();

      await verifyLeagueMembership(context.db, leagueId, context.user.id);

      const rows = await context.db
        .select({
          id: PublicSchema.leagueMemberPaymentStatus.id,
          leagueId: PublicSchema.leagueMemberPaymentStatus.leagueId,
          userId: PublicSchema.leagueMemberPaymentStatus.userId,
          username: PublicSchema.users.username,
          paid: PublicSchema.leagueMemberPaymentStatus.paid,
          paidAt: PublicSchema.leagueMemberPaymentStatus.paidAt,
          markedBy: PublicSchema.leagueMemberPaymentStatus.markedBy,
          createdAt: PublicSchema.leagueMemberPaymentStatus.createdAt,
          updatedAt: PublicSchema.leagueMemberPaymentStatus.updatedAt,
        })
        .from(PublicSchema.leagueMemberPaymentStatus)
        .innerJoin(
          PublicSchema.users,
          eq(
            PublicSchema.leagueMemberPaymentStatus.userId,
            PublicSchema.users.id,
          ),
        )
        .where(eq(PublicSchema.leagueMemberPaymentStatus.leagueId, leagueId));

      return rows.map((r) => ({
        ...r,
        createdAt: new Date(r.createdAt),
        updatedAt: new Date(r.updatedAt),
        paidAt: r.paidAt ? new Date(r.paidAt) : null,
      }));
    },
  }),
);

// ─── Input types ─────────────────────────────────────────────────────────────

const UpdateDuesSettingsInput = builder.inputType('UpdateDuesSettingsInput', {
  fields: (t) => ({
    leagueId: t.int({ required: true }),
    enabled: t.boolean({ required: true }),
    amountCents: t.int({ required: true }),
    reminderEnabled: t.boolean({ required: true }),
    reminderDayOfWeek: t.int({ required: false }),
  }),
});

// ─── Mutations ───────────────────────────────────────────────────────────────

builder.mutationField('updateDuesSettings', (t) =>
  t.field({
    type: DuesSettingsRef,
    description:
      'Create or update dues settings for a league. Commissioner/GM access required.',
    args: {
      input: t.arg({ type: UpdateDuesSettingsInput, required: true }),
    },
    resolve: async (_root, { input }, context) => {
      if (!context.user) throw AuthenticationError();

      const {
        leagueId,
        enabled,
        amountCents,
        reminderEnabled,
        reminderDayOfWeek,
      } = input;

      if (amountCents < 0) {
        throw UserInputError('Dues amount cannot be negative');
      }

      if (
        reminderDayOfWeek != null &&
        (reminderDayOfWeek < 0 || reminderDayOfWeek > 6)
      ) {
        throw UserInputError(
          'reminderDayOfWeek must be between 0 (Sunday) and 6 (Saturday)',
        );
      }

      if (reminderEnabled && reminderDayOfWeek == null) {
        throw UserInputError(
          'reminderDayOfWeek is required when reminders are enabled',
        );
      }

      await verifyCommissionerAccess(context.db, leagueId, context.user.id);

      const [row] = await context.db
        .insert(PublicSchema.leagueDuesSettings)
        .values({
          leagueId,
          enabled,
          amountCents,
          reminderEnabled,
          reminderDayOfWeek: reminderEnabled
            ? (reminderDayOfWeek ?? null)
            : null,
        })
        .onConflictDoUpdate({
          target: [PublicSchema.leagueDuesSettings.leagueId],
          set: {
            enabled,
            amountCents,
            reminderEnabled,
            reminderDayOfWeek: reminderEnabled
              ? (reminderDayOfWeek ?? null)
              : null,
          },
        })
        .returning();

      LOGGER.info('Updated dues settings', {
        leagueId,
        enabled,
        amountCents,
        userId: context.user.id,
      });

      return {
        ...row,
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt),
      };
    },
  }),
);

builder.mutationField('markMemberPaid', (t) =>
  t.field({
    type: MemberPaymentStatusRef,
    description:
      'Mark a league member as paid. Commissioner/GM access required.',
    args: {
      leagueId: t.arg.int({ required: true }),
      userId: t.arg.int({ required: true }),
    },
    resolve: async (_root, { leagueId, userId }, context) => {
      if (!context.user) throw AuthenticationError();

      await verifyCommissionerAccess(context.db, leagueId, context.user.id);

      // A commissioner may not mark their own dues paid — prevents
      // self-exemption from dues collection (LS-4029).
      if (userId === context.user.id) {
        throw ForbiddenError(
          'Commissioners cannot mark their own dues as paid',
        );
      }

      // Verify target user is a league member
      await verifyLeagueMembership(context.db, leagueId, userId);

      const [row] = await context.db
        .insert(PublicSchema.leagueMemberPaymentStatus)
        .values({
          leagueId,
          userId,
          paid: true,
          paidAt: new Date(),
          markedBy: context.user.id,
        })
        .onConflictDoUpdate({
          target: [
            PublicSchema.leagueMemberPaymentStatus.leagueId,
            PublicSchema.leagueMemberPaymentStatus.userId,
          ],
          set: {
            paid: true,
            paidAt: new Date(),
            markedBy: context.user.id,
          },
        })
        .returning();

      // Fetch username for response
      const [user] = await context.db
        .select({ username: PublicSchema.users.username })
        .from(PublicSchema.users)
        .where(eq(PublicSchema.users.id, userId))
        .limit(1);

      LOGGER.info('Marked member paid', {
        leagueId,
        userId,
        markedBy: context.user.id,
      });

      return {
        ...row,
        username: user?.username ?? null,
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt),
        paidAt: row.paidAt ? new Date(row.paidAt) : null,
      };
    },
  }),
);

// ─── Scheduled Reminder ─────────────────────────────────────────────────────

interface SendDuesRemindersResultShape {
  leaguesChecked: number;
  remindersSent: number;
  errors: string[];
}

const SendDuesRemindersResult = builder.objectRef<SendDuesRemindersResultShape>(
  'SendDuesRemindersResult',
);

builder.objectType(SendDuesRemindersResult, {
  description:
    'Result of the scheduled dues reminder check across all active leagues',
  fields: (t) => ({
    leaguesChecked: t.exposeInt('leaguesChecked'),
    remindersSent: t.exposeInt('remindersSent'),
    errors: t.exposeStringList('errors'),
  }),
});

/** Timeout for Discord webhook requests (ms). */
const DUES_WEBHOOK_TIMEOUT_MS = 10_000;

/** Max length for a Discord embed field value. */
const DISCORD_EMBED_FIELD_MAX = 1024;

/**
 * Truncate a list of names to fit within `maxLen` characters,
 * appending "and X more" when truncated.
 */
function truncateNamesList(names: string[], maxLen: number): string {
  const joined = names.join(', ');
  if (joined.length <= maxLen) return joined;

  let result = '';
  let included = 0;
  for (const name of names) {
    const separator = included === 0 ? '' : ', ';
    const remaining = names.length - included;
    const suffix = `, and ${remaining} more`;
    if ((result + separator + name + suffix).length > maxLen) {
      break;
    }
    result += separator + name;
    included++;
  }

  const remaining = names.length - included;
  if (remaining > 0) {
    result += `, and ${remaining} more`;
  }

  return result;
}

/**
 * Post a formatted dues reminder embed to a Discord webhook URL.
 */
async function postDuesReminderToDiscord(
  webhookUrl: string,
  leagueName: string,
  amountDollars: string,
  unpaidUsernames: string[],
): Promise<boolean> {
  if (!isValidDiscordWebhookUrl(webhookUrl)) {
    LOGGER.error('Invalid Discord webhook URL for dues reminder', {
      webhookUrl,
    });
    return false;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, DUES_WEBHOOK_TIMEOUT_MS);

  try {
    const fieldValue = truncateNamesList(
      unpaidUsernames,
      DISCORD_EMBED_FIELD_MAX,
    );

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [
          {
            title: '\uD83D\uDCB0 Dues Reminder',
            description: `**${leagueName}** has outstanding league dues of **$${amountDollars}** per member.`,
            color: 0xf59e0b,
            fields: [
              {
                name: `Unpaid Members (${unpaidUsernames.length})`,
                value: fieldValue,
              },
            ],
            timestamp: new Date().toISOString(),
            footer: { text: 'Legacy Sports Dues' },
          },
        ],
        allowed_mentions: { parse: [] },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      LOGGER.error('Discord dues reminder webhook failed', {
        status: response.status,
        statusText: response.statusText,
      });
      return false;
    }

    return true;
  } catch (error: unknown) {
    LOGGER.error('Discord dues reminder webhook threw', { error });
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

// TODO: Add tests for sendDuesReminders mutation (SSRF validation, truncation,
// mock-draft filtering, message type, and end-to-end reminder flow).
builder.mutationField('sendDuesReminders', (t) =>
  t.field({
    type: SendDuesRemindersResult,
    description:
      'Check all leagues with dues reminders enabled and post reminders ' +
      'to league chat (and Discord if configured) for unpaid members. ' +
      'Only fires for leagues whose reminder day matches the current day of week. ' +
      'Triggered daily by EventBridge.',
    args: {
      leagueId: t.arg.int({ required: false }),
    },
    resolve: async (_parent, args, context: Context) => {
      await assertAuthorized(context, args.leagueId);

      const now = new Date();
      const currentDayOfWeek = now.getUTCDay(); // 0=Sunday, 6=Saturday
      const errors: string[] = [];
      let remindersSent = 0;

      // 1. Find active leagues (excluding mock drafts) with dues reminders enabled for today
      const conditions = [
        eq(PublicSchema.leagueDuesSettings.enabled, true),
        eq(PublicSchema.leagueDuesSettings.reminderEnabled, true),
        eq(PublicSchema.leagueDuesSettings.reminderDayOfWeek, currentDayOfWeek),
        eq(PublicSchema.leagues.isMockDraft, false),
      ];

      if (args.leagueId) {
        conditions.push(
          eq(PublicSchema.leagueDuesSettings.leagueId, args.leagueId),
        );
      }

      const leagues = await context.db
        .select({
          leagueId: PublicSchema.leagueDuesSettings.leagueId,
          amountCents: PublicSchema.leagueDuesSettings.amountCents,
          leagueName: PublicSchema.leagues.name,
          discordWebhookUrl: PublicSchema.leagues.discordWebhookUrl,
        })
        .from(PublicSchema.leagueDuesSettings)
        .innerJoin(
          PublicSchema.leagues,
          eq(PublicSchema.leagueDuesSettings.leagueId, PublicSchema.leagues.id),
        )
        .where(and(...conditions));

      LOGGER.info('Dues reminder check', {
        dayOfWeek: currentDayOfWeek,
        leaguesMatched: leagues.length,
      });

      // 2. For each league, find unpaid members and post reminder
      for (const league of leagues) {
        try {
          // Get unpaid members
          const unpaidMembers = await context.db
            .select({
              userId: PublicSchema.leagueMembers.userId,
              username: PublicSchema.users.username,
            })
            .from(PublicSchema.leagueMembers)
            .innerJoin(
              PublicSchema.users,
              eq(PublicSchema.leagueMembers.userId, PublicSchema.users.id),
            )
            .leftJoin(
              PublicSchema.leagueMemberPaymentStatus,
              and(
                eq(
                  PublicSchema.leagueMemberPaymentStatus.leagueId,
                  league.leagueId,
                ),
                eq(
                  PublicSchema.leagueMemberPaymentStatus.userId,
                  PublicSchema.leagueMembers.userId,
                ),
                eq(PublicSchema.leagueMemberPaymentStatus.paid, true),
              ),
            )
            .where(
              and(
                eq(PublicSchema.leagueMembers.leagueId, league.leagueId),
                sql`${PublicSchema.leagueMemberPaymentStatus.id} IS NULL`,
              ),
            );

          if (unpaidMembers.length === 0) {
            LOGGER.info('All members paid, skipping reminder', {
              leagueId: league.leagueId,
            });
            continue;
          }

          const amountDollars = (league.amountCents / 100).toFixed(2);
          const unpaidNames = unpaidMembers.map(
            (m) => m.username ?? `User ${m.userId}`,
          );

          // Post reminder message to league chat
          const messagePrefix =
            `\uD83D\uDCB0 Dues Reminder: ${unpaidMembers.length} member${unpaidMembers.length === 1 ? '' : 's'} ` +
            `still owe${unpaidMembers.length === 1 ? 's' : ''} $${amountDollars} in league dues. ` +
            `Unpaid: `;
          const maxNamesLen = 2000 - messagePrefix.length;
          const messageText =
            messagePrefix + truncateNamesList(unpaidNames, maxNamesLen);

          await context.db.insert(PublicSchema.leagueMessages).values({
            leagueId: league.leagueId,
            userId: null,
            messageText,
            messageType: 'text',
          });

          // Post to Discord if configured
          if (league.discordWebhookUrl) {
            const sent = await postDuesReminderToDiscord(
              league.discordWebhookUrl,
              league.leagueName,
              amountDollars,
              unpaidNames,
            );
            if (!sent) {
              errors.push(
                `Discord webhook failed for league ${league.leagueId}`,
              );
            }
          }

          remindersSent++;

          LOGGER.info('Sent dues reminder', {
            leagueId: league.leagueId,
            unpaidCount: unpaidMembers.length,
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          errors.push(`League ${league.leagueId}: ${msg}`);
          LOGGER.error('Failed to send dues reminder', {
            leagueId: league.leagueId,
            err,
          });
        }
      }

      return {
        leaguesChecked: leagues.length,
        remindersSent,
        errors,
      };
    },
  }),
);

builder.mutationField('markMemberUnpaid', (t) =>
  t.field({
    type: MemberPaymentStatusRef,
    description:
      'Mark a league member as unpaid. Commissioner/GM access required.',
    args: {
      leagueId: t.arg.int({ required: true }),
      userId: t.arg.int({ required: true }),
    },
    resolve: async (_root, { leagueId, userId }, context) => {
      if (!context.user) throw AuthenticationError();

      await verifyCommissionerAccess(context.db, leagueId, context.user.id);

      // A commissioner may not toggle their own dues status — pairs with
      // the markMemberPaid guard so the rule applies in both directions
      // (LS-4029).
      if (userId === context.user.id) {
        throw ForbiddenError(
          'Commissioners cannot mark their own dues as unpaid',
        );
      }

      // Verify target user is a league member
      await verifyLeagueMembership(context.db, leagueId, userId);

      const [row] = await context.db
        .insert(PublicSchema.leagueMemberPaymentStatus)
        .values({
          leagueId,
          userId,
          paid: false,
          paidAt: null,
          markedBy: context.user.id,
        })
        .onConflictDoUpdate({
          target: [
            PublicSchema.leagueMemberPaymentStatus.leagueId,
            PublicSchema.leagueMemberPaymentStatus.userId,
          ],
          set: {
            paid: false,
            paidAt: null,
            markedBy: context.user.id,
          },
        })
        .returning();

      // Fetch username for response
      const [user] = await context.db
        .select({ username: PublicSchema.users.username })
        .from(PublicSchema.users)
        .where(eq(PublicSchema.users.id, userId))
        .limit(1);

      LOGGER.info('Marked member unpaid', {
        leagueId,
        userId,
        markedBy: context.user.id,
      });

      return {
        ...row,
        username: user?.username ?? null,
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt),
        paidAt: row.paidAt ? new Date(row.paidAt) : null,
      };
    },
  }),
);
