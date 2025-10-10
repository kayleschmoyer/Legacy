// Test script to debug the SQS queue URL issue
const fs = require('fs');
const path = require('path');

// Simulate dotenv loading
const { config } = require('dotenv');
const envPath = path.resolve(__dirname, '.env');
const envLocalPath = path.resolve(__dirname, '.env.local');

if (fs.existsSync(envPath)) {
  console.log('Loading .env file');
  config({ path: envPath });
}
if (fs.existsSync(envLocalPath)) {
  console.log('Loading .env.local file');
  config({ path: envLocalPath, override: true });
}

console.log('=== Environment Debug ===');
console.log('SQS_AUTOMATIC_DRAFTS_URL:', JSON.stringify(process.env.SQS_AUTOMATIC_DRAFTS_URL));
console.log('Type:', typeof process.env.SQS_AUTOMATIC_DRAFTS_URL);
console.log('Truthy:', !!process.env.SQS_AUTOMATIC_DRAFTS_URL);
console.log('Length:', process.env.SQS_AUTOMATIC_DRAFTS_URL?.length);

// Test the exact condition from the mutation
const queueUrl = process.env.SQS_AUTOMATIC_DRAFTS_URL;
console.log('queueUrl:', JSON.stringify(queueUrl));
console.log('!queueUrl:', !queueUrl);

if (!queueUrl) {
  console.log('❌ This should throw: Draft queue URL not configured');
} else {
  console.log('✅ Queue URL is configured:', queueUrl);
}
