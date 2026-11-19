import { parseHunks, normalizeLineEndings, restoreLineEndings } from '../../src/review/hunkParser';

test('parses a single hunk', () => {
  const hunks = parseHunks('one\ntwo\nthree\n', 'one\nTWO\nthree\n', 'change');
  expect(hunks).toHaveLength(1);
  expect(hunks[0].changeId).toBe('change');
});

test('empty diff returns no hunks', () => {
  expect(parseHunks('same\n', 'same\n', 'change')).toEqual([]);
});

test('normalizes and restores CRLF', () => {
  const normalized = normalizeLineEndings('a\r\nb\r\n');
  expect(normalized.wasCRLF).toBe(true);
  expect(normalized.normalized).toBe('a\nb\n');
  expect(restoreLineEndings('a\nb\n', true)).toBe('a\r\nb\r\n');
});
