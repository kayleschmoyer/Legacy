export enum EnvironmentVariable {
  // New unified credential system
  DB_SECRET_NAME = 'DB_SECRET_NAME',
  USE_LOCAL_CREDENTIALS = 'USE_LOCAL_CREDENTIALS',

  // Legacy environment variables (still supported for backward compatibility)
  DB_CREDS_PATH = 'DB_CREDS_PATH', // Legacy alias for DB_SECRET_NAME
  DB_HOST = 'DB_HOST',
  DB_USER = 'DB_USER',
  DB_PASSWORD = 'DB_PASSWORD',
  DB_NAME = 'DB_NAME',
  DB_CERT_PATH = 'DB_CERT_PATH',
}
