import * as crypto from 'node:crypto';
import fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as conflictDetector from '../../src/review/conflictDetector';
import * as hunkApplicator from '../../src/review/hunkApplicator';
import { applyAccepted } from '../../src/review/changeApplicator';
import { parseHunks } from '../../src/review/hunkParser';
import type { PendingChange } from '../../../shared/types';

let workspace: string;

function createChange(
  absPath: string,
  relativePath: string,
  originalContent: string,
  proposedContent: string,
  id: string,
  accepted = true,
  originalExists = true
): PendingChange {
  const hunks = parseHunks(originalContent, proposedContent, id);
  hunks.forEach(hunk => hunk.accepted = accepted);
  return {
    id,
    path: relativePath,
    absPath,
    originalExists,
    originalContent,
    originalHash: crypto.createHash('sha256').update(originalContent).digest('hex'),
    proposedContent,
    reason: 'test',
    hunks,
    fileDecision: accepted ? true : false,
  };
}

function createFile(relativePath: string, content: string): string {
  const filePath = path.join(workspace, relativePath);
  fs.writeFileSync(filePath, content);
  return filePath;
}

beforeEach(() => {
  workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'trueforge-apply-'));
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(workspace, { recursive: true, force: true });
});

test('accepted empty content writes a zero-byte file successfully', () => {
  const filePath = createFile('empty.txt', 'existing content\n');
  const change = createChange(filePath, 'empty.txt', 'existing content\n', '', 'empty-content');

  const result = applyAccepted([change]);

  expect(result).toEqual({
    success: true,
    applied: ['empty.txt'],
    restored: [],
    unchanged: [],
    manualRecovery: [],
    failed: [],
    conflicts: [],
  });
  expect(fs.readFileSync(filePath, 'utf8')).toBe('');
});

test('null application content is treated as failure', () => {
  const filePath = createFile('null.txt', 'original\n');
  const change = createChange(filePath, 'null.txt', 'original\n', 'proposed\n', 'null-result');
  jest.spyOn(hunkApplicator, 'applySelectedHunks').mockReturnValue({ content: null });

  const result = applyAccepted([change]);

  expect(result).toEqual({
    success: false,
    applied: [],
    restored: [],
    unchanged: ['null.txt'],
    manualRecovery: [],
    failed: ['null.txt'],
    conflicts: [],
  });
  expect(fs.readFileSync(filePath, 'utf8')).toBe('original\n');
});

test('accepted proposals for the same path are all rejected without modifying the file', () => {
  const filePath = createFile('duplicate.txt', 'original\n');
  const first = createChange(filePath, 'duplicate.txt', 'original\n', 'first\n', 'first');
  const second = createChange(filePath, 'duplicate.txt', 'original\n', 'second\n', 'second');
  const writeSpy = jest.spyOn(fs, 'writeFileSync');

  const result = applyAccepted([first, second]);

  expect(result).toEqual({
    success: false,
    applied: [],
    restored: [],
    unchanged: ['duplicate.txt'],
    manualRecovery: [],
    failed: ['duplicate.txt'],
    conflicts: [],
  });
  expect(writeSpy).not.toHaveBeenCalled();
  expect(fs.readFileSync(filePath, 'utf8')).toBe('original\n');
});

test('a unique proposal applies while a duplicate group is rejected', () => {
  const duplicatePath = createFile('duplicate.txt', 'original\n');
  const uniquePath = createFile('unique.txt', 'before\n');
  const changes = [
    createChange(duplicatePath, 'duplicate.txt', 'original\n', 'first\n', 'first'),
    createChange(duplicatePath, 'duplicate.txt', 'original\n', 'second\n', 'second'),
    createChange(uniquePath, 'unique.txt', 'before\n', 'after\n', 'unique'),
  ];

  const result = applyAccepted(changes);

  expect(result).toEqual({
    success: false,
    applied: ['unique.txt'],
    restored: [],
    unchanged: ['duplicate.txt'],
    manualRecovery: [],
    failed: ['duplicate.txt'],
    conflicts: [],
  });
  expect(fs.readFileSync(duplicatePath, 'utf8')).toBe('original\n');
  expect(fs.readFileSync(uniquePath, 'utf8')).toBe('after\n');
});

test('a rejected proposal does not make an accepted proposal a duplicate', () => {
  const filePath = createFile('mixed.txt', 'original\n');
  const accepted = createChange(filePath, 'mixed.txt', 'original\n', 'accepted\n', 'accepted');
  const rejected = createChange(filePath, 'mixed.txt', 'original\n', 'rejected\n', 'rejected', false);

  const result = applyAccepted([accepted, rejected]);

  expect(result).toEqual({
    success: true,
    applied: ['mixed.txt'],
    restored: [],
    unchanged: [],
    manualRecovery: [],
    failed: [],
    conflicts: [],
  });
  expect(fs.readFileSync(filePath, 'utf8')).toBe('accepted\n');
});

test('equivalent normalized absolute paths are treated as duplicates', () => {
  const filePath = createFile('normalized.txt', 'original\n');
  const equivalentPath = `${workspace}${path.sep}unused${path.sep}..${path.sep}normalized.txt`;
  expect(equivalentPath).not.toBe(filePath);
  expect(path.resolve(equivalentPath)).toBe(path.resolve(filePath));
  const first = createChange(filePath, 'normalized.txt', 'original\n', 'first\n', 'normalized-first');
  const second = createChange(equivalentPath, 'normalized.txt', 'original\n', 'second\n', 'normalized-second');

  const result = applyAccepted([first, second]);

  expect(result).toEqual({
    success: false,
    applied: [],
    restored: [],
    unchanged: ['normalized.txt'],
    manualRecovery: [],
    failed: ['normalized.txt'],
    conflicts: [],
  });
  expect(fs.readFileSync(filePath, 'utf8')).toBe('original\n');
});

test('Windows paths are compared case-insensitively', () => {
  const filePath = createFile('case-path.txt', 'original\n');
  const differentlyCasedPath = filePath.toUpperCase();
  expect(differentlyCasedPath).not.toBe(filePath);
  const first = createChange(filePath, 'case-path.txt', 'original\n', 'first\n', 'case-first');
  const second = createChange(differentlyCasedPath, 'case-path.txt', 'original\n', 'second\n', 'case-second');
  const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' });

  let result: ReturnType<typeof applyAccepted>;
  try {
    result = applyAccepted([first, second]);
  } finally {
    if (platformDescriptor) Object.defineProperty(process, 'platform', platformDescriptor);
  }

  expect(result).toEqual({
    success: false,
    applied: [],
    restored: [],
    unchanged: ['case-path.txt'],
    manualRecovery: [],
    failed: ['case-path.txt'],
    conflicts: [],
  });
  expect(fs.readFileSync(filePath, 'utf8')).toBe('original\n');
});

test('an accepted proposal creates a file that was absent when proposed', () => {
  const filePath = path.join(workspace, 'new-file.txt');
  const change = createChange(filePath, 'new-file.txt', '', 'created\n', 'new-file', true, false);

  const result = applyAccepted([change]);

  expect(result).toEqual({
    success: true,
    applied: ['new-file.txt'],
    restored: [],
    unchanged: [],
    manualRecovery: [],
    failed: [],
    conflicts: [],
  });
  expect(fs.readFileSync(filePath, 'utf8')).toBe('created\n');
});

test('an existing empty file is distinguished from a missing file', () => {
  const filePath = createFile('existing-empty.txt', '');
  const change = createChange(filePath, 'existing-empty.txt', '', 'updated\n', 'existing-empty');

  const result = applyAccepted([change]);

  expect(result).toEqual({
    success: true,
    applied: ['existing-empty.txt'],
    restored: [],
    unchanged: [],
    manualRecovery: [],
    failed: [],
    conflicts: [],
  });
  expect(fs.readFileSync(filePath, 'utf8')).toBe('updated\n');
});

test('an absent proposal target that becomes occupied is reported as a conflict', () => {
  const filePath = path.join(workspace, 'occupied.txt');
  const change = createChange(filePath, 'occupied.txt', '', 'proposal\n', 'occupied', true, false);
  fs.writeFileSync(filePath, 'external\n');

  const result = applyAccepted([change]);

  expect(result).toEqual({
    success: false,
    applied: [],
    restored: [],
    unchanged: ['occupied.txt'],
    manualRecovery: [],
    failed: [],
    conflicts: ['occupied.txt'],
  });
  expect(fs.readFileSync(filePath, 'utf8')).toBe('external\n');
});

test('exclusive creation handles a file appearing after the conflict check', () => {
  const filePath = path.join(workspace, 'race.txt');
  const change = createChange(filePath, 'race.txt', '', 'proposal\n', 'race', true, false);
  jest.spyOn(conflictDetector, 'checkConflict').mockImplementation(() => {
    fs.writeFileSync(filePath, 'external\n');
    return null;
  });

  const result = applyAccepted([change]);

  expect(result).toEqual({
    success: false,
    applied: [],
    restored: [],
    unchanged: ['race.txt'],
    manualRecovery: [],
    failed: [],
    conflicts: ['race.txt'],
  });
  expect(fs.readFileSync(filePath, 'utf8')).toBe('external\n');
});

test('a missing parent directory is not created and application fails safely', () => {
  const filePath = path.join(workspace, 'missing-parent', 'nested.txt');
  const change = createChange(filePath, 'missing-parent/nested.txt', '', 'content\n', 'missing-parent', true, false);

  const result = applyAccepted([change]);

  expect(result).toEqual({
    success: false,
    applied: [],
    restored: [],
    unchanged: ['missing-parent/nested.txt'],
    manualRecovery: [],
    failed: ['missing-parent/nested.txt'],
    conflicts: [],
  });
  expect(fs.existsSync(path.dirname(filePath))).toBe(false);
  expect(fs.existsSync(filePath)).toBe(false);
});

test('a failed batch restores existing files and removes files it created', () => {
  const existingPath = createFile('existing.txt', 'original\n');
  const newPath = path.join(workspace, 'created.txt');
  const failedPath = path.join(workspace, 'missing-parent', 'failed.txt');
  const changes = [
    createChange(existingPath, 'existing.txt', 'original\n', 'updated\n', 'existing'),
    createChange(newPath, 'created.txt', '', 'created\n', 'created', true, false),
    createChange(failedPath, 'missing-parent/failed.txt', '', 'failed\n', 'failed', true, false),
  ];

  const result = applyAccepted(changes);

  expect(result.success).toBe(false);
  expect(result.applied).toEqual([]);
  expect(result.restored).toEqual(['created.txt', 'existing.txt']);
  expect(result.unchanged).toEqual(['missing-parent/failed.txt']);
  expect(result.manualRecovery).toEqual([]);
  expect(result.failed).toEqual(['missing-parent/failed.txt']);
  expect(fs.readFileSync(existingPath, 'utf8')).toBe('original\n');
  expect(fs.existsSync(newPath)).toBe(false);
  expect(fs.existsSync(path.dirname(failedPath))).toBe(false);
});

test('a partial staged write never truncates an existing target', () => {
  const filePath = createFile('staged-existing.txt', 'original\n');
  const change = createChange(filePath, 'staged-existing.txt', 'original\n', 'proposal\n', 'staged-existing');
  const originalWriteFileSync = fs.writeFileSync;
  jest.spyOn(fs, 'writeFileSync').mockImplementation((file, data, options) => {
    if (typeof file === 'number' && data === 'proposal\n') {
      originalWriteFileSync(file, 'partial', 'utf8');
      throw new Error('Simulated partial staging write');
    }
    Reflect.apply(originalWriteFileSync, fs, [file, data, options]);
  });

  const result = applyAccepted([change]);

  expect(result.success).toBe(false);
  expect(result.failed).toEqual(['staged-existing.txt']);
  expect(result.unchanged).toEqual(['staged-existing.txt']);
  expect(result.manualRecovery).toEqual([]);
  expect(fs.readFileSync(filePath, 'utf8')).toBe('original\n');
  expect(fs.readdirSync(workspace)).toEqual(['staged-existing.txt']);
});

test('a partial staged write never leaves a partially created new target', () => {
  const filePath = path.join(workspace, 'staged-new.txt');
  const change = createChange(filePath, 'staged-new.txt', '', 'proposal\n', 'staged-new', true, false);
  const originalWriteFileSync = fs.writeFileSync;
  jest.spyOn(fs, 'writeFileSync').mockImplementation((file, data, options) => {
    if (typeof file === 'number' && data === 'proposal\n') {
      originalWriteFileSync(file, 'partial', 'utf8');
      throw new Error('Simulated partial staging write');
    }
    Reflect.apply(originalWriteFileSync, fs, [file, data, options]);
  });

  const result = applyAccepted([change]);

  expect(result.success).toBe(false);
  expect(result.failed).toEqual(['staged-new.txt']);
  expect(result.unchanged).toEqual(['staged-new.txt']);
  expect(result.manualRecovery).toEqual([]);
  expect(fs.existsSync(filePath)).toBe(false);
  expect(fs.readdirSync(workspace)).toEqual([]);
});

test('a change after initial conflict detection is caught before publishing', () => {
  const filePath = createFile('late-change.txt', 'original\n');
  const change = createChange(filePath, 'late-change.txt', 'original\n', 'proposal\n', 'late-change');
  const originalWriteFileSync = fs.writeFileSync;
  let changed = false;
  jest.spyOn(fs, 'writeFileSync').mockImplementation((file, data, options) => {
    Reflect.apply(originalWriteFileSync, fs, [file, data, options]);
    if (!changed && typeof file === 'number' && data === 'proposal\n') {
      changed = true;
      originalWriteFileSync(filePath, 'external\n');
    }
  });

  const result = applyAccepted([change]);

  expect(result.success).toBe(false);
  expect(result.applied).toEqual([]);
  expect(result.conflicts).toEqual(['late-change.txt']);
  expect(result.unchanged).toEqual(['late-change.txt']);
  expect(fs.readFileSync(filePath, 'utf8')).toBe('external\n');
  expect(fs.readdirSync(workspace)).toEqual(['late-change.txt']);
});

test('rollback does not overwrite an external change made after a write', () => {
  const existingPath = createFile('external-change.txt', 'original\n');
  const failedPath = path.join(workspace, 'missing-parent', 'failed.txt');
  const changes = [
    createChange(existingPath, 'external-change.txt', 'original\n', 'proposal\n', 'external-change'),
    createChange(failedPath, 'missing-parent/failed.txt', '', 'failed\n', 'failed', true, false),
  ];
  const originalWriteFileSync = fs.writeFileSync;
  const originalOpenSync = fs.openSync;
  jest.spyOn(fs, 'openSync').mockImplementation((file, flags, mode) => {
    if (path.dirname(String(file)) === path.dirname(failedPath)) {
      originalWriteFileSync(existingPath, 'external\n');
      throw new Error('Simulated staging failure');
    }
    return Reflect.apply(originalOpenSync, fs, [file, flags, mode]);
  });

  const result = applyAccepted(changes);

  expect(result.success).toBe(false);
  expect(result.applied).toEqual([]);
  expect(result.restored).toEqual([]);
  expect(result.unchanged).toEqual(['missing-parent/failed.txt']);
  expect(result.manualRecovery).toEqual(['external-change.txt']);
  expect(result.failed).toEqual(expect.arrayContaining(['external-change.txt', 'missing-parent/failed.txt']));
  expect(fs.readFileSync(existingPath, 'utf8')).toBe('external\n');
});
