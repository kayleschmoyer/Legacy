import type { Context } from 'aws-lambda';

let lambdaContext: Context | undefined;

/**
 * Set by the Lambda handler at the top of every invocation, before auth or
 * credential-fetch runs, so tool code can size its internal poll windows off
 * the time actually left before AWS kills this execution (LS-8429 pattern,
 * ported from ci-server for LS-9988) — not a fixed assumption about how long
 * that pre-handler work takes.
 */
export function setLambdaContext(context: Context | undefined): void {
  lambdaContext = context;
}

/**
 * Milliseconds left before this Lambda invocation is SIGKILLed. Outside
 * Lambda (local stdio transport, unit tests) there is no such deadline, so
 * this returns Infinity and callers fall back to their own static per-call
 * ceiling unchanged.
 */
export function getRemainingLambdaMs(): number {
  return lambdaContext?.getRemainingTimeInMillis() ?? Infinity;
}
