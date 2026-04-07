import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  DeleteItemCommand,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { LOGGER } from '@legacy-sports/logging';

import { getUserByEmail } from '@legacy-sports/db-client';
import crypto from 'crypto';
import { parseEventBody } from '../util/lambda';
import { testPassword } from '../Users';
import { createJwt } from '../util/jwt';
import { withDbClient } from '../util/db';
import { getAuthSuccessHtml } from '../util/html';

interface User {
  id: number;
  email: string;
  username: string;
  accessLevel: string;
}

interface DeviceAuthFlow {
  deviceCode: string;
  userCode: string;
  clientType: string;
  deviceName: string;
  expiresAt: number;
  completed: boolean;
  tokenResponse?: {
    jwt: string;
    user: User;
    refreshToken?: string;
  };
}

interface DeviceAuthRequest {
  client_type: string;
  device_name?: string;
}

interface DeviceTokenRequest {
  device_code: string;
}

interface DeviceCompleteLocalRequest {
  user_code: string;
  email: string;
  password: string;
}

export interface TokenResponse {
  jwt: string;
  user: User;
  refreshToken?: string;
}

// ---------------------------------------------------------------------------
// Storage backend: DynamoDB when DEVICE_FLOW_TABLE_NAME is set; otherwise
// in-memory Maps (local dev only — not safe for production multi-instance use).
// ---------------------------------------------------------------------------

const TABLE_NAME = process.env.DEVICE_FLOW_TABLE_NAME;

// Lazy-initialised DynamoDB client — only created when the table name is set
let dynamoClient: DynamoDBClient | null = null;

function getDynamoClient(): DynamoDBClient {
  if (!dynamoClient) {
    dynamoClient = new DynamoDBClient({
      region: process.env.AWS_REGION ?? 'us-east-1',
    });
  }
  return dynamoClient;
}

// ---------------------------------------------------------------------------
// In-memory fallback (local dev)
// ---------------------------------------------------------------------------

const inMemoryFlows = new Map<string, DeviceAuthFlow>();
const inMemoryUserCodeIndex = new Map<string, string>(); // userCode → deviceCode

// Clean up expired in-memory flows periodically (dev only)
export const cleanupIntervalHandle = setInterval(
  () => {
    const now = Date.now();
    for (const [deviceCode, flow] of inMemoryFlows.entries()) {
      if (now > flow.expiresAt) {
        inMemoryFlows.delete(deviceCode);
        inMemoryUserCodeIndex.delete(flow.userCode);
        LOGGER.debug(`Cleaned up expired device flow: ${deviceCode}`);
      }
    }
  },
  5 * 60 * 1000,
);

// ---------------------------------------------------------------------------
// DynamoDB storage operations
// ---------------------------------------------------------------------------

async function dynamoPutFlow(flow: DeviceAuthFlow): Promise<void> {
  const client = getDynamoClient();
  // TTL must be epoch seconds; expiresAt is epoch milliseconds
  const ttlSeconds = Math.floor(flow.expiresAt / 1000);

  await client.send(
    new PutItemCommand({
      TableName: TABLE_NAME,
      Item: {
        deviceCode: { S: flow.deviceCode },
        userCode: { S: flow.userCode },
        clientType: { S: flow.clientType },
        deviceName: { S: flow.deviceName },
        expiresAt: { N: String(flow.expiresAt) },
        ttl: { N: String(ttlSeconds) },
        completed: { BOOL: flow.completed },
      },
    }),
  );
}

async function dynamoGetFlow(
  deviceCode: string,
): Promise<DeviceAuthFlow | null> {
  const client = getDynamoClient();
  const response = await client.send(
    new GetItemCommand({
      TableName: TABLE_NAME,
      Key: { deviceCode: { S: deviceCode } },
    }),
  );

  const item = response.Item;
  if (!item) return null;

  return {
    deviceCode: item.deviceCode.S ?? '',
    userCode: item.userCode.S ?? '',
    clientType: item.clientType.S ?? '',
    deviceName: item.deviceName.S ?? '',
    expiresAt: Number(item.expiresAt.N),
    completed: item.completed.BOOL ?? false,
    tokenResponse: item.tokenResponseJson?.S
      ? (JSON.parse(item.tokenResponseJson.S) as TokenResponse)
      : undefined,
  };
}

async function dynamoDeleteFlow(
  deviceCode: string,
  userCode: string,
): Promise<void> {
  const client = getDynamoClient();
  await client.send(
    new DeleteItemCommand({
      TableName: TABLE_NAME,
      Key: { deviceCode: { S: deviceCode } },
    }),
  );
  LOGGER.debug('Deleted device flow from DynamoDB', {
    deviceCodePrefix: deviceCode.slice(0, 6),
    userCode,
  });
}

async function dynamoGetDeviceCodeByUserCode(
  userCode: string,
): Promise<string | null> {
  const client = getDynamoClient();
  const response = await client.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'userCode-index',
      KeyConditionExpression: 'userCode = :uc',
      ExpressionAttributeValues: { ':uc': { S: userCode } },
      ProjectionExpression: 'deviceCode',
      Limit: 1,
    }),
  );

  const item = response.Items?.[0];
  return item?.deviceCode?.S ?? null;
}

async function dynamoCompleteFlow(
  deviceCode: string,
  tokenResponse: TokenResponse,
): Promise<void> {
  const client = getDynamoClient();
  await client.send(
    new UpdateItemCommand({
      TableName: TABLE_NAME,
      Key: { deviceCode: { S: deviceCode } },
      UpdateExpression: 'SET completed = :t, tokenResponseJson = :tr',
      ConditionExpression: 'completed = :f AND expiresAt > :now',
      ExpressionAttributeValues: {
        ':t': { BOOL: true },
        ':f': { BOOL: false },
        ':tr': { S: JSON.stringify(tokenResponse) },
        ':now': { N: String(Date.now()) },
      },
    }),
  );
}

// ---------------------------------------------------------------------------
// Unified storage API (dispatches to DynamoDB or in-memory)
// ---------------------------------------------------------------------------

async function storeFlow(flow: DeviceAuthFlow): Promise<void> {
  if (TABLE_NAME) {
    await dynamoPutFlow(flow);
  } else {
    inMemoryFlows.set(flow.deviceCode, flow);
    inMemoryUserCodeIndex.set(flow.userCode, flow.deviceCode);
  }
}

async function getFlow(deviceCode: string): Promise<DeviceAuthFlow | null> {
  if (TABLE_NAME) {
    return dynamoGetFlow(deviceCode);
  }
  return inMemoryFlows.get(deviceCode) ?? null;
}

async function deleteFlow(deviceCode: string, userCode: string): Promise<void> {
  if (TABLE_NAME) {
    await dynamoDeleteFlow(deviceCode, userCode);
  } else {
    inMemoryFlows.delete(deviceCode);
    inMemoryUserCodeIndex.delete(userCode);
  }
}

async function resolveDeviceCodeFromUserCode(
  userCode: string,
): Promise<string | null> {
  if (TABLE_NAME) {
    return dynamoGetDeviceCodeByUserCode(userCode);
  }
  return inMemoryUserCodeIndex.get(userCode) ?? null;
}

async function markFlowComplete(
  deviceCode: string,
  tokenResponse: TokenResponse,
): Promise<void> {
  if (TABLE_NAME) {
    await dynamoCompleteFlow(deviceCode, tokenResponse);
  } else {
    const flow = inMemoryFlows.get(deviceCode);
    if (flow && !flow.completed && Date.now() <= flow.expiresAt) {
      flow.completed = true;
      flow.tokenResponse = tokenResponse;
    }
  }
}

// ---------------------------------------------------------------------------
// Code generators
// ---------------------------------------------------------------------------

function generateUserCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generateDeviceCode(): string {
  return crypto.randomBytes(32).toString('hex');
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

/**
 * Handle device authorization request (step 1 of device flow)
 */
export const handleDeviceAuthorize = async (
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> => {
  LOGGER.info('Device authorization request received');

  try {
    const body = parseEventBody<DeviceAuthRequest>(event);

    if (body.client_type !== 'cli') {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'invalid_client',
          message: 'Only CLI clients are supported for device flow',
        }),
      };
    }

    const deviceCode = generateDeviceCode();
    const userCode = generateUserCode();

    const expiresIn = 10 * 60; // 10 minutes
    const flow: DeviceAuthFlow = {
      deviceCode,
      userCode,
      clientType: body.client_type,
      deviceName: body.device_name || 'CLI',
      expiresAt: Date.now() + expiresIn * 1000,
      completed: false,
    };

    await storeFlow(flow);

    const baseUrl = getBaseUrl(event);
    const verificationUri = `${baseUrl}/oauth/device/verify`;

    LOGGER.info('Device authorization created', {
      userCodeSuffix: userCode.slice(-2),
      deviceCodePrefix: deviceCode.slice(0, 6),
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        device_code: deviceCode,
        user_code: userCode,
        verification_uri: verificationUri,
        verification_uri_complete: `${verificationUri}?user_code=${userCode}`,
        expires_in: expiresIn,
        interval: 5,
      }),
    };
  } catch (error) {
    LOGGER.error(
      'Device authorization error:',
      error instanceof Error ? error : new Error(String(error)),
      { handler: 'handleDeviceAuthorize' },
    );
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'server_error',
        message: 'Device authorization failed',
      }),
    };
  }
};

/**
 * Handle device token request (polling endpoint)
 */
export const handleDeviceToken = async (
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> => {
  LOGGER.debug('Device token request received');

  try {
    const body = parseEventBody<DeviceTokenRequest>(event);

    const flow = await getFlow(body.device_code);
    if (!flow) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'invalid_request',
          message: 'Invalid or expired device code',
        }),
      };
    }

    if (Date.now() > flow.expiresAt) {
      await deleteFlow(body.device_code, flow.userCode);
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'expired_token',
          message: 'Device code has expired',
        }),
      };
    }

    if (!flow.completed || !flow.tokenResponse) {
      return {
        statusCode: 428,
        body: JSON.stringify({
          error: 'authorization_pending',
          message: 'User has not completed authorization yet',
        }),
      };
    }

    LOGGER.info(
      `Device token granted (user ID: ${flow.tokenResponse.user.id})`,
    );

    await deleteFlow(body.device_code, flow.userCode);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(flow.tokenResponse),
    };
  } catch (error) {
    LOGGER.error(
      'Device token error:',
      error instanceof Error ? error : new Error(String(error)),
      { handler: 'handleDeviceToken' },
    );
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'server_error',
        message: 'Token request failed',
      }),
    };
  }
};

/**
 * Handle device verification page (web interface for user to complete flow)
 */
export const handleDeviceVerify = async (
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> => {
  LOGGER.info('Device verification page requested');

  const userCode = event.queryStringParameters?.user_code;

  if (!userCode) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      body: getVerificationHtml(),
    };
  }

  try {
    const deviceCode = await resolveDeviceCodeFromUserCode(
      userCode.toUpperCase(),
    );
    if (!deviceCode) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/html' },
        body: getVerificationHtml('Invalid or expired code. Please try again.'),
      };
    }

    const flow = await getFlow(deviceCode);
    if (!flow || Date.now() > flow.expiresAt) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/html' },
        body: getVerificationHtml(
          'Code has expired. Please restart authentication in your CLI.',
        ),
      };
    }

    const baseUrl = getBaseUrl(event);
    const googleAuthUrl = `${baseUrl}/oauth/google/authorize?state=${deviceCode}`;

    return {
      statusCode: 302,
      headers: { Location: googleAuthUrl },
      body: '',
    };
  } catch (error) {
    LOGGER.error(
      'Device verify error:',
      error instanceof Error ? error.message : String(error),
    );
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      body: getVerificationHtml('An error occurred. Please try again.'),
    };
  }
};

/**
 * Complete device flow after OAuth success.
 * Called from the Google OAuth callback handler when it detects a device flow state.
 */
export const completeDeviceFlow = async (
  deviceCode: string,
  tokenResponse: TokenResponse,
): Promise<void> => {
  try {
    await markFlowComplete(deviceCode, tokenResponse);
    LOGGER.info(`Device flow completed (user ID: ${tokenResponse.user.id})`);
  } catch (error) {
    LOGGER.error(
      'Failed to complete device flow:',
      error instanceof Error ? error.message : String(error),
    );
  }
};

/**
 * Complete device flow using local email/password credentials.
 * Allows test users (or any user with a password hash) to authenticate
 * via the device flow without requiring Google OAuth.
 */
export const handleDeviceCompleteLocal = async (
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> => {
  LOGGER.info('Device flow local auth completion requested');

  try {
    const body = parseEventBody<DeviceCompleteLocalRequest>(event);
    const { user_code, email, password } = body;

    if (!user_code || !email || !password) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'invalid_request',
          message: 'user_code, email, and password are required',
        }),
      };
    }

    const deviceCode = await resolveDeviceCodeFromUserCode(
      user_code.toUpperCase(),
    );
    if (!deviceCode) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'invalid_code',
          message: 'Invalid or expired user code',
        }),
      };
    }

    const flow = await getFlow(deviceCode);
    if (!flow || Date.now() > flow.expiresAt) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'expired_token',
          message: 'Device code has expired',
        }),
      };
    }

    // Authenticate with local credentials
    return await withDbClient(async (db) => {
      const user = await getUserByEmail(db, email);

      if (!user?.passwordHash) {
        return {
          statusCode: 401,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            error: 'invalid_credentials',
            message: 'Invalid email or password',
          }),
        };
      }

      const isCorrect = await testPassword(password, user.passwordHash);
      if (!isCorrect) {
        return {
          statusCode: 401,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            error: 'invalid_credentials',
            message: 'Invalid email or password',
          }),
        };
      }

      const internalJwt = await createJwt(user);

      const tokenResponse: TokenResponse = {
        jwt: internalJwt,
        user: {
          id: user.id,
          email: user.email,
          username: user.username || user.email,
          accessLevel: user.accessLevel || 'none',
        },
      };

      await completeDeviceFlow(deviceCode, tokenResponse);

      LOGGER.info(`Device flow completed via local auth (user ID: ${user.id})`);

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
        body: getAuthSuccessHtml(user.email),
      };
    });
  } catch (error) {
    LOGGER.error(
      'Device flow local auth error:',
      error instanceof Error ? error : new Error(String(error)),
      { handler: 'handleDeviceCompleteLocal' },
    );
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'server_error',
        message: 'Local authentication failed',
      }),
    };
  }
};

/**
 * Get base URL from API Gateway event
 */
function getBaseUrl(event: APIGatewayEvent): string {
  const stage = event.requestContext.stage;
  const domainName = event.requestContext.domainName;
  return `https://${domainName}/${stage}`;
}

/**
 * Generate HTML for device verification page
 */
function getVerificationHtml(error?: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
    <title>Legacy Sports - Device Verification</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <!-- System fonts only — no third-party font CDN on auth surfaces -->
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            background-color: #0A0F1A;
            background-image:
                radial-gradient(ellipse at 50% 0%, rgba(27, 58, 92, 0.4) 0%, transparent 60%),
                radial-gradient(ellipse at 80% 100%, rgba(196, 30, 58, 0.08) 0%, transparent 50%);
            color: #F8FAFC;
        }
        .container {
            background: #16223A;
            padding: 40px 36px;
            border-radius: 12px;
            border: 1px solid #1F2D48;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
            max-width: 420px;
            width: 100%;
            text-align: center;
        }
        .logo {
            font-family: Georgia, 'Times New Roman', serif;
            font-size: 22px;
            font-weight: 700;
            color: #C5A55A;
            letter-spacing: 0.5px;
            margin-bottom: 8px;
        }
        .logo span { color: #F8FAFC; }
        h2 {
            font-family: Georgia, 'Times New Roman', serif;
            font-size: 18px;
            font-weight: 700;
            color: #F8FAFC;
            margin-bottom: 20px;
        }
        .error {
            background: rgba(196, 30, 58, 0.12);
            border: 1px solid rgba(196, 30, 58, 0.3);
            color: #E63950;
            padding: 10px 14px;
            border-radius: 8px;
            font-size: 13px;
            margin-bottom: 16px;
        }
        .instructions {
            color: #9CAAC5;
            font-size: 14px;
            line-height: 1.6;
            margin: 16px 0;
        }
        .instructions strong { color: #F8FAFC; }
        input[type="text"] {
            padding: 14px;
            font-size: 20px;
            font-family: 'Inter', monospace;
            font-weight: 600;
            background: #0D1526;
            border: 2px solid #1F2D48;
            border-radius: 8px;
            color: #F8FAFC;
            text-align: center;
            letter-spacing: 4px;
            text-transform: uppercase;
            width: 180px;
            outline: none;
            transition: border-color 0.2s;
        }
        input[type="text"]:focus {
            border-color: #C5A55A;
        }
        input[type="text"]::placeholder {
            color: #4A5568;
            letter-spacing: 4px;
        }
        .btn-primary {
            display: inline-block;
            padding: 12px 32px;
            font-family: 'Inter', sans-serif;
            font-size: 15px;
            font-weight: 600;
            background: linear-gradient(135deg, #1B3A5C, #2C4A7C);
            color: #F8FAFC;
            border: 1px solid rgba(197, 165, 90, 0.3);
            border-radius: 8px;
            cursor: pointer;
            margin-top: 14px;
            transition: all 0.2s;
        }
        .btn-primary:hover {
            background: linear-gradient(135deg, #2C4A7C, #3B5A9C);
            border-color: rgba(197, 165, 90, 0.5);
            box-shadow: 0 4px 12px rgba(27, 58, 92, 0.4);
        }
        .btn-secondary {
            display: inline-block;
            padding: 10px 24px;
            font-family: 'Inter', sans-serif;
            font-size: 14px;
            font-weight: 600;
            background: rgba(197, 165, 90, 0.12);
            color: #C5A55A;
            border: 1px solid rgba(197, 165, 90, 0.25);
            border-radius: 8px;
            cursor: pointer;
            margin-top: 10px;
            transition: all 0.2s;
        }
        .btn-secondary:hover {
            background: rgba(197, 165, 90, 0.2);
            border-color: rgba(197, 165, 90, 0.4);
        }
        .divider {
            border: none;
            border-top: 1px solid #1F2D48;
            margin: 24px 0;
        }
        .local-input {
            padding: 10px 14px;
            font-family: 'Inter', sans-serif;
            font-size: 14px;
            background: #0D1526;
            border: 2px solid #1F2D48;
            border-radius: 8px;
            color: #F8FAFC;
            width: 220px;
            margin: 5px 0;
            outline: none;
            transition: border-color 0.2s;
        }
        .local-input:focus {
            border-color: #C5A55A;
        }
        .local-input::placeholder {
            color: #4A5568;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">Legacy <span>Sports</span></div>

        <h2>Device Authorization</h2>

        ${error ? `<div class="error">${error}</div>` : ''}

        <div class="instructions">
            Enter the 6-character code displayed in your CLI:
        </div>

        <form method="get">
            <input
                type="text"
                name="user_code"
                placeholder="ABC123"
                maxlength="6"
                autocomplete="off"
                autofocus
                required
            />
            <br>
            <button type="submit" class="btn-primary">Continue</button>
        </form>

        <div class="instructions">
            After clicking Continue, you'll be redirected to complete<br>
            the OAuth authentication with your Google account.
        </div>

        <hr class="divider">

        <div class="instructions"><strong>Or log in with a local account:</strong></div>

        <form method="post" action="/oauth/device/complete-local" id="localForm" style="margin-top: 10px;">
            <input type="hidden" name="user_code" id="localUserCode" />
            <input
                type="email"
                name="email"
                placeholder="Email"
                class="local-input"
                required
            /><br>
            <input
                type="password"
                name="password"
                placeholder="Password"
                class="local-input"
                required
            /><br>
            <button type="submit" class="btn-secondary">Log In Locally</button>
        </form>
    </div>

    <script>
        // Auto-format user code input
        const input = document.querySelector('input[name="user_code"]');
        input.addEventListener('input', function(e) {
            e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        });

        // Sync user_code to the local login form and submit as JSON
        const localForm = document.getElementById('localForm');
        const codeInput = document.querySelector('input[name="user_code"]');
        const localCodeInput = document.getElementById('localUserCode');

        // Keep hidden input synced
        if (codeInput) {
            codeInput.addEventListener('input', function() {
                localCodeInput.value = codeInput.value;
            });
            // Also read from URL on page load
            const params = new URLSearchParams(window.location.search);
            const codeFromUrl = params.get('user_code');
            if (codeFromUrl) {
                localCodeInput.value = codeFromUrl.toUpperCase();
                codeInput.value = codeFromUrl.toUpperCase();
            }
        }

        localForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const formData = new FormData(localForm);
            try {
                const response = await fetch('/oauth/device/complete-local', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        user_code: formData.get('user_code'),
                        email: formData.get('email'),
                        password: formData.get('password'),
                    }),
                });
                if (response.ok) {
                    const html = await response.text();
                    document.open();
                    document.write(html);
                    document.close();
                } else {
                    const data = await response.json();
                    const errDiv = document.querySelector('.error');
                    if (errDiv) {
                        errDiv.textContent = data.message || 'Login failed';
                    } else {
                        const div = document.createElement('div');
                        div.className = 'error';
                        div.textContent = data.message || 'Login failed';
                        localForm.insertBefore(div, localForm.firstChild);
                    }
                }
            } catch (err) {
                const div = document.createElement('div');
                div.className = 'error';
                div.textContent = 'Network error. Please try again.';
                localForm.insertBefore(div, localForm.firstChild);
            }
        });
    </script>
</body>
</html>
  `;
}
