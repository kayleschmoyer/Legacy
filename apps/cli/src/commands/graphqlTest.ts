import { ArgumentsCamelCase, Argv } from 'yargs';
import { LOGGER } from '@legacy-sports/logging';
import fs from 'fs/promises';
import path from 'path';
import { CommandArgs } from '../utils/loadEnvFile';
import { AuthMiddleware } from '../services/AuthMiddleware';

interface GraphQLTestArgs extends CommandArgs {
  query?: string;
  file?: string;
  variables?: string;
  user?: string;
  raw?: boolean;
  pretty?: boolean;
  headers?: boolean;
}

export const graphqlTestCommandBuilder = (argv: Argv): Argv =>
  argv
    .option('query', {
      alias: 'q',
      type: 'string',
      describe: 'GraphQL query string to execute',
    })
    .option('file', {
      alias: 'f', 
      type: 'string',
      describe: 'Path to file containing GraphQL query',
    })
    .option('variables', {
      alias: 'v',
      type: 'string',
      describe: 'JSON string of query variables (e.g. \'{"id": 123}\')',
    })
    .option('user', {
      alias: 'u',
      type: 'string',
      describe: 'Email of user to authenticate as (if multiple users)',
    })
    .option('raw', {
      alias: 'r',
      type: 'boolean',
      describe: 'Output raw JSON response without formatting',
      default: false,
    })
    .option('pretty', {
      alias: 'p',
      type: 'boolean',
      describe: 'Pretty print JSON output',
      default: true,
    })
    .option('headers', {
      type: 'boolean',
      describe: 'Include response headers in output',
      default: false,
    })
    .example([
      ['$0 graphql-test --query "query { users { id email } }"', 'Execute simple query'],
      ['$0 graphql-test --file ./queries/users.graphql', 'Execute query from file'],
      ['$0 graphql-test --query "query GetUser($id: Int!) { user(id: $id) { name } }" --variables \'{"id": 123}\'', 'Query with variables'],
      ['$0 graphql-test --query "{ users { id } }" --user admin@example.com', 'Use specific authenticated user'],
      ['$0 graphql-test --query "{ users { id } }" --raw', 'Output raw JSON'],
    ])
    .check((argv) => {
      if (!argv.query && !argv.file) {
        throw new Error('Either --query or --file must be specified');
      }
      if (argv.query && argv.file) {
        throw new Error('Cannot specify both --query and --file');
      }
      return true;
    });

export async function handleGraphQLTest(
  args: ArgumentsCamelCase<GraphQLTestArgs>,
): Promise<void> {
  const { query: queryString, file, variables, user, raw, pretty, headers } = args;

  try {
    // Get the GraphQL query
    let query: string;
    if (queryString) {
      query = queryString;
      LOGGER.info('🔍 Executing GraphQL query from command line...');
    } else if (file) {
      LOGGER.info(`📂 Loading GraphQL query from file: ${file}`);
      query = await loadQueryFromFile(file);
    } else {
      throw new Error('No query specified');
    }

    // Parse variables if provided
    let parsedVariables: Record<string, any> = {};
    if (variables) {
      try {
        parsedVariables = JSON.parse(variables);
        LOGGER.info(`📝 Using variables: ${JSON.stringify(parsedVariables, null, 2)}`);
      } catch (error) {
        throw new Error(`Invalid JSON in variables: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Set up authentication
    const authMiddleware = new AuthMiddleware();
    
    // Check if authenticated
    const currentUser = await authMiddleware.getCurrentUser();
    if (!currentUser) {
      LOGGER.error('❌ Authentication required to test GraphQL queries');
      LOGGER.info('💡 Run "cli auth login" to authenticate, then try again');
      return;
    }

    const targetUser = user || currentUser.email;
    LOGGER.info(`🔐 Authenticating as: ${targetUser} (${currentUser.accessLevel})`);

    // Display query info
    LOGGER.info('\n📋 Query Details:');
    LOGGER.info('─'.repeat(60));
    LOGGER.info('Query:');
    console.log(formatQuery(query));
    
    if (Object.keys(parsedVariables).length > 0) {
      LOGGER.info('\nVariables:');
      console.log(JSON.stringify(parsedVariables, null, 2));
    }
    LOGGER.info('─'.repeat(60));

    // Execute the query
    LOGGER.info('\n⚡ Executing query...');
    const startTime = Date.now();

    try {
      const response = await authMiddleware.makeAuthenticatedRequest(
        authMiddleware.getGraphQLUrl(),
        {
          method: 'POST',
          body: JSON.stringify({ 
            query: query.trim(),
            variables: parsedVariables 
          }),
          userEmail: targetUser,
        }
      );

      const executionTime = Date.now() - startTime;
      
      // Handle response
      if (headers) {
        LOGGER.info('\n📨 Response Headers:');
        LOGGER.info('─'.repeat(40));
        // Convert headers to plain object for display
        const headerObj: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          headerObj[key] = value;
        });
        for (const [key, value] of Object.entries(headerObj)) {
          LOGGER.info(`${key}: ${value}`);
        }
        LOGGER.info('─'.repeat(40));
      }

      const responseData = await response.json();
      
      LOGGER.info(`\n✅ Query completed in ${executionTime}ms`);
      LOGGER.info(`📊 Status: ${response.status} ${response.statusText}`);
      
      // Output results
      if (raw) {
        console.log(JSON.stringify(responseData));
      } else {
        displayGraphQLResponse(responseData, pretty ?? true);
      }

    } catch (error) {
      const executionTime = Date.now() - startTime;
      LOGGER.error(`❌ Query failed after ${executionTime}ms`);
      
      if (error instanceof Error) {
        if (error.message.includes('Authentication token is invalid')) {
          LOGGER.error('🔑 Authentication token is invalid or expired');
          LOGGER.info('💡 Run "cli auth login" to refresh your authentication');
        } else if (error.message.includes('Access denied')) {
          LOGGER.error('🚫 Access denied - insufficient permissions');
          LOGGER.info(`Current access level: ${currentUser.accessLevel}`);
        } else {
          LOGGER.error(`Error: ${error.message}`);
        }
      } else {
        LOGGER.error('Unknown error occurred');
      }
      throw error;
    }

  } catch (error) {
    if (error instanceof Error && error.message.includes('Authentication required')) {
      // Already handled above
      return;
    }
    LOGGER.error('Failed to execute GraphQL test:', error instanceof Error ? error.message : String(error));
    throw error;
  }
}

/**
 * Load GraphQL query from file
 */
async function loadQueryFromFile(filePath: string): Promise<string> {
  try {
    // Handle relative paths
    const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
    
    const query = await fs.readFile(resolvedPath, 'utf-8');
    
    if (!query.trim()) {
      throw new Error('Query file is empty');
    }
    
    return query;
  } catch (error) {
    if (error instanceof Error && error.message.includes('ENOENT')) {
      throw new Error(`Query file not found: ${filePath}`);
    }
    throw error;
  }
}

/**
 * Format GraphQL query for display
 */
function formatQuery(query: string): string {
  // Basic GraphQL formatting (could be enhanced with a proper formatter)
  return query
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/{\s*/g, '{\n  ') // Opening braces
    .replace(/\s*}/g, '\n}') // Closing braces  
    .replace(/,\s*/g, ',\n  ') // Commas
    .trim();
}

/**
 * Display GraphQL response with formatting
 */
function displayGraphQLResponse(responseData: any, pretty: boolean): void {
  LOGGER.info('\n📋 Response:');
  LOGGER.info('═'.repeat(60));
  
  // Check for GraphQL errors
  if (responseData.errors && responseData.errors.length > 0) {
    LOGGER.info('❌ GraphQL Errors:');
    responseData.errors.forEach((error: any, index: number) => {
      LOGGER.info(`\n  Error ${index + 1}:`);
      LOGGER.info(`    Message: ${error.message}`);
      if (error.locations) {
        LOGGER.info(`    Location: Line ${error.locations[0].line}, Column ${error.locations[0].column}`);
      }
      if (error.path) {
        LOGGER.info(`    Path: ${error.path.join('.')}`);
      }
    });
    LOGGER.info('');
  }
  
  // Display data
  if (responseData.data) {
    LOGGER.info('✅ Data:');
    if (pretty) {
      console.log(JSON.stringify(responseData.data, null, 2));
    } else {
      console.log(JSON.stringify(responseData.data));
    }
  } else if (!responseData.errors) {
    LOGGER.info('⚠️  No data returned');
  }
  
  // Display extensions (if any)
  if (responseData.extensions) {
    LOGGER.info('\n📎 Extensions:');
    console.log(JSON.stringify(responseData.extensions, null, 2));
  }
  
  LOGGER.info('═'.repeat(60));
}
