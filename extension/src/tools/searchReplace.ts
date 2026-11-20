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

/** TrueForge rejects tool responses over ~24,000 characters, so long files are returned in chunks. */
export const MAX_READ_CHARS = 20000;

/** Returns lines start..end (1-based, inclusive) of a file, cut at a line boundary under MAX_READ_CHARS. */
export function readFileChunk(content: string, startLine?: number, endLine?: number): string {
  const lines = content.split(/\r?\n/);
  const total = lines.length;
  const start = Math.max(1, startLine ?? 1);
  const end = Math.min(total, endLine ?? total);
  if (start > total) return `[File has only ${total} lines.]`;
  const out: string[] = [];
  let size = 0;
  let last = start - 1;
  for (let n = start; n <= end; n++) {
    const line = lines[n - 1];
    if (size + line.length + 1 > MAX_READ_CHARS && out.length > 0) break;
    out.push(line);
    size += line.length + 1;
    last = n;
  }
  const whole = start === 1 && last === total;
  if (whole) return out.join('\n');
  const note = last < end
    ? `\n\n[Showing lines ${start}-${last} of ${total}. Call read_file again with start_line=${last + 1} to continue.]`
    : `\n\n[Showing lines ${start}-${last} of ${total}.]`;
  return out.join('\n') + note;
}

/** Case-insensitive matcher: plain text, or a regular expression (grep-style \\| alternation accepted). */
export function buildMatcher(query: string): (line: string) => boolean {
  const needle = query.toLowerCase();
  let regex: RegExp | undefined;
  if (/[\\|.*+?()[\]{}^$]/.test(query)) {
    try { regex = new RegExp(query.replace(/\\\|/g, '|'), 'i'); } catch { regex = undefined; }
  }
  return line => line.toLowerCase().includes(needle) || (regex ? regex.test(line) : false);
}
