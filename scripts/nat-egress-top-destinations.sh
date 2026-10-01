#!/usr/bin/env bash
# Summarise NAT-instance egress by destination from VPC flow logs (LS-10334).
#
# Companion to terraform/main/nat-flow-logs.tf. Once `enable_nat_flow_logs`
# has been on for a busy CI day, this runs a CloudWatch Logs Insights query
# over the NAT ENI flow log and prints three tables:
#
#   1. top destination IPs by egress bytes
#   2. top destination /24 prefixes by egress bytes (rolled up locally)
#   3. top destination ports by egress bytes
#
# and, with --asn, annotates each top IP with its origin AS via Team Cymru's
# whois service — that is the "top-10 destination ASNs/prefixes" table the
# ticket asks for.
#
# The Insights query filters to flow-direction = egress. On the NAT ENI every
# forwarded packet is logged twice (ingress: runner → internet, egress:
# NAT → internet after MASQUERADE), so keeping one direction counts each byte
# exactly once. Private/VPC-internal destinations are excluded.
#
# Usage:
#   scripts/nat-egress-top-destinations.sh [--start <ISO8601|epoch>] [--end <ISO8601|epoch>]
#                                          [--hours N] [--limit N] [--asn]
#                                          [--log-group NAME] [--region R] [--profile P]
#
# Defaults: last 24h, limit 25, log group /aws/vpc/legacy-sports-dev-nat-flow-logs.
# Requires: aws CLI v2 with credentials that can run logs:StartQuery /
# logs:GetQueryResults on the log group; `whois` on PATH for --asn.
#
# Example (one busy day, with ASN attribution, paste-ready markdown):
#   scripts/nat-egress-top-destinations.sh --start 2026-10-01T00:00:00Z --end 2026-10-02T00:00:00Z --asn

set -euo pipefail

LOG_GROUP="/aws/vpc/legacy-sports-dev-nat-flow-logs"
LIMIT=25
HOURS=24
START=""
END=""
ASN=0
REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"
PROFILE="${AWS_PROFILE:-}"

usage() { sed -n '2,32p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --start) START="$2"; shift 2 ;;
    --end) END="$2"; shift 2 ;;
    --hours) HOURS="$2"; shift 2 ;;
    --limit) LIMIT="$2"; shift 2 ;;
    --log-group) LOG_GROUP="$2"; shift 2 ;;
    --region) REGION="$2"; shift 2 ;;
    --profile) PROFILE="$2"; shift 2 ;;
    --asn) ASN=1; shift ;;
    -h|--help) usage 0 ;;
    *) echo "unknown argument: $1" >&2; usage 1 ;;
  esac
done

for dep in aws python3; do
  command -v "$dep" >/dev/null 2>&1 || { echo "error: '$dep' is required on PATH" >&2; exit 1; }
done
if [[ $ASN -eq 1 ]] && ! command -v whois >/dev/null 2>&1; then
  echo "error: --asn needs 'whois' on PATH (Team Cymru lookup)" >&2
  exit 1
fi

AWS=(aws --region "$REGION")
[[ -n "$PROFILE" ]] && AWS+=(--profile "$PROFILE")

# Accept ISO-8601 or epoch seconds; default window is the last $HOURS hours.
to_epoch() {
  local v="$1"
  if [[ "$v" =~ ^[0-9]+$ ]]; then echo "$v"; return; fi
  python3 - "$v" <<'PY'
import sys, datetime
v = sys.argv[1].replace("Z", "+00:00")
dt = datetime.datetime.fromisoformat(v)
if dt.tzinfo is None:
    dt = dt.replace(tzinfo=datetime.timezone.utc)
print(int(dt.timestamp()))
PY
}

NOW=$(date -u +%s)
END_EPOCH=$([[ -n "$END" ]] && to_epoch "$END" || echo "$NOW")
START_EPOCH=$([[ -n "$START" ]] && to_epoch "$START" || echo $((END_EPOCH - HOURS * 3600)))
if (( START_EPOCH >= END_EPOCH )); then
  echo "error: --start must be before --end" >&2
  exit 1
fi

# Field order MUST match log_format in terraform/main/nat-flow-logs.tf.
# Insights auto-discovers fields only for the default flow-log format, so a
# custom format has to be parsed positionally out of @message.
# Insights caps `limit` at 10000; we pull the full per-(ip,port) breakdown and
# roll it up locally so the /24 table is not truncated by a top-N cut.
read -r -d '' QUERY <<'EOQ' || true
parse @message "* * * * * * * * * * * * * * * * *" as version, account, eni, srcaddr, dstaddr, srcport, dstport, protocol, packets, bytes, start, end, action, logStatus, pktSrcaddr, pktDstaddr, flowDirection
| filter action = "ACCEPT" and flowDirection = "egress" and logStatus = "OK"
| filter not (dstaddr like /^10\./ or dstaddr like /^192\.168\./ or dstaddr like /^172\.(1[6-9]|2[0-9]|3[01])\./ or dstaddr like /^169\.254\./)
| stats sum(bytes) as totalBytes, sum(packets) as totalPackets, count(*) as flows by dstaddr, dstport, protocol
| sort totalBytes desc
| limit 10000
EOQ

echo "Log group : $LOG_GROUP ($REGION)" >&2
echo "Window    : $(date -u -d "@$START_EPOCH" +%FT%TZ 2>/dev/null || date -u -r "$START_EPOCH" +%FT%TZ) → $(date -u -d "@$END_EPOCH" +%FT%TZ 2>/dev/null || date -u -r "$END_EPOCH" +%FT%TZ)" >&2

QUERY_ID=$("${AWS[@]}" logs start-query \
  --log-group-name "$LOG_GROUP" \
  --start-time "$START_EPOCH" \
  --end-time "$END_EPOCH" \
  --query-string "$QUERY" \
  --limit 10000 \
  --query queryId --output text)

echo "Query id  : $QUERY_ID (polling…)" >&2
RESULTS=""
for _ in $(seq 1 120); do
  RESULTS=$("${AWS[@]}" logs get-query-results --query-id "$QUERY_ID" --output json)
  STATUS=$(printf '%s' "$RESULTS" | python3 -c 'import json,sys; print(json.load(sys.stdin)["status"])')
  case "$STATUS" in
    Complete) break ;;
    Failed|Cancelled|Timeout) echo "error: query $STATUS" >&2; exit 1 ;;
    *) sleep 2 ;;
  esac
done
[[ "$STATUS" == "Complete" ]] || { echo "error: query did not complete in time (status=$STATUS)" >&2; exit 1; }

# Roll up + render. ASN lookups go through Team Cymru's bulk whois interface so
# N IPs cost one TCP round-trip, not N.
printf '%s' "$RESULTS" | python3 - "$LIMIT" "$ASN" <<'PY'
import json, subprocess, sys
from collections import defaultdict

limit, want_asn = int(sys.argv[1]), sys.argv[2] == "1"
data = json.load(sys.stdin)
rows = [{f["field"]: f["value"] for f in r} for r in data.get("results", [])]
stats = data.get("statistics", {})

by_ip, by_prefix, by_port = defaultdict(int), defaultdict(int), defaultdict(int)
flows_ip = defaultdict(int)
total = 0
for r in rows:
    b = int(float(r.get("totalBytes", 0)))
    ip, port, proto = r.get("dstaddr", "?"), r.get("dstport", "?"), r.get("protocol", "?")
    total += b
    by_ip[ip] += b
    flows_ip[ip] += int(float(r.get("flows", 0)))
    by_prefix[".".join(ip.split(".")[:3]) + ".0/24" if ip.count(".") == 3 else ip] += b
    by_port[f"{port}/{ {'6':'tcp','17':'udp','1':'icmp'}.get(proto, proto) }"] += b

def human(n):
    for unit in ("B", "KiB", "MiB", "GiB", "TiB"):
        if n < 1024 or unit == "TiB":
            return f"{n:.1f} {unit}" if unit != "B" else f"{n} B"
        n /= 1024

def pct(n):
    return f"{(100.0 * n / total):.1f}%" if total else "0%"

asn = {}
if want_asn and by_ip:
    top_ips = [ip for ip, _ in sorted(by_ip.items(), key=lambda kv: -kv[1])[:limit]]
    bulk = "begin\nverbose\n" + "\n".join(top_ips) + "\nend\n"
    try:
        out = subprocess.run(["whois", "-h", "whois.cymru.com", bulk],
                             capture_output=True, text=True, timeout=30).stdout
        for line in out.splitlines():
            parts = [p.strip() for p in line.split("|")]
            if len(parts) >= 7 and parts[0].isdigit():
                # AS | IP | BGP Prefix | CC | Registry | Allocated | AS Name
                asn[parts[1]] = (f"AS{parts[0]}", parts[2], parts[6])
    except Exception as e:  # noqa: BLE001 — annotation is best-effort
        print(f"warn: ASN lookup failed: {e}", file=sys.stderr)

print(f"\nScanned {stats.get('recordsScanned', '?')} records, {len(rows)} (ip,port,proto) rows, "
      f"total egress {human(total)} ({total} bytes)\n")

print(f"## Top {limit} destination IPs by egress bytes\n")
hdr = "| # | dstaddr | bytes | % | flows |" + (" AS | BGP prefix | AS name |" if want_asn else "")
print(hdr)
print("|" + "---|" * (hdr.count("|") - 1))
for i, (ip, b) in enumerate(sorted(by_ip.items(), key=lambda kv: -kv[1])[:limit], 1):
    line = f"| {i} | {ip} | {human(b)} | {pct(b)} | {flows_ip[ip]} |"
    if want_asn:
        a = asn.get(ip, ("?", "?", "?"))
        line += f" {a[0]} | {a[1]} | {a[2]} |"
    print(line)

print(f"\n## Top {limit} destination /24 prefixes by egress bytes\n")
print("| # | prefix | bytes | % |")
print("|---|---|---|---|")
for i, (p, b) in enumerate(sorted(by_prefix.items(), key=lambda kv: -kv[1])[:limit], 1):
    print(f"| {i} | {p} | {human(b)} | {pct(b)} |")

print(f"\n## Top {limit} destination ports by egress bytes\n")
print("| # | port/proto | bytes | % |")
print("|---|---|---|---|")
for i, (p, b) in enumerate(sorted(by_port.items(), key=lambda kv: -kv[1])[:limit], 1):
    print(f"| {i} | {p} | {human(b)} | {pct(b)} |")
PY
