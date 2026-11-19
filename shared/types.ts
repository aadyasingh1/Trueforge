export type ContextSignal = 'explicit_mention' | 'symbol_match' | 'keyword_match' | 'filename_match' | 'import_relationship' | 'recency';

export interface ContextItem {
  path: string;
  absPath: string;
  startLine: number;
  endLine: number;
  content: string;
  signals: ContextSignal[];
  score: number;
  tokenEstimate: number;
}

export interface ContextReceipt {
  items: ContextItem[];
  excluded: number;
  totalTokens: number;
  budget: number;
  queryTerms: string[];
  assembledAt: number;
}

export type HunkLineType = 'context' | 'add' | 'remove';

export interface HunkLine { type: HunkLineType; content: string }

export interface Hunk {
  id: string;
  changeId: string;
  header: string;
  originalStart: number;
  originalCount: number;
  proposedStart: number;
  proposedCount: number;
  lines: HunkLine[];
  accepted: boolean | null;
}

export interface PendingChange {
  id: string;
  path: string;
  absPath: string;
  originalContent: string;
  originalHash: string;
  proposedContent: string;
  reason: string;
  hunks: Hunk[];
  fileDecision: boolean | null;
}

export type PanelOutboundMessage =
  | { type: 'text_delta'; content: string }
  | { type: 'text_done'; fullContent: string }
  | { type: 'tool_start'; id: string; name: string; argsPreview: string }
  | { type: 'tool_done'; id: string; resultPreview: string; isError: boolean }
  | { type: 'context_receipt'; receipt: ContextReceipt }
  | { type: 'pending_change'; change: PendingChange }
  | { type: 'change_removed'; changeId: string }
  | { type: 'turn_done'; status: 'done' | 'cancelled' | 'error'; message?: string }
  | { type: 'cancelled_with_proposals'; count: number }
  | { type: 'error'; message: string; recoverable: boolean }
  | { type: 'apply_result'; success: boolean; applied: string[]; failed: string[]; conflicts: string[] };

export type PanelInboundMessage =
  | { type: 'submit'; text: string }
  | { type: 'cancel' }
  | { type: 'accept_file'; changeId: string }
  | { type: 'reject_file'; changeId: string }
  | { type: 'accept_hunk'; changeId: string; hunkId: string }
  | { type: 'reject_hunk'; changeId: string; hunkId: string }
  | { type: 'apply_accepted' }
  | { type: 'discard_all' };

export interface WorkspaceFile { path: string; absPath: string; sizeBytes: number; language: string }
export interface SearchResult { path: string; absPath: string; line: number; column: number; lineContent: string }
export interface CommandResult { command: string; stdout: string; stderr: string; exitCode: number; timedOut: boolean; durationMs: number }
export type VerificationStatus = 'verified' | 'partial' | 'not_verified' | 'failed';
export interface VerificationReport {
  filesChanged: string[];
  filesAccepted: string[];
  filesRejected: string[];
  commandsRun: CommandResult[];
  overallPassed: boolean | null;
  status: VerificationStatus;
  summary: string;
}
