// Set required environment variables for unit tests
process.env['NODE_ENV'] = 'test';
process.env['STRIPE_WEBHOOK_SECRET'] = 'whsec_test_secret';
process.env['STRIPE_SECRET_KEY'] = 'sk_test_fake';
process.env['CONNECTIONS_TABLE_NAME'] = 'test-connections-table';
