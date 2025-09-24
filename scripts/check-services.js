#!/usr/bin/env node

const http = require('http');

async function checkService(port, name) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}/health`, (res) => {
      console.log(
        `✅ ${name} is running on port ${port} (status: ${res.statusCode})`,
      );
      resolve(true);
    });

    req.on('error', () => {
      console.log(`❌ ${name} is not running on port ${port}`);
      resolve(false);
    });

    req.setTimeout(2000, () => {
      req.destroy();
      console.log(`⏱️  ${name} timed out on port ${port}`);
      resolve(false);
    });
  });
}

async function checkAllServices() {
  console.log('🔍 Checking Lambda development services...\n');

  const services = [
    { port: 5000, name: 'GraphQL API' },
    { port: 5001, name: 'OAuth Proxy' },
    { port: 5002, name: 'Stats Lambda' },
    { port: 5003, name: 'Game Selection' },
  ];

  const results = await Promise.all(
    services.map((service) => checkService(service.port, service.name)),
  );

  const running = results.filter((r) => r).length;
  console.log(`\n📊 ${running}/${services.length} services are running`);

  if (running === services.length) {
    console.log('🎉 All development services are ready!');
  } else {
    console.log('⚠️  Some services are not running. Check the logs above.');
  }
}

checkAllServices();
