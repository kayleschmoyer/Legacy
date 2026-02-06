#!/usr/bin/env node

const { SQSClient, SendMessageBatchCommand } = require('@aws-sdk/client-sqs');
const { Client } = require('pg');
const {
  SecretsManagerClient,
  GetSecretValueCommand,
} = require('@aws-sdk/client-secrets-manager');

const QUEUE_URL =
  'https://sqs.us-east-1.amazonaws.com/176661590736/legacy-sports-dev-load-season-stats.fifo';
const REGION = 'us-east-1';
const SECRET_NAME = 'legacy-sports-dev-db-creds-20250925194630368900000002';

async function getDbCredentials() {
  const client = new SecretsManagerClient({ region: REGION });
  const response = await client.send(
    new GetSecretValueCommand({ SecretId: SECRET_NAME }),
  );
  return JSON.parse(response.SecretString);
}

async function getAllPlayers() {
  const creds = await getDbCredentials();
  const client = new Client({
    host: 'localhost',
    port: 5432,
    database: creds.dbname,
    user: creds.username,
    password: creds.password,
  });

  await client.connect();
  const result = await client.query(
    'SELECT bref_id FROM public.players ORDER BY bref_id',
  );
  await client.end();

  return result.rows.map((row) => row.bref_id);
}

async function queuePlayers(players) {
  const sqs = new SQSClient({ region: REGION });
  const batches = [];

  // Split into batches of 10 (SQS limit)
  for (let i = 0; i < players.length; i += 10) {
    batches.push(players.slice(i, i + 10));
  }

  console.log(
    `Queuing ${players.length} players in ${batches.length} batches...`,
  );

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const timestamp = Date.now();

    const entries = batch.map((player, idx) => ({
      Id: `${i}-${idx}`,
      MessageBody: JSON.stringify(player),
      MessageGroupId: `batch-${i}`,
      MessageDeduplicationId: `${player}-${timestamp}-${i}-${idx}`,
    }));

    await sqs.send(
      new SendMessageBatchCommand({
        QueueUrl: QUEUE_URL,
        Entries: entries,
      }),
    );

    if ((i + 1) % 100 === 0) {
      console.log(`Queued ${(i + 1) * 10} / ${players.length} players...`);
    }
  }

  console.log(`✅ Successfully queued all ${players.length} players!`);
}

async function main() {
  try {
    console.log('Fetching all players from database...');
    const players = await getAllPlayers();
    console.log(`Found ${players.length} players`);

    await queuePlayers(players);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
