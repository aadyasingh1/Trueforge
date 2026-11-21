import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fingerprintFiles, inferVerifyCommand, runInSandbox, summariseOutput, validateVerifyCommand } from '../../src/verify/sandbox';

describe('validateVerifyCommand', () => {
  it('accepts test runners', () => {
    expect(validateVerifyCommand('python -m pytest -q tests/test_cli.py')).toBeUndefined();
    expect(validateVerifyCommand('npm test')).toBeUndefined();
    expect(validateVerifyCommand('npx vitest run')).toBeUndefined();
  });
  it('rejects chaining and non-test commands', () => {
    expect(validateVerifyCommand('pytest && rm -rf /')).toMatch(/chain/);
    expect(validateVerifyCommand('rm -rf .')).toMatch(/Only test runners/);
    expect(validateVerifyCommand('python -c "print(1)"')).toMatch(/Only test runners/);
  });
});

describe('summariseOutput', () => {
  it('uses the runner summary line', () => {
    expect(summariseOutput('....\n======= 1 failed, 59 passed in 0.27s =======\n', 1, false)).toBe('1 failed, 59 passed in 0.27s');
    expect(summariseOutput('Tests:       46 passed, 46 total\n', 0, false)).toBe('Tests:       46 passed, 46 total');
  });
  it('falls back to the exit code', () => {
    expect(summariseOutput('', 0, false)).toBe('Passed (exit code 0)');
    expect(summariseOutput('', 2, true)).toBe('Timed out');
  });
});

describe('fingerprintFiles', () => {
  it('ignores order and changes with content', () => {
    const a = fingerprintFiles([{ path: 'a', content: '1' }, { path: 'b', content: '2' }]);
    expect(fingerprintFiles([{ path: 'b', content: '2' }, { path: 'a', content: '1' }])).toBe(a);
    expect(fingerprintFiles([{ path: 'a', content: '1' }, { path: 'b', content: '3' }])).not.toBe(a);
  });
});

describe('runInSandbox', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'voltix-ws-'));
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node check.js' } }));
    fs.writeFileSync(path.join(root, 'check.js'), "process.exit(require('./value.json').ok ? 0 : 1)\n");
    fs.writeFileSync(path.join(root, 'value.json'), '{"ok": false}');
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('infers npm test', () => {
    expect(inferVerifyCommand(root, [])).toBe('npm test --silent');
    expect(inferVerifyCommand(root, [{ path: 'tests/test_cli.py', content: '' }])).toBe('python -m pytest -q tests/test_cli.py');
  });

  it('runs against the pending content without touching the workspace', async () => {
    const failing = await runInSandbox(root, [], 'npm test --silent');
    expect(failing.passed).toBe(false);
    const passing = await runInSandbox(root, [{ path: 'value.json', content: '{"ok": true}' }], 'npm test --silent');
    expect(passing.passed).toBe(true);
    expect(fs.readFileSync(path.join(root, 'value.json'), 'utf8')).toBe('{"ok": false}');
  }, 60000);
});
