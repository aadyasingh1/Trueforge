import * as fs from 'node:fs';
import { createHash } from 'node:crypto';
import type { PendingChange } from '../../../shared/types';

export interface OriginalFileSnapshot {
  originalExists: boolean;
  originalContent: string;
}

function getErrorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string') {
    return error.code;
  }
  return undefined;
}

function readRegularFile(absPath: string): string {
  const linkStats = fs.lstatSync(absPath);
  if (linkStats.isSymbolicLink() || !linkStats.isFile()) {
    throw new Error('Only regular files can be reviewed or applied safely');
  }

  const descriptor = fs.openSync(absPath, 'r');
  try {
    if (!fs.fstatSync(descriptor).isFile()) {
      throw new Error('Only regular files can be reviewed or applied safely');
    }
    return fs.readFileSync(descriptor, 'utf8');
  } finally {
    fs.closeSync(descriptor);
  }
}

export function captureOriginalFile(absPath: string): OriginalFileSnapshot {
  try {
    return { originalExists: true, originalContent: readRegularFile(absPath) };
  } catch (error) {
    if (getErrorCode(error) === 'ENOENT') {
      return { originalExists: false, originalContent: '' };
    }
    throw error;
  }
}

export function checkConflict(change: PendingChange): string | null {
  let disk: string;
  try {
    disk = readRegularFile(change.absPath);
  } catch (error) {
    const code = getErrorCode(error);
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      return change.originalExists ? 'File no longer exists' : null;
    }
    if (code === 'ELOOP') return 'Symbolic links cannot be applied safely';
    return error instanceof Error ? error.message : 'Unable to inspect file';
  }

  if (!change.originalExists) return 'File appeared since this change was proposed';
  const hash = createHash('sha256').update(disk).digest('hex');
  if (hash !== change.originalHash) return 'File changed since this diff was generated';
  return null;
}
