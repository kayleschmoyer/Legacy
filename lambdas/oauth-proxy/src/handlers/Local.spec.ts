import { APIGatewayEvent } from 'aws-lambda';
import { handleLogin, handleRegister } from './Local';

function makeEvent(body: unknown): APIGatewayEvent {
  return { body: JSON.stringify(body) } as APIGatewayEvent;
}

describe('handleLogin', () => {
  it('returns 400 for missing body', async () => {
    const result = await handleLogin({ body: null } as APIGatewayEvent);
    expect(result.statusCode).toBe(400);
  });

  it('returns 400 for invalid email format', async () => {
    const result = await handleLogin(
      makeEvent({ email: 'not-an-email', password: 'password123' }),
    );
    expect(result.statusCode).toBe(400);
  });

  it('returns 400 for missing password', async () => {
    const result = await handleLogin(
      makeEvent({ email: 'test@example.com', password: '' }),
    );
    expect(result.statusCode).toBe(400);
  });

  it('returns 400 for non-string fields', async () => {
    const result = await handleLogin(
      makeEvent({ email: 123, password: 'password123' }),
    );
    expect(result.statusCode).toBe(400);
  });
});

describe('handleRegister', () => {
  it('returns 400 for missing body', async () => {
    const result = await handleRegister({ body: null } as APIGatewayEvent);
    expect(result.statusCode).toBe(400);
  });

  it('returns 400 for invalid email format', async () => {
    const result = await handleRegister(
      makeEvent({
        email: 'not-an-email',
        password: 'password123',
        confirmPassword: 'password123',
      }),
    );
    expect(result.statusCode).toBe(400);
  });

  it('returns 400 when password is too short', async () => {
    const result = await handleRegister(
      makeEvent({
        email: 'test@example.com',
        password: 'short',
        confirmPassword: 'short',
      }),
    );
    expect(result.statusCode).toBe(400);
    expect((JSON.parse(result.body) as { error: string }).error).toMatch(
      /at least 8 characters/,
    );
  });

  it('returns 400 when passwords do not match', async () => {
    const result = await handleRegister(
      makeEvent({
        email: 'test@example.com',
        password: 'password123',
        confirmPassword: 'different123',
      }),
    );
    expect(result.statusCode).toBe(400);
    expect((JSON.parse(result.body) as { error: string }).error).toMatch(
      /must match/,
    );
  });

  it('returns 400 for non-string fields', async () => {
    const result = await handleRegister(
      makeEvent({
        email: 'test@example.com',
        password: 123,
        confirmPassword: 123,
      }),
    );
    expect(result.statusCode).toBe(400);
  });
});
