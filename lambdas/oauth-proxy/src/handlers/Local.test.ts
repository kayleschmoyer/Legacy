import { APIGatewayEvent } from 'aws-lambda';
import { handleRegister } from './Local';

describe('Local', () => {
  it.skip('Runs Against the Server', async () => {
    await handleRegister({
      body: JSON.stringify({
        confirmPassword: 'test',
        email: 'bkrupa21@gmail.com',
        password: 'test',
      }),
    } as APIGatewayEvent);
  });
});
