import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { LOGGER } from '@legacy-sports/logging';
import crypto from 'crypto';
import { parseEventBody } from '../util/lambda';

// In-memory storage for device authorization flows
// In production, this should use Redis or DynamoDB for persistence across Lambda instances
interface DeviceAuthFlow {
  deviceCode: string;
  userCode: string;
  clientType: string;
  deviceName: string;
  expiresAt: number;
  completed: boolean;
  tokenResponse?: {
    jwt: string;
    user: any;
    refreshToken?: string;
  };
}

// Simple in-memory storage (would use Redis/DynamoDB in production)
const deviceFlows = new Map<string, DeviceAuthFlow>();
const userCodeToDeviceCode = new Map<string, string>();

// Clean up expired flows periodically
setInterval(() => {
  const now = Date.now();
  for (const [deviceCode, flow] of deviceFlows.entries()) {
    if (now > flow.expiresAt) {
      deviceFlows.delete(deviceCode);
      userCodeToDeviceCode.delete(flow.userCode);
      LOGGER.debug(`Cleaned up expired device flow: ${deviceCode}`);
    }
  }
}, 5 * 60 * 1000); // Clean up every 5 minutes

interface DeviceAuthRequest {
  client_type: string;
  device_name?: string;
}

interface DeviceTokenRequest {
  device_code: string;
}

/**
 * Generate a user-friendly code (shorter, easier to type)
 */
function generateUserCode(): string {
  // Generate 6-character alphanumeric code (excluding confusing characters)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generate a secure device code
 */
function generateDeviceCode(): string {
  return crypto.randomBytes(32).toString('hex');
}

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

    // Generate codes
    const deviceCode = generateDeviceCode();
    const userCode = generateUserCode();
    
    // Store the authorization flow
    const expiresIn = 10 * 60; // 10 minutes
    const flow: DeviceAuthFlow = {
      deviceCode,
      userCode,
      clientType: body.client_type,
      deviceName: body.device_name || 'CLI',
      expiresAt: Date.now() + (expiresIn * 1000),
      completed: false,
    };

    deviceFlows.set(deviceCode, flow);
    userCodeToDeviceCode.set(userCode, deviceCode);

    // Get the base URL for the verification URI
    const baseUrl = getBaseUrl(event);
    const verificationUri = `${baseUrl}/oauth/device/verify`;

    LOGGER.info(`Device authorization created: ${userCode} -> ${deviceCode}`);

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
        interval: 5, // Poll every 5 seconds
      }),
    };

  } catch (error) {
    LOGGER.error('Device authorization error:', error instanceof Error ? error.message : String(error));
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

    const flow = deviceFlows.get(body.device_code);
    if (!flow) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'invalid_request',
          message: 'Invalid or expired device code',
        }),
      };
    }

    // Check if expired
    if (Date.now() > flow.expiresAt) {
      deviceFlows.delete(body.device_code);
      userCodeToDeviceCode.delete(flow.userCode);
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'expired_token',
          message: 'Device code has expired',
        }),
      };
    }

    // Check if user has completed authorization
    if (!flow.completed || !flow.tokenResponse) {
      return {
        statusCode: 428, // Custom status for "authorization_pending"
        body: JSON.stringify({
          error: 'authorization_pending',
          message: 'User has not completed authorization yet',
        }),
      };
    }

    // Authorization complete - return tokens
    LOGGER.info(`Device token granted for: ${flow.tokenResponse.user.email}`);
    
    // Clean up the flow
    deviceFlows.delete(body.device_code);
    userCodeToDeviceCode.delete(flow.userCode);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(flow.tokenResponse),
    };

  } catch (error) {
    LOGGER.error('Device token error:', error instanceof Error ? error.message : String(error));
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
    // Show page with user code input
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html',
      },
      body: getVerificationHtml(),
    };
  }

  // Check if user code is valid
  const deviceCode = userCodeToDeviceCode.get(userCode.toUpperCase());
  if (!deviceCode) {
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html',
      },
      body: getVerificationHtml('Invalid or expired code. Please try again.'),
    };
  }

  const flow = deviceFlows.get(deviceCode);
  if (!flow || Date.now() > flow.expiresAt) {
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html',
      },
      body: getVerificationHtml('Code has expired. Please restart authentication in your CLI.'),
    };
  }

  // Redirect to OAuth flow with state parameter to track the device flow
  const baseUrl = getBaseUrl(event);
  const state = deviceCode; // Use device code as state parameter
  const googleAuthUrl = `${baseUrl}/oauth/google/authorize?state=${state}`;

  return {
    statusCode: 302,
    headers: {
      Location: googleAuthUrl,
    },
    body: '',
  };
};

/**
 * Complete device flow after OAuth success
 * This should be called from the main OAuth handler when it detects a device flow state
 */
export const completeDeviceFlow = (deviceCode: string, tokenResponse: any): void => {
  const flow = deviceFlows.get(deviceCode);
  if (flow && !flow.completed && Date.now() <= flow.expiresAt) {
    flow.completed = true;
    flow.tokenResponse = tokenResponse;
    LOGGER.info(`Device flow completed for: ${tokenResponse.user?.email}`);
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
    <title>Legacy Sports CLI - Device Verification</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 400px;
            margin: 100px auto;
            padding: 20px;
            text-align: center;
            background-color: #f5f5f5;
        }
        .container {
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .logo {
            color: #2563eb;
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 20px;
        }
        input[type="text"] {
            padding: 12px;
            font-size: 18px;
            border: 2px solid #ddd;
            border-radius: 4px;
            margin: 10px;
            text-align: center;
            letter-spacing: 2px;
            text-transform: uppercase;
            width: 150px;
        }
        button {
            padding: 12px 24px;
            font-size: 16px;
            background-color: #2563eb;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            margin-top: 10px;
        }
        button:hover {
            background-color: #1d4ed8;
        }
        .error {
            color: #dc2626;
            margin: 10px 0;
        }
        .success {
            color: #16a34a;
            margin: 10px 0;
        }
        .instructions {
            color: #666;
            margin: 20px 0;
            line-height: 1.5;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">🏈 Legacy Sports CLI</div>
        
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
            <button type="submit">Continue</button>
        </form>
        
        <div class="instructions">
            After clicking Continue, you'll be redirected to complete<br>
            the OAuth authentication with your Google account.
        </div>
    </div>
    
    <script>
        // Auto-format user code input
        const input = document.querySelector('input[name="user_code"]');
        input.addEventListener('input', function(e) {
            e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        });
    </script>
</body>
</html>
  `;
}
