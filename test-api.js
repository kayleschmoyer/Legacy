const { postgraphile } = require('postgraphile');
const {
  PostGraphileAmberPreset,
} = require('./node_modules/postgraphile/dist/presets/amber.js');
const {
  makeV4Preset,
} = require('./node_modules/postgraphile/dist/presets/v4.js');
const {
  grafserv,
} = require('./node_modules/grafserv/dist/servers/express/v4/index.js');

console.log('Testing PostGraphile 5.0 API...');

// Test the preset configuration
const preset = {
  extends: [
    PostGraphileAmberPreset,
    makeV4Preset({
      dynamicJson: true,
      legacyRelations: 'omit',
      showErrorStack: true,
    }),
  ],
};

// Test postgraphile creation
const pgl = postgraphile({
  ...preset,
  pgServices: [
    {
      name: 'main',
      withPgClientKey: 'withPgClient',
      pgConfig: {
        connectionString: 'postgresql://test:test@localhost:5432/test',
      },
      schemas: ['public'],
    },
  ],
});

console.log('PostGraphile instance created successfully');
console.log('Available methods:', Object.keys(pgl));

// Test createServ
console.log('Testing createServ...');
const serv = pgl.createServ(grafserv);
console.log('grafserv type:', typeof serv);
console.log('grafserv methods:', Object.getOwnPropertyNames(serv));
