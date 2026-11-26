const { spawn } = require('node:child_process');

// Node reads NODE_EXTRA_CA_CERTS at process startup, after the parent loads .env.
const child = spawn(process.execPath, process.argv.slice(2), {
  stdio: 'inherit',
  env: process.env,
});
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
