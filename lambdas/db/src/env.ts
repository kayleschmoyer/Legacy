import { config } from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'fs';

// Load environment variables from the workspace root
// Load .env first as base, then .env.local to override (dotenv doesn't override existing vars by default)
const envPath = resolve(__dirname, '../../.env');
const envLocalPath = resolve(__dirname, '../../.env.local');

if (existsSync(envPath)) {
  config({ path: envPath });
}
if (existsSync(envLocalPath)) {
  config({ path: envLocalPath, override: true });
}

export {};
