import type { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { LOGGER } from '@legacy-sports/logging';
import {
  buildClearAuthCookies,
  CSRF_HEADER,
  validateCsrf,
} from '../util/jwt-cookie';

/**
 * Handle logout by clearing the HttpOnly JWT and CSRF cookies.
 * Validates CSRF token to prevent cross-site logout attacks.
 */
export function handleLogout(event: APIGatewayEvent): APIGatewayProxyResult {
  const cookieHeader = event.headers['Cookie'] ?? event.headers['cookie'];
  const csrfHeaderValue =
    event.headers[CSRF_HEADER] ?? event.headers['X-CSRF-Token'];

  if (!validateCsrf(csrfHeaderValue, cookieHeader)) {
    LOGGER.warn('handleLogout: CSRF validation failed');
    return {
      statusCode: 403,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'CSRF validation failed' }),
    };
  }

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
    },
    multiValueHeaders: {
      'Set-Cookie': buildClearAuthCookies(),
    },
    body: JSON.stringify({ success: true }),
  };
}
