import { PendingChanges } from '../review/pendingChanges';
import { getWorkspaceRoot } from '../tools/pathGuard';
import { getSettings } from '../config/settings';
import { fingerprintFiles, inferVerifyCommand, runInSandbox, type SandboxFile, type SandboxResult } from './sandbox';

export interface VerificationRecord extends SandboxResult {
  fingerprint: string;
  source: 'agent' | 'auto';
}

let lastRecord: VerificationRecord | undefined;
let lastAgentCommand: string | undefined;

export function pendingFiles(): SandboxFile[] {
  return PendingChanges.getAll().map(change => ({ path: change.path, content: change.proposedContent }));
}

export function currentFingerprint(): string {
  return fingerprintFiles(pendingFiles());
}

/** The verification result for the CURRENT pending changes, if one exists. */
export function currentRecord(): VerificationRecord | undefined {
  return lastRecord && lastRecord.fingerprint === currentFingerprint() ? lastRecord : undefined;
}

export function resetVerification() {
  lastRecord = undefined;
  lastAgentCommand = undefined;
}

/** Command priority: user setting, then the command the agent chose, then an inferred one. */
export function chooseCommand(): string | undefined {
  const configured = getSettings().verifyCommand.trim();
  if (configured) return configured;
  if (lastAgentCommand) return lastAgentCommand;
  return inferVerifyCommand(getWorkspaceRoot(), pendingFiles());
}

export async function verifyPending(command: string, source: 'agent' | 'auto'): Promise<VerificationRecord> {
  const files = pendingFiles();
  if (source === 'agent') lastAgentCommand = command;
  const result = await runInSandbox(getWorkspaceRoot(), files, command);
  lastRecord = { ...result, fingerprint: fingerprintFiles(files), source };
  return lastRecord;
}

/** What the agent sees after verify_changes (kept well under TrueForge's 24,000-character tool limit). */
export function formatForAgent(record: VerificationRecord): string {
  const tail = record.output.length > 8000 ? '[...]\n' + record.output.slice(-8000) : record.output;
  return [
    `${record.passed ? 'PASSED' : 'FAILED'}: ${record.summary}`,
    `Command: ${record.command} (${(record.durationMs / 1000).toFixed(1)}s)`,
    "Ran against your PENDING edits in a sandbox copy of the workspace; the user's files were not touched.",
    '',
    'Output (tail):',
    tail || '(no output)',
  ].join('\n');
}
