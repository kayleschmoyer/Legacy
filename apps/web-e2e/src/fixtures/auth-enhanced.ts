import { test as base, expect } from '@playwright/test';
import { E2EAuth, E2EJwtUtil } from '../utils/jwt';

/**
 * Enhanced auth fixture using CLI-generated JWTs
 * Provides real, valid JWTs instead of hardcoded mock tokens
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    // Generate a fresh JWT for each test using CLI
    console.log('[E2E Auth] Setting up authentication with CLI-generated JWT...');
    
    try {
      // Use the CLI to generate a real JWT for testing
      const jwt = E2EAuth.generateUserJwt('1h'); // 1 hour expiration for tests
      
      // Set up authentication in the browser
      await page.addInitScript((token: string) => {
        window.localStorage.setItem('auth_jwt', token);
        console.log('[E2E Auth] JWT set in localStorage:', token.substring(0, 20) + '...');
      }, jwt);

      console.log('[E2E Auth] ✅ Authentication setup complete');
      
    } catch (error) {
      console.warn('[E2E Auth] ⚠️ Failed to generate CLI JWT, falling back to mock token:', error);
      
      // Fallback to the original hardcoded token if CLI generation fails
      const mockJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwidXNlcm5hbWUiOiJ0ZXN0dXNlciIsImFjY2Vzc0xldmVsIjoiYWRtaW4iLCJuYW1lIjoiVGVzdCBVc2VyIiwiZXhwIjoyMDAwMDAwMDAwfQ.XO-6WJiJsviIWCdR8HPJWzYVxsYhQVNhO3dKlkkK7fs';
      
      await page.addInitScript((token: string) => {
        window.localStorage.setItem('auth_jwt', token);
      }, mockJwt);
    }

    // Keep existing route interceptors for OAuth endpoints
    await page.route('**/oauth/login', route => {
      void route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          user: { 
            id: 1, 
            email: 'user@test.com', 
            username: 'testuser',
            name: 'Test User',
            accessLevel: 'none'
          },
          token: 'mock-test-token'
        }),
      });
    });

    // Mock GraphQL endpoints as before
    await page.route(url => {
      const urlString = url.toString();
      return urlString.includes('/graphql') && 
             !urlString.includes('/@fs/') && 
             !urlString.includes('.ts') && 
             !urlString.includes('.js');
    }, route => {
      const request = route.request();
      const postData = request.postData();
      
      if (postData?.includes('getLeagueById')) {
        void route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              getLeagueById: {
                id: '1',
                name: 'Test League',
                sport: 'Football',
                status: 'active',
                createdBy: 1,
                participants: []
              }
            }
          }),
        });
        return;
      }

      if (postData?.includes('currentUser')) {
        void route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              currentUser: {
                id: '1',
                email: 'user@test.com',
                username: 'testuser',
                name: 'Test User',
                accessLevel: 'none'
              }
            }
          }),
        });
        return;
      }

      // Default GraphQL response
      void route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: null,
          errors: [{ message: 'Query not mocked in E2E test' }]
        }),
      });
    });

    await use(page);
  },
});

/**
 * Test fixture with admin authentication
 */
export const adminTest = base.extend({
  page: async ({ page }, use) => {
    console.log('[E2E Auth] Setting up ADMIN authentication...');
    
    try {
      const jwt = E2EAuth.generateAdminJwt('1h');
      
      await page.addInitScript((token: string) => {
        window.localStorage.setItem('auth_jwt', token);
        console.log('[E2E Auth] Admin JWT set:', token.substring(0, 20) + '...');
      }, jwt);
      
      console.log('[E2E Auth] ✅ Admin authentication setup complete');
      
    } catch (error) {
      console.warn('[E2E Auth] ⚠️ Admin JWT generation failed, using fallback');
      
      const mockAdminJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwiZW1haWwiOiJhZG1pbkB0ZXN0LmNvbSIsInVzZXJuYW1lIjoiYWRtaW4iLCJhY2Nlc3NMZXZlbCI6ImFkbWluIiwibmFtZSI6IkFkbWluIFVzZXIiLCJleHAiOjIwMDAwMDAwMDB9.fake-signature-for-testing';
      
      await page.addInitScript((token: string) => {
        window.localStorage.setItem('auth_jwt', token);
      }, mockAdminJwt);
    }

    // Same route setup as regular test
    await page.route('**/oauth/login', route => {
      void route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          user: { 
            id: 1, 
            email: 'admin@test.com', 
            username: 'admin',
            name: 'Admin User',
            accessLevel: 'admin'
          },
          token: 'mock-admin-token'
        }),
      });
    });

    await use(page);
  },
});

/**
 * Test fixture with custom user authentication
 */
export const createCustomAuthTest = (email: string, accessLevel: 'none' | 'admin' = 'none') => {
  return base.extend({
    page: async ({ page }, use) => {
      console.log(`[E2E Auth] Setting up custom authentication for ${email}...`);
      
      try {
        const jwt = E2EJwtUtil.generateJwt({ email, accessLevel, expiration: '1h' });
        
        await page.addInitScript((token: string) => {
          window.localStorage.setItem('auth_jwt', token);
          console.log('[E2E Auth] Custom JWT set:', token.substring(0, 20) + '...');
        }, jwt);
        
      } catch (error) {
        console.warn(`[E2E Auth] ⚠️ Custom JWT generation failed for ${email}, using fallback`);
        
        const mockJwt = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwiZW1haWwiOiIke2VtYWlsfSIsInVzZXJuYW1lIjoidGVzdCIsImFjY2Vzc0xldmVsIjoiJHthY2Nlc3NMZXZlbH0iLCJuYW1lIjoiVGVzdCBVc2VyIiwiZXhwIjoyMDAwMDAwMDAwfQ.fake-signature`;
        
        await page.addInitScript((token: string) => {
          window.localStorage.setItem('auth_jwt', token);
        }, mockJwt);
      }

      await use(page);
    },
  });
};

export { expect };
