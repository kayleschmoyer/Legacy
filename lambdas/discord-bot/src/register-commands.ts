/**
 * One-time script to register Discord slash commands.
 *
 * Usage:
 *   DISCORD_BOT_TOKEN=... DISCORD_APP_ID=... tsx lambdas/discord-bot/src/register-commands.ts
 *
 * This registers the /jira slash command globally for the bot application.
 * Only needs to be run once (or when command definitions change).
 */

import { LOGGER } from '@legacy-sports/logging';

const DISCORD_API = 'https://discord.com/api/v10';

const commands = [
  {
    name: 'jira',
    description: 'Create a Jira ticket',
    options: [
      {
        name: 'summary',
        description: 'Ticket summary/title',
        type: 3, // STRING
        required: true,
      },
      {
        name: 'type',
        description: 'Issue type',
        type: 3, // STRING
        required: false,
        choices: [
          { name: 'Task', value: 'Task' },
          { name: 'Bug', value: 'Bug' },
          { name: 'Story', value: 'Story' },
        ],
      },
      {
        name: 'description',
        description: 'Detailed description',
        type: 3, // STRING
        required: false,
      },
    ],
  },
];

async function registerCommands() {
  const token = process.env['DISCORD_BOT_TOKEN'];
  const appId = process.env['DISCORD_APP_ID'];

  if (!token || !appId) {
    LOGGER.error(
      'Set DISCORD_BOT_TOKEN and DISCORD_APP_ID environment variables',
    );
    process.exit(1);
  }

  const url = `${DISCORD_API}/applications/${appId}/commands`;

  for (const command of commands) {
    LOGGER.info(`Registering command: /${command.name}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
    });

    if (response.ok) {
      const data = (await response.json()) as { id: string };
      LOGGER.info(`  Registered: ${data.id}`);
    } else {
      const text = await response.text();
      LOGGER.error(`  Failed (${response.status}): ${text}`);
    }
  }

  LOGGER.info('Done!');
}

void registerCommands();
