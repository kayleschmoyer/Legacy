import test from 'node:test';
import assert from 'node:assert/strict';
import { formatManagerQuotaOverCapError } from './global-setup';

// LS-9867: pre-flight quota over-cap detection must fail fast with a clear
// reason instead of letting affected specs time out ~30-50 minutes later.

void test('formatManagerQuotaOverCapError names every over-cap persona with its count', () => {
  const message = formatManagerQuotaOverCapError([
    { persona: 'MANAGER_2', total: 6 },
  ]);
  assert.match(message, /MANAGER_2 \(6\/3\)/);
  assert.match(message, /free-tier league cap/);
});

void test('formatManagerQuotaOverCapError aggregates multiple over-cap personas into one message', () => {
  const message = formatManagerQuotaOverCapError([
    { persona: 'MANAGER_1', total: 3 },
    { persona: 'MANAGER_2', total: 6 },
  ]);
  assert.match(message, /MANAGER_1 \(3\/3\)/);
  assert.match(message, /MANAGER_2 \(6\/3\)/);
});
