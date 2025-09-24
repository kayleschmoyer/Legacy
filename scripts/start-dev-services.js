#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

const services = [
  {
    name: 'GraphQL API',
    command: 'npm',
    args: ['run', 'dev:db'],
    port: 5000,
    color: '\x1b[36m', // cyan
  },
  {
    name: 'OAuth Proxy',
    command: 'npm',
    args: ['run', 'dev:oauth'],
    port: 5001,
    color: '\x1b[33m', // yellow
  },
  {
    name: 'Stats Lambda',
    command: 'npm',
    args: ['run', 'dev:stats'],
    port: 5002,
    color: '\x1b[35m', // magenta
  },
  {
    name: 'Game Selection',
    command: 'npm',
    args: ['run', 'dev:game-selection'],
    port: 5003,
    color: '\x1b[32m', // green
  },
];

const reset = '\x1b[0m';

function startService(service) {
  console.log(
    `${service.color}Starting ${service.name} on port ${service.port}...${reset}`,
  );

  const child = spawn(service.command, service.args, {
    cwd: path.join(__dirname, '..'), // Use root directory for npm commands
    stdio: 'pipe',
    shell: true,
    env: { ...process.env, NODE_PATH: path.join(__dirname, '../node_modules') },
  });

  child.stdout.on('data', (data) => {
    process.stdout.write(`${service.color}[${service.name}]${reset} ${data}`);
  });

  child.stderr.on('data', (data) => {
    process.stderr.write(`${service.color}[${service.name}]${reset} ${data}`);
  });

  child.on('close', (code) => {
    console.log(
      `${service.color}[${service.name}]${reset} exited with code ${code}`,
    );
  });

  return child;
}

function startAll() {
  console.log('🚀 Starting Legacy Sports development services...\n');

  const processes = services.map(startService);

  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down services...');
    processes.forEach((child) => {
      if (child && !child.killed) {
        child.kill('SIGTERM');
      }
    });
    process.exit(0);
  });
}

startAll();
