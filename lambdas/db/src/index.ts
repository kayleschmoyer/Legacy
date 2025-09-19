import { ApolloServer } from '@apollo/server';
import {
  handlers,
  startServerAndCreateLambdaHandler,
} from '@as-integrations/aws-lambda';
import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import { schema } from './schema';

// CORS headers constant
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, X-Requested-With',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

// Create Apollo Server instance
const server = new ApolloServer({
  schema,
  // Enable introspection and playground in development
  introspection: process.env.NODE_ENV !== 'production',
});

// Create the base handler
const baseHandler = startServerAndCreateLambdaHandler(
  server,
  handlers.createAPIGatewayProxyEventRequestHandler(),
);

// Wrapper handler that adds CORS headers
export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context,
): Promise<APIGatewayProxyResult> => {
  console.log('Lambda handler invoked with method:', event.httpMethod);

  // Handle preflight OPTIONS requests
  if (event.httpMethod === 'OPTIONS') {
    console.log('Handling OPTIONS request');
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: '',
    };
  }

  try {
    console.log('Calling Apollo Server handler...');
    // Call the Apollo Server handler with proper callback handling
    const result = await new Promise<APIGatewayProxyResult>(
      (resolve, reject) => {
        void baseHandler(event, context, (error, result) => {
          if (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          } else if (result) {
            resolve(result);
          } else {
            reject(new Error('No result from Apollo Server'));
          }
        });
      },
    );

    console.log('Apollo Server result status:', result.statusCode);
    console.log('Apollo Server result headers:', result.headers);

    // Ensure CORS headers are added to all responses
    const enhancedResult: APIGatewayProxyResult = {
      ...result,
      statusCode: result.statusCode,
      body: result.body || '',
      headers: {
        // Start with CORS headers first
        ...CORS_HEADERS,
        // Then add any headers from Apollo Server
        ...(result.headers || {}),
        // But ensure CORS headers are preserved
        ...CORS_HEADERS,
      },
    };

    console.log('Enhanced result headers:', enhancedResult.headers);
    return enhancedResult;
  } catch (error) {
    console.error('Lambda handler error:', error);
    return {
      statusCode: 500,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};
