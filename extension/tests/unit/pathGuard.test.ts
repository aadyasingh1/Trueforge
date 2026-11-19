import * as path from 'node:path';
import { guardWorkspacePath } from '../../src/tools/pathGuard';

const root = path.resolve('/tmp/trueforge-workspace');

test('allows relative workspace paths', () => {
  expect(guardWorkspacePath('src/app.ts', root).allowed).toBe(true);
});

test('rejects traversal', () => {
  expect(guardWorkspacePath('../../secret.txt', root).allowed).toBe(false);
});

test('allows workspace root', () => {
  expect(guardWorkspacePath('.', root).allowed).toBe(true);
});
