/**
 * Discord Channel Management — GraphQL mutations for auto-creating
 * and archiving Discord channels for leagues.
 *
 * Commissioners link a Discord server (guild) to their league, and the
 * bot creates a text channel in that server. When the league is frozen
 * (deactivated), the channel is archived or deleted.
 *
 * Requires the DISCORD_BOT_TOKEN env var to be set on the GraphQL Lambda.
 *
 * (LS-1681: Auto-create Discord channels per league)
 */

import { PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { eq } from 'drizzle-orm';

import { GraphQLError } from 'graphql';

import { builder, type Context } from './builder';
import { AuthenticationError } from './graphql-errors';
import { verifyCommissionerAccess } from './authorization';

const DISCORD_API = 'https://discord.com/api/v10';

// ── Response Types ──────────────────────────────────────────────────────────

interface DiscordChannelMutationResultShape {
  success: boolean;
  channelId: string | null;
  channelName: string | null;
  error: string | null;
}

const DiscordChannelMutationResult =
  builder.objectRef<DiscordChannelMutationResultShape>(
    'DiscordChannelMutationResult',
  );

builder.objectType(DiscordChannelMutationResult, {
  description: 'Result of a Discord channel mutation for a league',
  fields: (t) => ({
    success: t.exposeBoolean('success'),
    channelId: t.exposeString('channelId', { nullable: true }),
    channelName: t.exposeString('channelName', { nullable: true }),
    error: t.exposeString('error', { nullable: true }),
  }),
});

// ── Discord API Helper ──────────────────────────────────────────────────────

function getBotToken(): string {
  const token = process.env['DISCORD_BOT_TOKEN'];
  if (!token) throw new Error('DISCORD_BOT_TOKEN not configured');
  return token;
}

async function discordApi(
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<{ ok: boolean; data: Record<string, unknown>; status: number }> {
  const token = getBotToken();
  const response = await fetch(`${DISCORD_API}${path}`, {
    method,
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const data = response.ok
    ? ((await response.json()) as Record<string, unknown>)
    : {};
  return { ok: response.ok, data, status: response.status };
}

// ── Mutations ───────────────────────────────────────────────────────────────

builder.mutationField('createDiscordChannel', (t) =>
  t.field({
    type: DiscordChannelMutationResult,
    description:
      'Create a Discord text channel for a league in the specified guild. ' +
      'Requires commissioner access and the bot to be invited to the guild.',
    args: {
      leagueId: t.arg.int({ required: true }),
      guildId: t.arg.string({ required: true }),
      categoryId: t.arg.string({ required: false }),
    },
    resolve: async (_parent, args, context: Context) => {
      if (!context.user) throw AuthenticationError();
      await verifyCommissionerAccess(
        context.db,
        args.leagueId,
        context.user.id,
      );

      try {
        // Get league name for the channel
        const [league] = await context.db
          .select({
            name: PublicSchema.leagues.name,
            discordChannelId: PublicSchema.leagues.discordChannelId,
          })
          .from(PublicSchema.leagues)
          .where(eq(PublicSchema.leagues.id, args.leagueId))
          .limit(1);

        if (!league) throw new Error('League not found');

        // If channel already exists, return it
        if (league.discordChannelId) {
          return {
            success: true,
            channelId: league.discordChannelId,
            channelName: null,
            error: null,
          };
        }

        // Create channel name from league name (lowercase, dashes, max 100 chars)
        let channelName = league.name
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/^-+|-+$/g, '')
          .substring(0, 100);

        // Fallback if name is empty after sanitization
        if (!channelName) {
          channelName = `league-${args.leagueId}`;
        }

        // Create the channel via Discord API
        const channelBody: Record<string, unknown> = {
          name: channelName,
          type: 0, // GUILD_TEXT
          topic: `League discussion for ${league.name}`,
        };

        if (args.categoryId) {
          channelBody['parent_id'] = args.categoryId;
        }

        const result = await discordApi(
          'POST',
          `/guilds/${args.guildId}/channels`,
          channelBody,
        );

        if (!result.ok) {
          LOGGER.error('Discord channel creation failed', {
            leagueId: args.leagueId,
            guildId: args.guildId,
            status: result.status,
          });
          return {
            success: false,
            channelId: null,
            channelName: null,
            error: 'Failed to create Discord channel',
          };
        }

        const channelId = result.data['id'] as string;

        // Save channel info to league — if DB update fails, delete the orphan channel
        try {
          await context.db
            .update(PublicSchema.leagues)
            .set({
              discordGuildId: args.guildId,
              discordChannelId: channelId,
              discordCategoryId: args.categoryId ?? null,
              updatedAt: new Date(),
            })
            .where(eq(PublicSchema.leagues.id, args.leagueId));
        } catch (dbErr) {
          LOGGER.error(
            'DB update failed after Discord channel creation, deleting orphan channel',
            {
              leagueId: args.leagueId,
              channelId,
              error: dbErr instanceof Error ? dbErr.message : String(dbErr),
            },
          );
          await discordApi('DELETE', `/channels/${channelId}`);
          throw dbErr;
        }

        LOGGER.info('Discord channel created for league', {
          leagueId: args.leagueId,
          channelId,
          guildId: args.guildId,
        });

        return {
          success: true,
          channelId,
          channelName,
          error: null,
        };
      } catch (err) {
        // Re-throw auth errors so they surface as GraphQL errors
        if (err instanceof GraphQLError) {
          throw err;
        }
        LOGGER.error('Unexpected error in createDiscordChannel', {
          leagueId: args.leagueId,
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          success: false,
          channelId: null,
          channelName: null,
          error:
            'An unexpected error occurred while creating the Discord channel',
        };
      }
    },
  }),
);

builder.mutationField('archiveDiscordChannel', (t) =>
  t.field({
    type: DiscordChannelMutationResult,
    description:
      'Delete the Discord channel for a league. ' +
      'Called when a league is deactivated or frozen.',
    args: {
      leagueId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context: Context) => {
      if (!context.user) throw AuthenticationError();
      await verifyCommissionerAccess(
        context.db,
        args.leagueId,
        context.user.id,
      );

      try {
        const [league] = await context.db
          .select({
            discordChannelId: PublicSchema.leagues.discordChannelId,
          })
          .from(PublicSchema.leagues)
          .where(eq(PublicSchema.leagues.id, args.leagueId))
          .limit(1);

        if (!league?.discordChannelId) {
          return {
            success: false,
            channelId: null,
            channelName: null,
            error: 'No Discord channel linked to this league',
          };
        }

        // Delete the channel directly (Discord PATCH doesn't support `archived` for guild text channels)
        const deleteResult = await discordApi(
          'DELETE',
          `/channels/${league.discordChannelId}`,
        );

        if (!deleteResult.ok) {
          LOGGER.error('Discord channel deletion failed', {
            leagueId: args.leagueId,
            channelId: league.discordChannelId,
            status: deleteResult.status,
          });
          return {
            success: false,
            channelId: league.discordChannelId,
            channelName: null,
            error: 'Failed to delete Discord channel',
          };
        }

        // Clear all channel info from league (including webhook URL)
        await context.db
          .update(PublicSchema.leagues)
          .set({
            discordChannelId: null,
            discordGuildId: null,
            discordCategoryId: null,
            discordWebhookUrl: null,
            updatedAt: new Date(),
          })
          .where(eq(PublicSchema.leagues.id, args.leagueId));

        LOGGER.info('Discord channel deleted for league', {
          leagueId: args.leagueId,
          channelId: league.discordChannelId,
        });

        return {
          success: true,
          channelId: league.discordChannelId,
          channelName: null,
          error: null,
        };
      } catch (err) {
        // Re-throw auth errors so they surface as GraphQL errors
        if (err instanceof GraphQLError) {
          throw err;
        }
        LOGGER.error('Unexpected error in archiveDiscordChannel', {
          leagueId: args.leagueId,
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          success: false,
          channelId: null,
          channelName: null,
          error:
            'An unexpected error occurred while deleting the Discord channel',
        };
      }
    },
  }),
);
