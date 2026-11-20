import { applySearchReplace } from '../../src/tools/searchReplace';

test('replaces a unique match', () => {
  const result = applySearchReplace('a\nb\nc\n', 'b\n', 'B\n');
  expect(result).toEqual({ ok: true, content: 'a\nB\nc\n' });
});

test('rejects a missing match', () => {
  expect(applySearchReplace('a\nb\n', 'x', 'y').ok).toBe(false);
});

test('rejects an ambiguous match', () => {
  expect(applySearchReplace('x\nx\n', 'x', 'y').ok).toBe(false);
});

test('treats $ in the replacement literally', () => {
  const result = applySearchReplace('price\n', 'price', '$1 and $&');
  expect(result).toEqual({ ok: true, content: '$1 and $&\n' });
});
