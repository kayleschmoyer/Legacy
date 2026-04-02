import { getSql } from '../db-connection.js';
import type { ToolResult } from '../types.js';

type LookupBy = 'id' | 'email' | 'username';

interface GetUserParams {
  identifier: string;
  by?: LookupBy;
}

/** Fields returned from the users view. */
interface UserRow {
  id: number;
  email: string | null;
  username: string | null;
  access_level: string | null;
  avatar_url: string | null;
  subscription_tier: string | null;
  discord_id: string | null;
  discord_username: string | null;
  discord_avatar: string | null;
}

const USER_SELECT =
  'SELECT id, email, username, access_level, avatar_url, subscription_tier, discord_id, discord_username, discord_avatar FROM public.users';

export async function getUser(params: GetUserParams): Promise<ToolResult> {
  const { identifier, by = 'username' } = params;

  const normalizedIdentifier = identifier.trim();

  if (!normalizedIdentifier) {
    return {
      content: [
        { type: 'text', text: 'identifier is required and cannot be empty.' },
      ],
      isError: true,
    };
  }

  const sql = getSql();

  try {
    let rows: UserRow[];

    if (by === 'id') {
      if (!/^[1-9]\d*$/.test(normalizedIdentifier)) {
        return {
          content: [
            {
              type: 'text',
              text: `Invalid id: "${normalizedIdentifier}". Must be a positive integer.`,
            },
          ],
          isError: true,
        };
      }
      const numericId = parseInt(normalizedIdentifier, 10);
      rows = await sql.begin('READ ONLY', (tx) =>
        tx.unsafe<UserRow[]>(`${USER_SELECT} WHERE id = $1 LIMIT 1`, [
          numericId,
        ]),
      );
    } else if (by === 'email') {
      rows = await sql.begin('READ ONLY', (tx) =>
        tx.unsafe<UserRow[]>(
          `${USER_SELECT} WHERE lower(email) = lower($1) LIMIT 1`,
          [normalizedIdentifier],
        ),
      );
    } else {
      // by === 'username'
      rows = await sql.begin('READ ONLY', (tx) =>
        tx.unsafe<UserRow[]>(
          `${USER_SELECT} WHERE lower(username) = lower($1) LIMIT 1`,
          [normalizedIdentifier],
        ),
      );
    }

    if (rows.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No user found with ${by}="${normalizedIdentifier}".`,
          },
        ],
      };
    }

    const user = rows[0];
    const result = {
      id: user.id,
      email: user.email,
      username: user.username,
      accessLevel: user.access_level,
      avatarUrl: user.avatar_url,
      subscriptionTier: user.subscription_tier,
      discordId: user.discord_id,
      discordUsername: user.discord_username,
      discordAvatar: user.discord_avatar,
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Query failed: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
