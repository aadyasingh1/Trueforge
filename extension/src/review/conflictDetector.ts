import * as fs from 'node:fs';
import { createHash } from 'node:crypto';
import type { PendingChange } from '../../../shared/types';

export function checkConflict(change: PendingChange): string | null {
  if (!fs.existsSync(change.absPath)) return 'File no longer exists';
  const disk = fs.readFileSync(change.absPath, 'utf8');
  const hash = createHash('sha256').update(disk).digest('hex');
  if (hash !== change.originalHash) return 'File changed since this diff was generated';
  return null;
}
