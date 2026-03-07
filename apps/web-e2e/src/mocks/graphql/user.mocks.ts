/**
 * User & auth GraphQL mock data factories.
 *
 * Use these as defaults when mocking currentUser, userLeagues, etc.
 * Override individual fields per-test as needed.
 */

export interface MockUser {
  __typename: 'User';
  id: number;
  email: string;
  username: string;
  name: string;
  accessLevel: 'none' | 'admin';
}

export function mockUser(overrides: Partial<MockUser> = {}): MockUser {
  return {
    __typename: 'User',
    id: 1,
    email: 'test@example.com',
    username: 'testuser',
    name: 'Test User',
    accessLevel: 'none',
    ...overrides,
  };
}

export function mockAdminUser(overrides: Partial<MockUser> = {}): MockUser {
  return mockUser({
    id: 99,
    email: 'admin@test.com',
    username: 'admin',
    name: 'Admin User',
    accessLevel: 'admin',
    ...overrides,
  });
}

/** Response shape for the `currentUser` query. */
export function currentUserResponse(user?: Partial<MockUser>) {
  return { data: { currentUser: mockUser(user) } };
}
