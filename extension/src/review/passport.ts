import * as fs from 'node:fs';
import * as path from 'node:path';
import fg from 'fast-glob';
import type { ChangePassport, PassportFile, PassportFlag, PendingChange, RiskLevel } from '../../../shared/types';

/**
 * Change Passport: a per-run risk report that travels with the agent's proposals.
 * It answers "what did the agent touch, how big is it, what else depends on it, and is anything alarming?"
 * before the human reviews a single hunk.
 */

const RANK: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2 };
const maxRisk = (levels: RiskLevel[]): RiskLevel =>
  levels.reduce<RiskLevel>((worst, level) => (RANK[level] > RANK[worst] ? level : worst), 'low');

const SCAN_GLOB = '**/*.{py,pyi,ts,tsx,js,jsx,mjs,cjs,go,rs,java,kt,rb,php,cs}';
const SCAN_IGNORE = ['**/node_modules/**', '**/.git/**', '**/.venv/**', '**/venv/**', '**/__pycache__/**', '**/dist/**', '**/build/**', '**/out/**'];
const MAX_SCAN_FILES = 4000;

const SECRET_PATTERN = /(api[_-]?key|secret|password|passwd|token|private[_-]?key)\s*[:=]\s*["'][^"'\s]{8,}["']|-----BEGIN [A-Z ]*PRIVATE KEY-----|\bsk-[A-Za-z0-9-]{16,}|\bAKIA[0-9A-Z]{16}\b/i;
const SENSITIVE_PATH = /(^|\/)(\.env(\..*)?|.*\.pem|.*\.key|id_rsa.*|credentials?(\.\w+)?|secrets?(\.\w+)?)$/i;
const CHANGELOG_PATH = /(^|\/)(CHANGES|CHANGELOG|HISTORY|NEWS)(\.\w+)?$/i;
const BUILD_PATH = /(^|\/)(package(-lock)?\.json|yarn\.lock|pnpm-lock\.yaml|pyproject\.toml|setup\.(py|cfg)|requirements[^/]*\.txt|poetry\.lock|uv\.lock|Cargo\.(toml|lock)|go\.(mod|sum)|Dockerfile|\.github\/workflows\/[^/]+)$/i;
const TEST_PATH = /(^|\/)(tests?|__tests__)\/|(^|\/)(test_[^/]+|[^/]+_test|[^/]+\.(test|spec))\.\w+$/i;

function countLines(text: string): number {
  if (!text) return 0;
  return text.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n').length;
}

function changeStats(change: PendingChange) {
  let added = 0;
  let removed = 0;
  const addedLines: string[] = [];
  for (const hunk of change.hunks) {
    for (const line of hunk.lines) {
      if (line.type === 'add') { added++; addedLines.push(line.content); }
      else if (line.type === 'remove') removed++;
    }
  }
  return { added, removed, addedLines };
}

/** Names of functions/classes the change defines, to explain what is new. */
export function definedSymbols(addedLines: string[]): string[] {
  const names = new Set<string>();
  const pattern = /^\s*(?:async\s+)?(?:def|class|function|func|fn)\s+([A-Za-z_][\w]*)|^\s*(?:export\s+)?(?:const|let)\s+([A-Za-z_][\w]*)\s*=\s*(?:async\s*)?\(/;
  for (const line of addedLines) {
    const match = pattern.exec(line);
    const name = match?.[1] ?? match?.[2];
    if (name) names.add(name);
  }
  return [...names].slice(0, 8);
}

/** Pure risk analysis for one file (no I/O), exported for tests. */
export function assessFile(change: PendingChange): PassportFile {
  const normalizedPath = change.path.split(path.sep).join('/');
  const { added, removed, addedLines } = changeStats(change);
  const originalLines = change.originalExists ? countLines(change.originalContent) : 0;
  const deletionRatio = originalLines ? removed / originalLines : 0;
  const flags: PassportFlag[] = [];

  if (change.originalExists && removed >= 30 && deletionRatio >= 0.3) {
    flags.push({
      level: 'high',
      code: 'mass-deletion',
      message: `Deletes ${removed} of ${originalLines} lines (${Math.round(deletionRatio * 100)}% of the file).`,
    });
  }
  if (SENSITIVE_PATH.test(normalizedPath)) {
    flags.push({ level: 'high', code: 'sensitive-file', message: 'Touches a file that usually holds secrets or keys.' });
  }
  if (addedLines.some(line => SECRET_PATTERN.test(line))) {
    flags.push({ level: 'high', code: 'possible-secret', message: 'Added lines look like a hard-coded secret or key.' });
  }
  if (BUILD_PATH.test(normalizedPath)) {
    flags.push({ level: 'medium', code: 'build-or-deps', message: 'Changes dependencies, build or CI configuration.' });
  }
  if (CHANGELOG_PATH.test(normalizedPath)) {
    flags.push({ level: removed > 5 ? 'high' : 'medium', code: 'changelog', message: removed > 5 ? `Rewrites release history (${removed} lines removed from the changelog).` : 'Edits the changelog.' });
  }
  if (added + removed > 400) {
    flags.push({ level: 'medium', code: 'large-change', message: `Large change (${added + removed} lines) - review carefully.` });
  }

  return {
    path: normalizedPath,
    isNew: !change.originalExists,
    isTest: TEST_PATH.test(normalizedPath),
    added,
    removed,
    originalLines,
    symbols: definedSymbols(addedLines),
    dependents: [],
    flags,
    risk: maxRisk(flags.map(flag => flag.level)),
  };
}

/** Files elsewhere in the workspace that import the changed module (its "blast radius"). */
async function findDependents(root: string, filePath: string): Promise<string[]> {
  const parsed = path.parse(filePath);
  const moduleName = parsed.name === '__init__' ? path.basename(parsed.dir) : parsed.name;
  if (!moduleName || moduleName.length < 2) return [];
  const escaped = moduleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `^\\s*(from\\s+\\S*\\b${escaped}\\b\\S*\\s+import|import\\s+\\S*\\b${escaped}\\b)|` +
    `(from\\s+|require\\(\\s*)["'][^"']*\\b${escaped}(\\.\\w+)?["']`,
    'm'
  );
  const files = (await fg([SCAN_GLOB], { cwd: root, ignore: SCAN_IGNORE })).slice(0, MAX_SCAN_FILES);
  const self = filePath.split(path.sep).join('/');
  const dependents: string[] = [];
  for (const file of files) {
    if (file === self) continue;
    try {
      if (pattern.test(fs.readFileSync(path.join(root, file), 'utf8'))) dependents.push(file);
    } catch { /* unreadable file */ }
  }
  return dependents;
}

export async function buildPassport(
  root: string,
  changes: PendingChange[],
  verification?: ChangePassport['verification'],
  model?: string
): Promise<ChangePassport> {
  const files: PassportFile[] = [];
  for (const change of changes) {
    const file = assessFile(change);
    if (!file.isNew && !file.isTest) {
      try { file.dependents = await findDependents(root, change.path); } catch { file.dependents = []; }
    }
    files.push(file);
  }
  const flags = files.flatMap(file => file.flags);
  const risk = maxRisk(files.map(file => file.risk));
  const testsTouched = files.some(file => file.isTest);
  return {
    createdAt: Date.now(),
    model,
    files,
    totals: {
      files: files.length,
      added: files.reduce((sum, file) => sum + file.added, 0),
      removed: files.reduce((sum, file) => sum + file.removed, 0),
      dependents: new Set(files.flatMap(file => file.dependents)).size,
      flags: flags.length,
    },
    testsTouched,
    verification,
    risk,
  };
}

export function passportToMarkdown(passport: ChangePassport): string {
  const icon = { low: '🟢', medium: '🟡', high: '🔴' }[passport.risk];
  const lines = [
    `## Voltix Change Passport`,
    '',
    `**Risk:** ${icon} ${passport.risk.toUpperCase()} · **Files:** ${passport.totals.files} · **+${passport.totals.added} / −${passport.totals.removed}** · **Blast radius:** ${passport.totals.dependents} dependent file(s)`,
  ];
  if (passport.model) lines.push(`**Model:** ${passport.model}`);
  if (passport.verification) {
    const v = passport.verification;
    lines.push(`**Verification:** ${v.passed ? '✅ passed' : '❌ failed'} — \`${v.command}\` — ${v.summary}${v.fixRounds ? ` (after ${v.fixRounds} automatic fix round(s))` : ''}`);
  } else {
    lines.push('**Verification:** not run');
  }
  lines.push('', '| File | Change | Risk | Notes |', '|---|---|---|---|');
  for (const file of passport.files) {
    const notes = [
      file.isNew ? 'new file' : '',
      file.isTest ? 'test' : '',
      file.symbols.length ? `defines ${file.symbols.join(', ')}` : '',
      file.dependents.length ? `imported by ${file.dependents.length} file(s)` : '',
      ...file.flags.map(flag => flag.message),
    ].filter(Boolean).join('; ');
    lines.push(`| \`${file.path}\` | +${file.added} / −${file.removed} | ${file.risk} | ${notes || '—'} |`);
  }
  return lines.join('\n');
}
