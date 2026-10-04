import { spawn } from 'node:child_process';

// Run the dictionary endpoint alongside Angular so local saves can be enriched.
const children = [
  spawn(process.execPath, ['scripts/serve-vocabulary-api.mjs'], { stdio: 'inherit' }),
  spawn(
    process.execPath,
    ['node_modules/@angular/cli/bin/ng.js', 'serve', ...process.argv.slice(2)],
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
