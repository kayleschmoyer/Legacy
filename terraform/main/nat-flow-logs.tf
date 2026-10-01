# VPC Flow Logs on the NAT instance ENI (LS-10334)
#
# DataTransfer-Out-Bytes is the largest single EC2 cost line (3.1 TB / $267 in
# Sep 2026). Every private-subnet egress flow — CI runner uploads to GitHub,
# npm/registry pulls, anything not routed through a VPC endpoint — leaves the
# VPC through aws_network_interface.nat_instance, so a flow log on that single
# ENI attributes the whole egress bill to its destinations.
#
# This is a *diagnostic toggle*, not always-on infrastructure. Everything in
# this file is gated by var.enable_nat_flow_logs (default false), so the
# steady-state cost is zero. The intended lifecycle is:
#
#   1. Flip `enable_nat_flow_logs = true` in infra.auto.tfvars, merge, let the
#      post-merge terraform apply create the log group + flow log.
#   2. Leave it on for one busy CI day.
#   3. Run scripts/nat-egress-top-destinations.sh to summarise egress bytes
#      by destination IP / prefix / port, attach the table to the ticket.
#   4. Flip the variable back to false and merge — the flow log, delivery
#      role and log group are destroyed (retention is 3 days, so the data is
#      short-lived even if step 4 is late).
#
# Only ACCEPT traffic is captured (rejects are security-group noise that does
# not contribute to egress bytes). The custom log format adds pkt-dstaddr and
# flow-direction on top of the default fields: because the NAT instance
# MASQUERADEs, the same packet appears once as an *ingress* flow (runner IP →
# internet) and once as an *egress* flow (NAT IP → internet). Filtering on
# flow-direction = egress in the query counts each byte exactly once.

resource "aws_cloudwatch_log_group" "nat_flow_logs" {
  count = var.enable_nat_flow_logs && var.use_nat_instance ? 1 : 0

  name              = "/aws/vpc/${local.name_prefix}-nat-flow-logs"
  retention_in_days = 3

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-nat-flow-logs"
  })
}

# Delivery role — the VPC Flow Logs service assumes this to write into the
# log group above. Scoped to that one log group (and its streams).
resource "aws_iam_role" "nat_flow_logs" {
  count = var.enable_nat_flow_logs && var.use_nat_instance ? 1 : 0

  name = "${local.name_prefix}-nat-flow-logs"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = "sts:AssumeRole"
        Principal = {
          Service = "vpc-flow-logs.amazonaws.com"
        }
        # Confused-deputy guard: only flow logs created in this account may
        # assume the role.
        Condition = {
          StringEquals = {
            "aws:SourceAccount" = local.account_id
          }
        }
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy" "nat_flow_logs" {
  count = var.enable_nat_flow_logs && var.use_nat_instance ? 1 : 0

  name = "${local.name_prefix}-nat-flow-logs"
  role = aws_iam_role.nat_flow_logs[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogGroups",
          "logs:DescribeLogStreams"
        ]
        # A trailing "*" matches ":" too, so this ARN covers the group and
        # every "<group>:log-stream:<name>" beneath it.
        Resource = "${aws_cloudwatch_log_group.nat_flow_logs[0].arn}*"
      }
    ]
  })
}

resource "aws_flow_log" "nat_instance" {
  count = var.enable_nat_flow_logs && var.use_nat_instance ? 1 : 0

  eni_id               = aws_network_interface.nat_instance[0].id
  traffic_type         = "ACCEPT"
  log_destination_type = "cloud-watch-logs"
  log_destination      = aws_cloudwatch_log_group.nat_flow_logs[0].arn
  iam_role_arn         = aws_iam_role.nat_flow_logs[0].arn

  # 60s aggregation keeps per-flow byte counts close to real time so a
  # one-day window is not padded by a 10-minute tail on either side.
  max_aggregation_interval = 60

  # Default (v2) fields first so the record stays readable in the console,
  # then the v3/v5 fields the attribution query depends on:
  #   pkt-srcaddr / pkt-dstaddr — the *original* packet addresses (before the
  #     NAT MASQUERADE rewrote srcaddr), so a flow can be traced back to the
  #     runner that produced it.
  #   flow-direction — lets the query keep only "egress" so each byte is
  #     counted once (see the header comment).
  # scripts/nat-egress-top-destinations.sh parses @message positionally
  # against this exact field order — keep the two in sync.
  log_format = "$${version} $${account-id} $${interface-id} $${srcaddr} $${dstaddr} $${srcport} $${dstport} $${protocol} $${packets} $${bytes} $${start} $${end} $${action} $${log-status} $${pkt-srcaddr} $${pkt-dstaddr} $${flow-direction}"

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-nat-flow-logs"
  })

  # The delivery role's inline policy must exist before the flow log is
  # created — otherwise CreateFlowLogs succeeds but the first delivery attempt
  # fails and the flow log wedges in "Access error" until recreated.
  depends_on = [aws_iam_role_policy.nat_flow_logs]
}
