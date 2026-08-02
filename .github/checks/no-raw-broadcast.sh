#!/usr/bin/env bash
set -euo pipefail

# LS-8882: forbid calling notificationService.broadcast() directly outside
# WebSocketNotificationService. Direct broadcast() calls bypass the typed
# notify*() API and the WireNotificationType registry, letting ad-hoc wire
# payloads drift out of sync with client types (the "4-coordinated-edits"
# contract in lib/utils/src/lib/notification-types.ts). Callers should use
# the typed notify*() helpers on WebSocketNotificationService instead.
echo "Checking for raw broadcast() calls outside WebSocketNotificationService..."

VIOLATIONS=$(grep -rn --include='*.ts' --include='*.tsx' '\.broadcast(' \
  --exclude-dir=node_modules \
  lambdas lib apps 2>/dev/null \
  | grep -v '/notification/WebSocketNotificationService\.ts:' \
  | grep -v '/notification/WebSocketNotificationService\.spec\.ts:' \
  || true)

if [ -n "$VIOLATIONS" ]; then
  echo "Found raw broadcast() calls outside WebSocketNotificationService:"
  echo "$VIOLATIONS"
  echo ""
  echo "Use a typed notify*() helper on WebSocketNotificationService instead of calling broadcast() directly."
  exit 1
fi

echo "No raw broadcast() calls found"
