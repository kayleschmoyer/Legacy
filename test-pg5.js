const { postgraphile } = require('postgraphile');
const { PostGraphileAmberPreset } = require('postgraphile/presets/amber');
const { makeV4Preset } = require('postgraphile/presets/v4');
const { grafserv } = require('grafserv/express/v4');

// Let's see what presets are available
console.log('PostGraphileAmberPreset:', typeof PostGraphileAmberPreset);
console.log('makeV4Preset:', typeof makeV4Preset);

// Create a simple schema for testing with proper presets
const preset = {
  extends: [
    PostGraphileAmberPreset,
    makeV4Preset({
      legacyRelations: 'omit',
      dynamicJson: true,
    }),
  ],
};

const instance = postgraphile({
  ...preset,
  pgServices: [
    {
      name: 'main',
      pgConfig: {
        connectionString: 'postgresql://test:test@localhost:5432/test',
      },
      schemas: ['public'],
    },
  ],
});

console.log('postgraphile instance:', instance);
console.log('postgraphile instance keys:', Object.keys(instance));
