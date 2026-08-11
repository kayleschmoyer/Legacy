import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';

/**
 * Async self-invoke plumbing for the `db_migrate` worker (LS-8563).
 *
 * The submit path fires an `InvocationType: 'Event'` invoke of THIS Lambda,
 * carrying only `{ dbMigrateJobId }` — the full migration payload stays in the
 * job row (Lambda's async-invoke payload cap is 256KB; the migration payload
 * cap is 2MB). `lambda.ts` branches on this event shape before any API Gateway
 * handling. The function reaches the Lambda control plane through the VPC's
 * NAT-instance default route (the same path the jira-proxy/oauth Lambdas use
 * for external APIs); the `lambda:InvokeFunction` self-permission is granted in
 * `terraform/main/lambda-mcp-db.tf`.
 */

/** The async self-invoke event that triggers the migration worker. */
export interface DbMigrateWorkerEvent {
  dbMigrateJobId: string;
}

/** True when the incoming Lambda event is a worker invoke, not an HTTP request. */
export function isDbMigrateWorkerEvent(
  event: unknown,
): event is DbMigrateWorkerEvent {
  return (
    typeof event === 'object' &&
    event !== null &&
    typeof (event as DbMigrateWorkerEvent).dbMigrateJobId === 'string'
  );
}

let lambdaClient: LambdaClient | null = null;

/** Fire the async worker invoke for a job. Throws when the invoke is rejected. */
export async function invokeWorkerAsync(jobId: string): Promise<void> {
  const functionName = process.env['AWS_LAMBDA_FUNCTION_NAME'];
  if (!functionName) {
    throw new Error(
      'AWS_LAMBDA_FUNCTION_NAME is not set — cannot self-invoke the db_migrate worker.',
    );
  }
  lambdaClient ??= new LambdaClient({});
  const payload: DbMigrateWorkerEvent = { dbMigrateJobId: jobId };
  await lambdaClient.send(
    new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'Event',
      Payload: Buffer.from(JSON.stringify(payload)),
    }),
  );
}
