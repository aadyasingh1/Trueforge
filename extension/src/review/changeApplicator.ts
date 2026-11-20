import fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { PendingChange } from '../../../shared/types';
import { checkConflict } from './conflictDetector';
import { applySelectedHunks } from './hunkApplicator';

interface StagedWrite {
  change: PendingChange;
  content: string;
  backupPath?: string;
}

interface ApplyResult {
  success: boolean;
  applied: string[];
  restored: string[];
  unchanged: string[];
  manualRecovery: string[];
  failed: string[];
  conflicts: string[];
}

function normalizeAbsolutePath(filePath: string): string {
  const normalized = path.normalize(path.resolve(filePath));
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function getErrorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string') {
    return error.code;
  }
  return undefined;
}

function addUnique(values: string[], value: string) {
  if (!values.includes(value)) values.push(value);
}

function makeTempPath(targetPath: string): string {
  return path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}.voltix-${randomUUID()}.tmp`
  );
}

function stageFile(
  targetPath: string,
  content: string,
  mode: number | undefined,
  stagedPaths: Set<string>
): string {
  let tempPath: string;
  let descriptor: number;
  while (true) {
    tempPath = makeTempPath(targetPath);
    try {
      descriptor = fs.openSync(tempPath, 'wx', mode ?? 0o666);
      stagedPaths.add(tempPath);
      break;
    } catch (error) {
      if (getErrorCode(error) !== 'EEXIST') throw error;
    }
  }

  let writeError: unknown;
  try {
    fs.writeFileSync(descriptor, content, { encoding: 'utf8' });
    if (mode !== undefined) fs.fchmodSync(descriptor, mode & 0o7777);
    fs.fsyncSync(descriptor);
  } catch (error) {
    writeError = error;
  }

  try {
    fs.closeSync(descriptor);
  } catch (error) {
    if (writeError === undefined) writeError = error;
    else writeError = new AggregateError([writeError, error], 'Staged file write and close both failed');
  }

  if (writeError !== undefined) throw writeError;
  return tempPath;
}

function existingFileMode(filePath: string): number {
  const stats = fs.lstatSync(filePath);
  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new Error('Only regular files can be updated safely');
  }
  return stats.mode & 0o7777;
}

function readRegularFile(filePath: string): string {
  const stats = fs.lstatSync(filePath);
  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new Error('Only regular files can be restored safely');
  }
  return fs.readFileSync(filePath, 'utf8');
}

function cleanupTemp(tempPath: string, stagedPaths: Set<string>, result: ApplyResult): boolean {
  try {
    fs.unlinkSync(tempPath);
    stagedPaths.delete(tempPath);
    result.manualRecovery = result.manualRecovery.filter(pathValue => pathValue !== tempPath);
    return true;
  } catch (error) {
    if (getErrorCode(error) === 'ENOENT') {
      stagedPaths.delete(tempPath);
      result.manualRecovery = result.manualRecovery.filter(pathValue => pathValue !== tempPath);
      return true;
    }
    addUnique(result.manualRecovery, tempPath);
    return false;
  }
}

function rollback(written: StagedWrite[], stagedPaths: Set<string>, result: ApplyResult) {
  for (let index = written.length - 1; index >= 0; index--) {
    const item = written[index];
    const filePath = item.change.absPath;

    try {
      if (readRegularFile(filePath) !== item.content) {
        addUnique(result.failed, item.change.path);
        addUnique(result.manualRecovery, item.change.path);
        result.applied = result.applied.filter(pathValue => pathValue !== item.change.path);
        continue;
      }

      if (item.change.originalExists) {
        if (!item.backupPath) throw new Error('Original-content staging file is unavailable');
        fs.renameSync(item.backupPath, filePath);
        stagedPaths.delete(item.backupPath);
      } else {
        fs.unlinkSync(filePath);
      }
      addUnique(result.restored, item.change.path);
      result.applied = result.applied.filter(pathValue => pathValue !== item.change.path);
    } catch {
      addUnique(result.failed, item.change.path);
      addUnique(result.manualRecovery, item.change.path);
      result.applied = result.applied.filter(pathValue => pathValue !== item.change.path);
    }
  }
}

export function applyAccepted(changes: PendingChange[]): ApplyResult {
  const acceptedChanges = changes.filter(change =>
    change.fileDecision !== false &&
    (change.hunks.some(hunk => hunk.accepted === true) || change.fileDecision === true)
  );
  const changesByPath = new Map<string, PendingChange[]>();
  for (const change of acceptedChanges) {
    const key = normalizeAbsolutePath(change.absPath);
    const group = changesByPath.get(key);
    if (group) group.push(change);
    else changesByPath.set(key, [change]);
  }

  const result: ApplyResult = {
    success: true,
    applied: [],
    restored: [],
    unchanged: [],
    manualRecovery: [],
    failed: [],
    conflicts: [],
  };
  const applicable: Array<{ change: PendingChange; content: string }> = [];
  for (const group of changesByPath.values()) {
    if (group.length > 1) {
      for (const change of group) {
        addUnique(result.failed, change.path);
        addUnique(result.unchanged, change.path);
      }
      continue;
    }

    const change = group[0];
    const conflict = checkConflict(change);
    if (conflict) {
      addUnique(result.conflicts, change.path);
      addUnique(result.unchanged, change.path);
      continue;
    }
    const applied = applySelectedHunks(change);
    if (applied.content === null) {
      addUnique(result.failed, change.path);
      addUnique(result.unchanged, change.path);
      continue;
    }
    applicable.push({ change, content: applied.content });
  }

  const written: StagedWrite[] = [];
  const stagedPaths = new Set<string>();
  for (let index = 0; index < applicable.length; index++) {
    const { change, content } = applicable[index];
    let proposedPath: string | undefined;
    let backupPath: string | undefined;
    let published = false;

    try {
      let mode: number | undefined;
      if (change.originalExists) {
        mode = existingFileMode(change.absPath);
        backupPath = stageFile(change.absPath, change.originalContent, mode, stagedPaths);
      }
      proposedPath = stageFile(change.absPath, content, mode, stagedPaths);

      const conflict = checkConflict(change);
      if (conflict) {
        addUnique(result.conflicts, change.path);
        addUnique(result.unchanged, change.path);
        const proposedClean = !proposedPath || cleanupTemp(proposedPath, stagedPaths, result);
        const backupClean = !backupPath || cleanupTemp(backupPath, stagedPaths, result);
        const cleanupSucceeded = proposedClean && backupClean;
        if (!cleanupSucceeded) {
          addUnique(result.failed, change.path);
          rollback(written, stagedPaths, result);
          for (const remaining of applicable.slice(index + 1)) addUnique(result.unchanged, remaining.change.path);
          break;
        }
        continue;
      }

      if (change.originalExists) {
        fs.renameSync(proposedPath, change.absPath);
        stagedPaths.delete(proposedPath);
        proposedPath = undefined;
        published = true;
        written.push({ change, content, backupPath });
        addUnique(result.applied, change.path);
      } else {
        fs.linkSync(proposedPath, change.absPath);
        published = true;
        written.push({ change, content });
        addUnique(result.applied, change.path);
        if (!cleanupTemp(proposedPath, stagedPaths, result)) {
          proposedPath = undefined;
          throw new Error(`Created file but could not remove staging link for ${change.path}`);
        }
        proposedPath = undefined;
      }
    } catch (error) {
      if (!published && !change.originalExists && getErrorCode(error) === 'EEXIST') {
        addUnique(result.conflicts, change.path);
      } else {
        addUnique(result.failed, change.path);
      }

      if (!published) addUnique(result.unchanged, change.path);
      if (proposedPath) cleanupTemp(proposedPath, stagedPaths, result);
      if (backupPath && !written.some(item => item.backupPath === backupPath)) {
        cleanupTemp(backupPath, stagedPaths, result);
      }
      rollback(written, stagedPaths, result);
      for (const remaining of applicable.slice(index + 1)) addUnique(result.unchanged, remaining.change.path);
      break;
    }
  }

  if (result.failed.length === 0 && result.manualRecovery.length === 0) {
    for (const item of written) {
      if (item.backupPath) cleanupTemp(item.backupPath, stagedPaths, result);
    }
  }

  for (const tempPath of stagedPaths) {
    cleanupTemp(tempPath, stagedPaths, result);
  }

  result.success =
    result.failed.length === 0 &&
    result.conflicts.length === 0 &&
    result.manualRecovery.length === 0;
  return result;
}
