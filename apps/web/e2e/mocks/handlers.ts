import { http, HttpResponse } from 'msw';

// Mock GraphQL API responses
export const graphqlHandlers = [
  // Example GraphQL query mock
  http.post('/graphql', async ({ request }) => {
    const body = await request.json();
    const { query } = body as { query: string; variables?: Record<string, unknown> };

    // Mock user authentication query
    if (query.includes('currentUser')) {
      return HttpResponse.json({
        data: {
          currentUser: {
            id: '1',
            email: 'test@example.com',
            name: 'Test User',
          },
        },
      });
    }

    // Mock sports data query
    if (query.includes('sports')) {
      return HttpResponse.json({
        data: {
          sports: [
            {
              id: '1',
              name: 'Football',
              category: 'Team Sport',
            },
            {
              id: '2',
              name: 'Basketball',
              category: 'Team Sport',
            },
          ],
        },
      });
    }

    // Default empty response
    return HttpResponse.json({
      data: null,
      errors: [{ message: 'Query not mocked' }],
    });
  }),
];

// Mock REST API responses
export const restHandlers = [
  // OAuth endpoints
  http.get('/api/auth/user', () => {
    return HttpResponse.json({
      id: '1',
      email: 'test@example.com',
      name: 'Test User',
      isAuthenticated: true,
    });
  }),

  http.post('/api/auth/login', () => {
    return HttpResponse.json({
      success: true,
      token: 'mock-jwt-token',
      user: {
        id: '1',
        email: 'test@example.com',
        name: 'Test User',
      },
    });
  }),

  http.post('/api/auth/logout', () => {
    return HttpResponse.json({ success: true });
  }),

  // Lambda function endpoints
  http.get('/api/game-selection', () => {
    return HttpResponse.json({
      games: [
        {
          id: '1',
          homeTeam: 'Team A',
          awayTeam: 'Team B',
          startTime: '2025-09-05T19:00:00Z',
          sport: 'Football',
        },
      ],
    });
  }),
];

export const handlers = [...graphqlHandlers, ...restHandlers];
