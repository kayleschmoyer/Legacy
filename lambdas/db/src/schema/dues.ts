/**
 * League Dues — GraphQL types, queries, and mutations.
 *
 * Commissioners can enable dues for a league, set an amount, and configure
 * optional reminders.  They can also mark individual members as paid/unpaid.
 * All league members can view who has and hasn't paid.
 */
import { LOGGER } from '@legacy-sports/logging';
import { PublicSchema } from '@legacy-sports/db-client';
import { eq } from 'drizzle-orm';
import { builder } from './builder';
import { AuthenticationError, UserInputError } from './graphql-errors';
import {
  verifyCommissionerAccess,
  verifyLeagueMembership,
} from './authorization';

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
