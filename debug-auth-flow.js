// Authentication Debug Script
// Run this in browser console to debug the auth flow

console.log('=== Legacy Sports Authentication Debug ===');

// 1. Check localStorage items
console.log('\n--- 1. LocalStorage Check ---');
const allStorage = { ...localStorage };
console.log('All localStorage items:', allStorage);

const legacySportsItems = Object.keys(localStorage).filter(
  (key) =>
    key.includes('legacy_sports') ||
    key.includes('INTERNAL_JWT') ||
    key.includes('GOOGLE_JWT'),
);
console.log('Legacy Sports related items:', legacySportsItems);

legacySportsItems.forEach((key) => {
  console.log(`${key}:`, localStorage.getItem(key));
});

// 2. Check if tokens exist with expected keys
console.log('\n--- 2. Token Storage Check ---');
console.log('INTERNAL_JWT (direct):', localStorage.getItem('INTERNAL_JWT'));
console.log(
  'INTERNAL_JWT (prefixed):',
  localStorage.getItem('legacy_sports_secure_INTERNAL_JWT'),
);
console.log(
  'GOOGLE_JWT (prefixed):',
  localStorage.getItem('legacy_sports_secure_GOOGLE_JWT'),
);

// 3. Check OAuth stored data
console.log('\n--- 3. OAuth Data Check ---');
console.log(
  'oauth_auth_code:',
  localStorage.getItem('legacy_sports_secure_oauth_auth_code'),
);
console.log(
  'oauth_credential:',
  localStorage.getItem('legacy_sports_secure_oauth_credential'),
);
console.log(
  'oauth_user_info:',
  localStorage.getItem('legacy_sports_secure_oauth_user_info'),
);

// 4. Try to manually decode any JWT found
console.log('\n--- 4. JWT Decode Check ---');
legacySportsItems.forEach((key) => {
  const value = localStorage.getItem(key);
  if (value && value.includes('.')) {
    try {
      // Basic JWT structure check
      const parts = value.split('.');
      if (parts.length === 3) {
        console.log(`${key} appears to be a JWT`);
        // Decode payload (middle part)
        const payload = JSON.parse(atob(parts[1]));
        console.log(`${key} payload:`, payload);
      }
    } catch (e) {
      console.log(`${key} JWT decode failed:`, e.message);
    }
  }
});

// 5. Check AuthService if available globally
console.log('\n--- 5. AuthService Check ---');
if (typeof window !== 'undefined') {
  // Try to find AuthService in common global locations
  const possibleLocations = [
    'authService',
    '_authService',
    'legacySports.authService',
    'app.authService',
  ];

  possibleLocations.forEach((path) => {
    try {
      const service = path.split('.').reduce((obj, key) => obj?.[key], window);
      if (service && typeof service.getState === 'function') {
        console.log(`Found AuthService at window.${path}`);
        console.log(`${path} state:`, service.getState());
      }
    } catch (e) {
      // Silent fail - service not found at this path
    }
  });
}

console.log('\n=== Debug Complete ===');
console.log('Copy this output and share it to help diagnose the issue.');
