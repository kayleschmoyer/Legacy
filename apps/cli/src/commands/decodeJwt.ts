import { Argv } from 'yargs';
import { LOGGER } from '@legacy-sports/logging';

interface DecodeJwtArgs {
  token: string;
  pretty?: boolean;
}

interface JwtHeader {
  alg: string;
  typ: string;
  [key: string]: unknown;
}

interface JwtPayload {
  id?: number;
  email?: string;
  username?: string;
  name?: string;
  picture?: string;
  accessLevel?: string;
  isAdmin?: boolean;
  exp?: number;
  iat?: number;
  [key: string]: unknown;
}

export const decodeJwtCommandBuilder = (yargs: Argv) => {
  return yargs
    .option('token', {
      alias: 't',
      describe: 'JWT token to decode',
      type: 'string',
      demandOption: true,
    })
    .option('pretty', {
      alias: 'p',
      describe: 'Pretty print the JSON output',
      type: 'boolean',
      default: true,
    })
    .example('$0 decode-jwt --token eyJhbGciOiJ...', 'Decode a JWT token')
    .example(
      '$0 decode-jwt -t eyJhbGciOiJ... --no-pretty',
      'Decode without pretty printing',
    );
};

export const handleDecodeJwt = (args: DecodeJwtArgs): void => {
  try {
    const { token, pretty } = args;

    LOGGER.info('Decoding JWT token...');

    // Split the JWT into its three parts
    const parts = token.split('.');

    if (parts.length !== 3) {
      throw new Error(
        'Invalid JWT format. JWT should have 3 parts separated by dots.',
      );
    }

    const [headerEncoded, payloadEncoded, signature] = parts;

    // Decode header
    let header: JwtHeader;
    try {
      const headerDecoded = Buffer.from(
        headerEncoded.replace(/-/g, '+').replace(/_/g, '/'),
        'base64',
      ).toString();
      header = JSON.parse(headerDecoded) as JwtHeader;
    } catch (error) {
      throw new Error(
        `Failed to decode JWT header: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Decode payload
    let payload: JwtPayload;
    try {
      const payloadDecoded = Buffer.from(
        payloadEncoded.replace(/-/g, '+').replace(/_/g, '/'),
        'base64',
      ).toString();
      payload = JSON.parse(payloadDecoded) as JwtPayload;
    } catch (error) {
      throw new Error(
        `Failed to decode JWT payload: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Format output
    const result = {
      header,
      payload,
      signature: signature ? 'Present (not decoded for security)' : 'Missing',
      raw: {
        header: headerEncoded,
        payload: payloadEncoded,
        signature: signature || 'Missing',
      },
    };

    console.log('\n=== JWT TOKEN ANALYSIS ===\n');

    if (pretty) {
      console.log('HEADER:');
      console.log(JSON.stringify(header, null, 2));
      console.log('\nPAYLOAD:');
      console.log(JSON.stringify(payload, null, 2));
      console.log('\nSIGNATURE:');
      console.log(signature ? 'Present (not decoded for security)' : 'Missing');

      // Check for common fields
      console.log('\n=== USER INFO ANALYSIS ===');
      console.log('User ID:', payload.id || 'Not present');
      console.log('Email:', payload.email || 'Not present');
      console.log(
        'Username:',
        payload.username || payload.name || 'Not present',
      );
      console.log('Picture/Avatar:', payload.picture || 'Not present');
      console.log('Access Level:', payload.accessLevel || 'Not present');
      console.log('Admin Status:', payload.isAdmin || 'Not present');

      // Check token expiration
      if (payload.exp) {
        const expDate = new Date(payload.exp * 1000);
        const now = new Date();
        const isExpired = expDate < now;
        console.log('\n=== TOKEN EXPIRATION ===');
        console.log('Expires:', expDate.toISOString());
        console.log('Status:', isExpired ? '❌ EXPIRED' : '✅ Valid');
        if (!isExpired) {
          const timeLeft = Math.floor(
            (expDate.getTime() - now.getTime()) / (1000 * 60),
          );
          console.log(
            'Time left:',
            timeLeft > 60
              ? `${Math.floor(timeLeft / 60)}h ${timeLeft % 60}m`
              : `${timeLeft}m`,
          );
        }
      }

      // Check issued at
      if (payload.iat) {
        const issuedDate = new Date(payload.iat * 1000);
        console.log('Issued at:', issuedDate.toISOString());
      }
    } else {
      console.log(JSON.stringify(result, null, 0));
    }

    console.log('\n=== PICTURE FIELD SPECIFIC CHECK ===');
    if (payload.picture) {
      console.log('✅ Picture field is present in JWT');
      console.log('Picture URL:', payload.picture);

      // Basic URL validation
      try {
        const url = new URL(payload.picture);
        console.log('URL Protocol:', url.protocol);
        console.log('URL Host:', url.hostname);
        console.log('URL appears valid: ✅');
      } catch {
        console.log('❌ Picture URL appears to be malformed:', payload.picture);
      }
    } else {
      console.log('❌ Picture field is NOT present in JWT payload');
      console.log(
        'Available fields:',
        Object.keys(payload as Record<string, unknown>).join(', '),
      );
    }

    LOGGER.info('JWT token decoded successfully');
  } catch (error) {
    LOGGER.error(
      'Failed to decode JWT token:',
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  }
};
