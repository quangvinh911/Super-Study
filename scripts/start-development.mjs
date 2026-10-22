import { spawn } from 'node:child_process';
import { parseArgs } from 'node:util';

const developmentArguments = process.argv.slice(2);
const { values } = parseArgs({
  args: developmentArguments,
  options: { port: { type: 'string', default: '4200' } },
  strict: false,
  allowPositionals: true,
});
const appOrigin = process.env.APP_ORIGIN || `http://localhost:${values.port}`;

// Run the Worker/D1 API alongside Angular, matching the production account runtime.
const children = [
  spawn(process.execPath, ['scripts/serve-account-api.mjs'], {
    stdio: 'inherit',
    env: { ...process.env, APP_ORIGIN: appOrigin },
  }),
  spawn(
    process.execPath,
    ['node_modules/@angular/cli/bin/ng.js', 'serve', ...developmentArguments],
    { stdio: 'inherit' },
  ),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill();
  }
}
for (const child of children) {
  child.on('error', (error) => {
    console.error('Unable to start development server:', error.message);
    stop(1);
  });
  child.on('exit', (code) => stop(code ?? 1));
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
