function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let from = 0;
  while ((from = haystack.indexOf(needle, from)) !== -1) {
    count++;
    from += needle.length;
  }
  return count;
}

/** Applies one search/replace edit; exported for unit tests. */
export function applySearchReplace(content: string, oldString: string, newString: string):
  { ok: true; content: string } | { ok: false; error: string } {
  const normalized = content.replace(/\r\n/g, '\n');
  const oldNormalized = oldString.replace(/\r\n/g, '\n');
  const count = countOccurrences(normalized, oldNormalized);
  if (count === 0) return { ok: false, error: 'old_string was not found in the file. Call read_file and copy the exact text, including indentation.' };
  if (count > 1) return { ok: false, error: `old_string matches ${count} places. Include more surrounding lines so it matches exactly once.` };
  return { ok: true, content: normalized.replace(oldNormalized, () => newString.replace(/\r\n/g, '\n')) };
}
