/**
 * League Creation E2E Tests
 * 
 * This test suite validates the complete league creation flow including:
 * - Navigation to league create page
 * - Form validation and error handling
 * - GraphQL integration and API calls
 * - UI state management during creation
 * - Successful league creation and navigation
 */

import { expect } from '@playwright/test';
import { test } from '../fixtures/auth';

test.describe('League Creation', () => {
  
  test('should navigate to league creation page from homepage', async ({ page }) => {
    // Navigate to baseball homepage
    await page.goto('/baseball');
    
    // Wait for page to load and verify authentication
    await expect(page.locator('h1')).toContainText('Welcome to Baseball');
    
    // Click Create League button
    await page.getByRole('button', { name: /create league/i }).click();
    
    // Verify navigation to league creation page
    await expect(page).toHaveURL('/baseball/league/create');
    await expect(page.locator('h1')).toContainText('Create New League');
  });

  test('should display form validation errors', async ({ page }) => {
    // Navigate directly to league creation page
    await page.goto('/baseball/league/create');
    
    // Try to submit form without required fields
    const createButton = page.getByRole('button', { name: /create league/i });
    await expect(createButton).toBeDisabled(); // Should be disabled when no league name
    
    // Enter invalid league name (too short)
    const leagueNameInput = page.getByPlaceholder('Enter your league name');
    await leagueNameInput.fill('Ab'); // Less than 3 characters
    
    // Try to submit with invalid name length
    await createButton.click();
    
    // Should show validation error
    await expect(page.locator('text=League name must be at least 3 characters long')).toBeVisible();
  });

  test('should create league successfully with valid data', async ({ page }) => {
    // Navigate to league creation page
    await page.goto('/baseball/league/create');
    
    // Fill in valid league data
    const leagueName = `Test League ${Date.now()}`;
    await page.getByPlaceholder('Enter your league name').fill(leagueName);
    
    // Select number of teams (different from default 10)
    await page.getByRole('button', { name: '12' }).click();
    
    // Select draft type
    await page.getByRole('button', { name: /blind draft/i }).click();
    
    // Set future draft date
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 14); // 2 weeks from now
    const dateString = futureDate.toISOString().split('T')[0]; // YYYY-MM-DD format
    
    await page.getByLabel('Draft Date').fill(dateString);
    
    // Submit form
    await page.getByRole('button', { name: /create league/i }).click();
    
    // Verify loading state
    await expect(page.getByText('Creating...')).toBeVisible();
    
    // Wait for successful creation and navigation
    // The form should navigate to the new league page
    await expect(page).toHaveURL(/\/baseball\/league\/\d+/, { timeout: 10000 });
    
    // Verify we're on a league page with the correct name
    await expect(page.locator('h1')).toContainText(leagueName, { timeout: 5000 });
  });

  test('should handle GraphQL errors gracefully', async ({ page }) => {
    // Mock GraphQL error response
    await page.route('/graphql', async (route) => {
      const request = route.request();
      const body = await request.postDataJSON();
      
      // Intercept createLeagueAndTeams mutation
      if (body.operationName === 'CreateLeagueAndTeams' || body.query?.includes('createLeagueAndTeams')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: null,
            errors: [{
              message: 'League name already exists',
              extensions: {
                code: 'DUPLICATE_LEAGUE_NAME'
              }
            }]
          })
        });
      } else {
        await route.continue();
      }
    });
    
    // Navigate to league creation page
    await page.goto('/baseball/league/create');
    
    // Fill in form data
    await page.getByPlaceholder('Enter your league name').fill('Duplicate League Name');
    
    // Submit form
    await page.getByRole('button', { name: /create league/i }).click();
    
    // Verify error is displayed
    await expect(page.locator('text=League name already exists')).toBeVisible();
    
    // Verify form stays on same page
    await expect(page).toHaveURL('/baseball/league/create');
  });

  test('should validate all form fields correctly', async ({ page }) => {
    await page.goto('/baseball/league/create');
    
    // Test league name validation
    const leagueNameInput = page.getByPlaceholder('Enter your league name');
    
    // Test minimum length
    await leagueNameInput.fill('A');
    await expect(page.getByRole('button', { name: /create league/i })).toBeDisabled();
    
    // Test maximum length (over 50 characters)
    const longName = 'A'.repeat(51);
    await leagueNameInput.fill(longName);
    await page.getByRole('button', { name: /create league/i }).click();
    await expect(page.locator('text=League name must be less than 50 characters')).toBeVisible();
    
    // Test valid name
    await leagueNameInput.fill('Valid League Name');
    await expect(page.getByRole('button', { name: /create league/i })).not.toBeDisabled();
    
    // Test team count options
    const teamCountButtons = page.locator('[role="button"]').filter({ hasText: /^(6|8|10|12|14|16)$/ });
    await expect(teamCountButtons).toHaveCount(6);
    
    // Test draft type options
    await expect(page.getByRole('button', { name: /standard draft/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /blind draft/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /random draft/i })).toBeVisible();
  });

  test('should show informational content about league creation', async ({ page }) => {
    await page.goto('/baseball/league/create');
    
    // Verify informational card is present
    await expect(page.locator('text=What happens next?')).toBeVisible();
    
    // Check for key information points
    await expect(page.locator('text=Your league will be created with the specified number of teams')).toBeVisible();
    await expect(page.locator('text=You\'ll be set as the league commissioner')).toBeVisible();
    await expect(page.locator('text=Teams will be auto-generated and ready for member assignment')).toBeVisible();
    await expect(page.locator('text=You can invite friends to join your league after creation')).toBeVisible();
  });

  test('should allow canceling league creation', async ({ page }) => {
    await page.goto('/baseball/league/create');
    
    // Fill in some form data
    await page.getByPlaceholder('Enter your league name').fill('Test League');
    
    // Click cancel button
    await page.getByRole('button', { name: /cancel/i }).click();
    
    // Should navigate back to baseball homepage
    await expect(page).toHaveURL('/baseball');
    await expect(page.locator('h1')).toContainText('Welcome to Baseball');
  });

  test('should preserve form state during selection changes', async ({ page }) => {
    await page.goto('/baseball/league/create');
    
    // Fill in league name
    const testName = 'State Preservation Test';
    await page.getByPlaceholder('Enter your league name').fill(testName);
    
    // Change team count
    await page.getByRole('button', { name: '8' }).click();
    
    // Change draft type
    await page.getByRole('button', { name: /blind draft/i }).click();
    
    // Verify league name is still there
    await expect(page.getByPlaceholder('Enter your league name')).toHaveValue(testName);
    
    // Verify selections are applied
    await expect(page.getByRole('button', { name: '8' })).toHaveClass(/selected|active|primary/);
    await expect(page.getByRole('button', { name: /blind draft/i })).toHaveClass(/selected|active|primary/);
  });

  test('should handle date picker interactions', async ({ page }) => {
    await page.goto('/baseball/league/create');
    
    // Find date input
    const dateInput = page.getByLabel('Draft Date');
    await expect(dateInput).toBeVisible();
    
    // Set a future date
    const futureDate = new Date();
    futureDate.setMonth(futureDate.getMonth() + 1);
    const dateString = futureDate.toISOString().split('T')[0];
    
    await dateInput.fill(dateString);
    
    // Verify date was set
    await expect(dateInput).toHaveValue(dateString);
    
    // Try to set a past date (should show error)
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1);
    const pastDateString = pastDate.toISOString().split('T')[0];
    
    await dateInput.fill(pastDateString);
    
    // Fill other required fields
    await page.getByPlaceholder('Enter your league name').fill('Date Test League');
    
    // Try to submit
    await page.getByRole('button', { name: /create league/i }).click();
    
    // Should show validation error for past date
    await expect(page.locator('text=Draft date must be in the future')).toBeVisible();
  });

  test('should display loading state during submission', async ({ page }) => {
    // Mock slow GraphQL response to test loading state
    await page.route('/graphql', async (route) => {
      const request = route.request();
      const body = await request.postDataJSON();
      
      if (body.operationName === 'CreateLeagueAndTeams' || body.query?.includes('createLeagueAndTeams')) {
        // Add delay to simulate slow response
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              createLeagueAndTeams: {
                league: {
                  id: 999,
                  name: 'Loading Test League',
                  owner: 1,
                  maxRosterSize: 25,
                  currentMatchup: null,
                  draftStatus: 'not-started'
                }
              }
            }
          })
        });
      } else {
        await route.continue();
      }
    });
    
    await page.goto('/baseball/league/create');
    
    // Fill in form
    await page.getByPlaceholder('Enter your league name').fill('Loading Test League');
    
    // Submit form
    await page.getByRole('button', { name: /create league/i }).click();
    
    // Verify loading state
    await expect(page.getByText('Creating...')).toBeVisible();
    
    // Verify button is disabled during loading
    await expect(page.getByRole('button', { name: /creating/i })).toBeDisabled();
    
    // Wait for completion
    await expect(page).toHaveURL('/baseball/league/999', { timeout: 10000 });
  });
});
