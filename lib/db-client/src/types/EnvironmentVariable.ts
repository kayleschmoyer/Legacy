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

  // SSL override: set to 'true' ONLY for legacy environments where the RDS
  // certificate chain has not been updated to Amazon Root CA (rds-ca-rsa2048-g1
  // or later). Setting this in production is a security risk; prefer updating
  // the RDS cert instead. Must NOT be set when USE_LOCAL_CREDENTIALS=true since
  // local connections skip SSL entirely.
  DB_SSL_SELF_SIGNED = 'DB_SSL_SELF_SIGNED',
}
