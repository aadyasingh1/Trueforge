import { randomUUID, createHash } from 'node:crypto';
import type { PendingChange } from '../../../shared/types';
import { parseHunks } from './hunkParser';

const changes = new Map<string, PendingChange>();

export const PendingChanges = {
  add(input: Omit<PendingChange, 'id' | 'hunks' | 'originalHash' | 'fileDecision'>): PendingChange {
    const id = randomUUID();
    const hunks = parseHunks(input.originalContent, input.proposedContent, id);
    const change: PendingChange = {
      ...input,
      id,
      originalHash: createHash('sha256').update(input.originalContent).digest('hex'),
      hunks,
      fileDecision: null,
    };
    changes.set(id, change);
    return change;
  },
  getAll: () => [...changes.values()],
  get: (id: string) => changes.get(id),
  clear: () => changes.clear(),
  remove: (id: string) => changes.delete(id),
  acceptHunk(changeId: string, hunkId: string) {
    const change = changes.get(changeId);
    if (change) change.hunks.find(hunk => hunk.id === hunkId)!.accepted = true;
  },
  rejectHunk(changeId: string, hunkId: string) {
    const change = changes.get(changeId);
    if (change) change.hunks.find(hunk => hunk.id === hunkId)!.accepted = false;
  },
  acceptFile(changeId: string) {
    const change = changes.get(changeId);
    if (change) {
      change.fileDecision = true;
      change.hunks.forEach(hunk => hunk.accepted = true);
    }
  },
  rejectFile(changeId: string) {
    const change = changes.get(changeId);
    if (change) {
      change.fileDecision = false;
      change.hunks.forEach(hunk => hunk.accepted = false);
    }
  },
};
