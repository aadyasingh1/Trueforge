import { PendingChanges } from '../../src/review/pendingChanges';

beforeEach(() => {
  PendingChanges.clear();
});

afterEach(() => {
  PendingChanges.clear();
});

test('individual accept and reject update local file decisions', () => {
  const change = PendingChanges.add({
    path: 'src/example.ts',
    absPath: '/workspace/src/example.ts',
    originalExists: true,
    originalContent: 'before\n',
    proposedContent: 'after\n',
    reason: 'test change',
  });

  PendingChanges.acceptFile(change.id);
  expect(PendingChanges.get(change.id)?.fileDecision).toBe(true);
  expect(PendingChanges.get(change.id)?.hunks.every(hunk => hunk.accepted === true)).toBe(true);

  PendingChanges.rejectFile(change.id);
  expect(PendingChanges.get(change.id)?.fileDecision).toBe(false);
  expect(PendingChanges.get(change.id)?.hunks.every(hunk => hunk.accepted === false)).toBe(true);
});

test('individual hunk decisions override a prior file decision', () => {
  const change = PendingChanges.add({
    path: 'src/hunk.ts',
    absPath: '/workspace/src/hunk.ts',
    originalExists: true,
    originalContent: 'before\n',
    proposedContent: 'after\n',
    reason: 'hunk decision test',
  });
  const hunkId = change.hunks[0].id;

  PendingChanges.acceptFile(change.id);
  PendingChanges.rejectHunk(change.id, hunkId);
  expect(PendingChanges.get(change.id)?.fileDecision).toBeNull();
  expect(PendingChanges.get(change.id)?.hunks[0].accepted).toBe(false);

  PendingChanges.rejectFile(change.id);
  PendingChanges.acceptHunk(change.id, hunkId);
  expect(PendingChanges.get(change.id)?.fileDecision).toBeNull();
  expect(PendingChanges.get(change.id)?.hunks[0].accepted).toBe(true);
});

test('discard removes proposals and clear leaves no review state', () => {
  const change = PendingChanges.add({
    path: 'src/discard.ts',
    absPath: '/workspace/src/discard.ts',
    originalExists: true,
    originalContent: 'before\n',
    proposedContent: 'after\n',
    reason: 'discard test',
  });

  expect(PendingChanges.remove(change.id)).toBe(true);
  expect(PendingChanges.getAll()).toEqual([]);

  PendingChanges.add({
    path: 'src/another.ts',
    absPath: '/workspace/src/another.ts',
    originalExists: true,
    originalContent: 'one\n',
    proposedContent: 'two\n',
    reason: 'clear test',
  });
  PendingChanges.clear();
  expect(PendingChanges.getAll()).toEqual([]);
});
