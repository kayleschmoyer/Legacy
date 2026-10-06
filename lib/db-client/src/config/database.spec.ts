import { checkServerIdentity, type PeerCertificate } from 'tls';
import { applyDbTunnel, type DatabaseConfig } from './database';

jest.mock('tls', () => ({
  checkServerIdentity: jest.fn().mockReturnValue(undefined),
}));

const RDS_HOST =
  'legacy-sports-dev-postgres.abc123.us-east-1.rds.amazonaws.com';

const secretConfig = (): DatabaseConfig => ({
  database: 'postgres',
  host: RDS_HOST,
  port: 5432,
  user: 'admin',
  password: 'pw',
  ssl: { rejectUnauthorized: true },
});

describe('applyDbTunnel (LS-10609)', () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.DB_TUNNEL;
    delete process.env.LAMBDA_TASK_ROOT;
    delete process.env.AWS_LAMBDA_FUNCTION_NAME;
  });

  afterAll(() => {
    process.env = savedEnv;
  });

  it('returns the config unchanged when DB_TUNNEL is unset', () => {
    const config = secretConfig();
    expect(applyDbTunnel(config)).toBe(config);
  });

  it('swaps the endpoint and keeps TLS verification against the RDS host', () => {
    process.env.DB_TUNNEL = 'localhost:15432';

    const result = applyDbTunnel(secretConfig());

    expect(result.host).toBe('localhost');
    expect(result.port).toBe(15432);
    expect(result.ssl?.rejectUnauthorized).toBe(true);
    expect(result.ssl?.servername).toBe(RDS_HOST);

    const cert = {} as PeerCertificate;
    result.ssl?.checkServerIdentity?.('localhost', cert);
    expect(checkServerIdentity).toHaveBeenCalledWith(RDS_HOST, cert);
  });

  it('defaults the tunnel port to 5432', () => {
    process.env.DB_TUNNEL = 'localhost';
    expect(applyDbTunnel(secretConfig()).port).toBe(5432);
  });

  it('leaves ssl undefined for non-TLS (local) configs', () => {
    process.env.DB_TUNNEL = 'localhost:5432';
    const result = applyDbTunnel({ ...secretConfig(), ssl: undefined });
    expect(result.host).toBe('localhost');
    expect(result.ssl).toBeUndefined();
  });

  it('is ignored inside Lambda', () => {
    process.env.DB_TUNNEL = 'localhost:5432';
    process.env.AWS_LAMBDA_FUNCTION_NAME = 'legacy-sports-dev-db';
    const config = secretConfig();
    expect(applyDbTunnel(config)).toBe(config);
  });

  it('rejects a malformed DB_TUNNEL', () => {
    process.env.DB_TUNNEL = 'localhost:notaport';
    expect(() => applyDbTunnel(secretConfig())).toThrow(/DB_TUNNEL must be/);
  });
});
