// WebDriverIO configuration for React Native E2E testing
const path = require('path');

exports.config = {
  //
  // ====================
  // Runner Configuration
  // ====================
  runner: 'local',

  //
  // ==================
  // Specify Test Files
  // ==================
  specs: ['./src/**/*.e2e.js'],

  // Patterns to exclude.
  exclude: [
    // 'path/to/excluded/files'
  ],

  //
  // ============
  // Capabilities
  // ============
  maxInstances: 1,
  capabilities: [
    {
      // Android configuration
      platformName: 'Android',
      'appium:deviceName': 'Android Emulator',
      'appium:platformVersion': '13',
      'appium:automationName': 'UiAutomator2',
      'appium:app': path.join(
        process.cwd(),
        'android/app/build/outputs/apk/debug/app-debug.apk',
      ),
      'appium:appWaitActivity': '.MainActivity',
      'appium:newCommandTimeout': 240,
      'appium:autoGrantPermissions': true,
    },
  ],

  //
  // ===================
  // Test Configurations
  // ===================
  logLevel: 'info',
  bail: 0,
  baseUrl: 'http://localhost',
  waitforTimeout: 10000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,

  //
  // =====
  // Hooks
  // =====
  services: [
    [
      'appium',
      {
        args: {
          address: 'localhost',
          port: 4723,
          relaxedSecurity: true,
        },
        logPath: './logs',
      },
    ],
  ],

  framework: 'mocha',
  reporters: ['spec'],

  mochaOpts: {
    ui: 'bdd',
    timeout: 60000,
  },

  //
  // =====
  // Hooks
  // =====
  /**
   * Gets executed once before all workers get launched.
   */
  onPrepare: function (config, capabilities) {
    console.log('🚀 Starting E2E tests with Appium + WebDriverIO');
  },

  /**
   * Gets executed before a worker process is spawned and can be used to initialize the test environment.
   */
  onWorkerStart: function (cid, caps, specs, args, execArgv) {
    console.log(`Worker ${cid} started`);
  },

  /**
   * Gets executed just before initialising the webdriver session and test framework.
   */
  beforeSession: function (config, capabilities, specs) {
    console.log('📱 Connecting to mobile device...');
  },

  /**
   * Gets executed before test execution begins.
   */
  before: function (capabilities, specs) {
    // Set implicit wait
    driver.setTimeout({ implicit: 10000 });
  },

  /**
   * Gets executed after all tests are done.
   */
  after: function (result, capabilities, specs) {
    console.log('✅ E2E tests completed');
  },

  /**
   * Gets executed after all workers got shut down and the process is about to exit.
   */
  onComplete: function (exitCode, config, capabilities, results) {
    console.log('🏁 All E2E tests finished');
  },
};
