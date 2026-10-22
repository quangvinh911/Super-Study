import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));

const originalArgv = process.argv;

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('APP_ORIGIN', undefined);
  vi.stubEnv('CERTIFICATE_START_TEST', 'inherited');
  vi.spyOn(process, 'on').mockReturnValue(process);
  vi.mocked(spawn).mockReset();
  vi.mocked(spawn).mockImplementation(() => {
    const child = new EventEmitter();
    child.exitCode = null;
    child.signalCode = null;
    child.kill = vi.fn();
    return child;
  });
});

afterEach(() => {
  process.argv = originalArgv;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

async function launch(args = []) {
  process.argv = [process.execPath, 'scripts/start-development.mjs', ...args];
  await import('./start-development.mjs');
  const calls = vi.mocked(spawn).mock.calls;
  expect(calls).toHaveLength(2);
  return { api: calls[0], angular: calls[1] };
}

describe('local development startup', () => {
  it('uses the default Angular origin for the account API and inherits the environment', async () => {
    const { api } = await launch();

    expect(api[0]).toBe(process.execPath);
    expect(api[1]).toEqual(['scripts/serve-account-api.mjs']);
    expect(api[2].stdio).toBe('inherit');
    expect(api[2].env?.APP_ORIGIN).toBe('http://localhost:4200');
    expect(api[2].env?.CERTIFICATE_START_TEST).toBe('inherited');
  });

  it.each([
    { form: 'separate port value', args: ['--port', '4201'] },
    { form: 'equals port value', args: ['--port=4201'] },
  ])('matches the account API origin to Angular with a $form', async ({ args }) => {
    const { api } = await launch(args);

    expect(api[2].env?.APP_ORIGIN).toBe('http://localhost:4201');
  });

  it('preserves an explicitly configured account API origin', async () => {
    vi.stubEnv('APP_ORIGIN', 'http://localhost:4300');
    const { api } = await launch(['--port', '4201']);

    expect(api[2].env?.APP_ORIGIN).toBe('http://localhost:4300');
  });

  it('forwards the original CLI arguments to Angular', async () => {
    const args = ['--port=4201', '--host', '127.0.0.1', '--configuration', 'development'];
    const { angular } = await launch(args);

    expect(angular[0]).toBe(process.execPath);
    expect(angular[1]).toEqual(['node_modules/@angular/cli/bin/ng.js', 'serve', ...args]);
    expect(angular[2].stdio).toBe('inherit');
  });
});
