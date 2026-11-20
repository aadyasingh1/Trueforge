import { parseHunks } from '../../src/review/hunkParser';
import { applySelectedHunks } from '../../src/review/hunkApplicator';
import type { PendingChange } from '../../../shared/types';

function change(original: string, proposed: string): PendingChange {
  const changeId = 'test';
  return {
    id: changeId,
    path: 'test.txt',
    absPath: '/test.txt',
    originalExists: true,
    originalContent: original,
    originalHash: '',
    proposedContent: proposed,
    reason: 'test',
    hunks: parseHunks(original, proposed, changeId),
    fileDecision: null,
  };
}

test('reject all leaves original unchanged', () => {
  const value = change('one\ntwo\nthree\n', 'one\nTWO\nthree\n');
  expect(applySelectedHunks(value).content).toBe(value.originalContent);
});

test('accept all applies proposed content', () => {
  const value = change('one\ntwo\nthree\n', 'one\nTWO\nthree\n');
  value.hunks.forEach(hunk => hunk.accepted = true);
  expect(applySelectedHunks(value).content).toBe(value.proposedContent);
});

test('accept one of two hunks', () => {
  const value = change('a\nb\nc\nd\ne\nf\ng\nh\ni\nj\nk\n', 'A\nb\nc\nd\ne\nf\ng\nh\ni\nj\nK\n');
  value.hunks[0].accepted = true;
  expect(applySelectedHunks(value).content).toBe('A\nb\nc\nd\ne\nf\ng\nh\ni\nj\nk\n');
});
