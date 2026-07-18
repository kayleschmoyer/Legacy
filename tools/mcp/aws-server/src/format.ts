// Token-efficient formatting for aws-server's flat, uniform list tools
// (aws_ec2_instances, aws_secretsmanager_list_secrets). The cross-server
// standard and helper live in `@legacy-sports/mcp-format` (epic LS-8018 /
// LS-8019); this module only pins the per-tool column sets — the first-order
// field-selection lever — so the list tools render identically.
//
// Per the epic's per-shape rule, only genuinely flat uniform lists become
// Markdown tables here. The server's nested / heterogeneous "describe"
// responses (ec2 describe-image, console-output, launch-template-inspect,
// network-inspect, describe-secret, security-groups, iam-get-policy,
// terraform-output) and the already-minified blob/heterogeneous tools
// (aws_logs_tail, aws_lambda_status) stay minified JSON and do not use this
// module.

/**
 * aws_ec2_instances: the instance fields the tool advertises and agents read off
 * a fleet listing. Drops the unadvertised `architecture` field (verbose metadata
 * agents never read when scanning an instance list).
 */
export const EC2_INSTANCE_COLUMNS = [
  'instanceId',
  'instanceType',
  'state',
  'stateReason',
  'instanceLifecycle',
  'name',
  'publicIp',
  'privateIp',
  'launchTime',
  'imageId',
  'keyName',
] as const;

/** aws_secretsmanager_list_secrets: name + ARN are the payload; description and
 * last-changed date are light, low-cost context an agent triaging secrets reads. */
export const SECRET_LIST_COLUMNS = [
  'name',
  'arn',
  'description',
  'lastChangedDate',
] as const;
