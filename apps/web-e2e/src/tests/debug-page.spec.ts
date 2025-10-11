import { expect, test } from '../fixtures/auth';

test.describe('Debug Page Loading', () => {
  test('should load league page and find h1 element with auth bypass', async ({ page }) => {
    console.log('Starting page load test with authentication bypass fixture...');
    
    // Listen to ALL network requests to see what's being called
    page.on('request', request => {
      const requestUrl = request.url();
      console.log(`🌐 Request: ${request.method()} ${requestUrl}`);
      if (request.method() === 'POST' && request.postData()) {
        console.log(`📋 Body: ${request.postData()?.substring(0, 200)}...`);
      }
    });

    page.on('response', response => {
      const responseUrl = response.url();
      console.log(`📥 Response: ${response.status()} ${responseUrl}`);
    });

    page.on('console', msg => {
      if (msg.text().includes('Error') || msg.text().includes('error') || msg.text().includes('Failed')) {
        console.log(`🖥️ Console Error: ${msg.text()}`);
      }
    });
    
    // Go directly to the league page - auth should be handled by fixture
    await page.goto('/baseball/league/1');
    console.log('Navigation completed');
    
    // Wait for any async operations to complete
    await page.waitForTimeout(3000);
    
    // Take screenshot to see what's actually there
    await page.screenshot({ path: 'debug-league-page.png', fullPage: true });
    console.log('Screenshot taken');
    
    // Log page title and URL
    const title = await page.title();
    const url = page.url();
    console.log(`Page title: ${title}`);
    console.log(`Current URL: ${url}`);
    
    // Check what's in the page
    const bodyText = await page.textContent('body');
    console.log('Page content:', bodyText?.substring(0, 500));
    
    // Look for any H1 elements
    const h1Elements = await page.locator('h1').count();
    console.log(`Found ${h1Elements} h1 elements`);
    
    if (h1Elements > 0) {
      const h1Text = await page.locator('h1').first().textContent();
      console.log(`First h1 text: ${h1Text}`);
    }
  });
});
