import * as fs from 'node:fs';
import type { PendingChange } from '../../../shared/types';
import { checkConflict } from './conflictDetector';
import { applySelectedHunks } from './hunkApplicator';

export function applyAccepted(changes: PendingChange[]): {
  success: boolean; applied: string[]; failed: string[]; conflicts: string[]
} {
  const applied: PendingChange[] = [];
  const appliedPaths: string[] = [];
  const failed: string[] = [];
  const conflicts: string[] = [];
  for (const change of changes) {
    if (change.fileDecision === false) continue;
    if (!change.hunks.some(hunk => hunk.accepted === true) && change.fileDecision !== true) continue;
    const conflict = checkConflict(change);
    if (conflict) {
      conflicts.push(change.path);
      continue;
    }
    const result = applySelectedHunks(change);
    if (!result.content) {
      failed.push(change.path);
      continue;
    }
    applied.push(change);
  }
  for (const change of applied) {
    try {
      fs.writeFileSync(change.absPath, applySelectedHunks(change).content!);
      appliedPaths.push(change.path);
    } catch {
      failed.push(change.path);
      for (const written of applied.filter(item => item !== change)) {
        fs.writeFileSync(written.absPath, written.originalContent);
      }
      break;
    }
  }
  return { success: failed.length === 0 && conflicts.length === 0, applied: appliedPaths, failed, conflicts };
}
