import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { PendingChanges } from '../../src/review/pendingChanges';
import { applyAndRecord, undoLastApply, clearUndoHistory } from '../../src/review/undoStack';

function tempFile(content: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-undo-'));
  const file = path.join(dir, 'a.txt');
  fs.writeFileSync(file, content);
  return file;
}

beforeEach(() => {
  PendingChanges.clear();
  clearUndoHistory();
});

test('undo restores the original content of an applied change', () => {
  const file = tempFile('one\ntwo\n');
  const change = PendingChanges.add({
    path: 'a.txt', absPath: file, originalExists: true, originalContent: 'one\ntwo\n',
    proposedContent: 'one\nTWO\n', reason: 'test',
  });
  PendingChanges.acceptFile(change.id);
  const result = applyAndRecord(PendingChanges.getAll());
  expect(result.applied).toEqual(['a.txt']);
  expect(fs.readFileSync(file, 'utf8')).toBe('one\nTWO\n');
  expect(PendingChanges.getAll()).toHaveLength(0);
  expect(undoLastApply()).toEqual({ restored: ['a.txt'], skipped: [] });
  expect(fs.readFileSync(file, 'utf8')).toBe('one\ntwo\n');
});

test('undo leaves a file alone if it was edited after the apply', () => {
  const file = tempFile('one\n');
  const change = PendingChanges.add({
    path: 'a.txt', absPath: file, originalExists: true, originalContent: 'one\n',
    proposedContent: 'ONE\n', reason: 'test',
  });
  PendingChanges.acceptFile(change.id);
  applyAndRecord(PendingChanges.getAll());
  fs.writeFileSync(file, 'user edit\n');
  expect(undoLastApply()).toEqual({ restored: [], skipped: ['a.txt'] });
  expect(fs.readFileSync(file, 'utf8')).toBe('user edit\n');
});
