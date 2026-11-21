import * as vscode from 'vscode';
import type { AgentPanel } from '../ui/agentPanel';
import { createSession } from '../agent/session';
import { processTurn } from '../agent/streamProcessor';
import { assembleContext } from '../context/retriever';
import { getSettings, getModelChain } from '../config/settings';
import { getWorkspaceRoot } from '../tools/pathGuard';
import { getLogger } from '../utils/logger';
import { PendingChanges } from '../review/pendingChanges';
import { buildPassport } from '../review/passport';
import { validateVerifyCommand } from '../verify/sandbox';
import { chooseCommand, currentRecord, verifyPending, type VerificationRecord } from '../verify/verifier';
import type { ChangePassport, PanelOutboundMessage } from '../../../shared/types';

type Session = Awaited<ReturnType<typeof createSession>>;
type Emit = (message: PanelOutboundMessage) => void;

function buildFixPrompt(record: VerificationRecord, round: number, maxRounds: number): string {
  const tail = record.output.length > 6000 ? '[...]\n' + record.output.slice(-6000) : record.output;
  return [
    `Automatic verification FAILED (fix round ${round} of ${maxRounds}).`,
    `Voltix ran \`${record.command}\` against your pending edits in a sandbox copy of the workspace: ${record.summary}`,
    '',
    'Output (tail):',
    '```',
    tail,
    '```',
    '',
    'Find the root cause and fix it with edit_file. If a test expectation contradicts the requirement, fix the test;',
    'if the code is wrong, fix the code. Never delete tests or assertions just to make them pass, and do not touch unrelated files.',
    `Then call verify_changes with \`${record.command}\` and finish with a one-paragraph summary of what you fixed.`,
  ].join('\n');
}

export class AgentMode {
  private client: Session['client'] | undefined;
  private sessionId: string | undefined;
  private sessionModel: string | undefined;
  private cancelled = false;
  lastPassport: ChangePassport | null = null;

  constructor(private panel: AgentPanel) {}

  setPanel(panel: AgentPanel) {
    this.panel = panel;
  }

  async submit(text: string) {
    const emit: Emit = message => this.panel.post(message);
    const root = getWorkspaceRoot();
    const context = await assembleContext(text, root, getSettings().contextTokenBudget);
    const enriched = `${text}\n\nSelected workspace context:\n${context.items.map(item => `${item.path}\n${item.content}`).join('\n\n')}`;
    this.cancelled = false;

    // Primary model first; on failure, automatically fall back to the next configured model.
    const models = getModelChain();
    const currentIndex = this.sessionModel ? Math.max(0, models.indexOf(this.sessionModel)) : 0;
    const chain = [...models.slice(currentIndex), ...models.slice(0, currentIndex)];
    let lastError = 'Unknown error';

    for (let index = 0; index < chain.length; index++) {
      const model = chain[index];
      const isLast = index === chain.length - 1;
      emit({ type: 'model_info', model, fallbackFrom: index > 0 ? chain[index - 1] : undefined });
      try {
        if (!this.client || !this.sessionId || this.sessionModel !== model) {
          const session = await createSession(model);
          this.client = session.client;
          this.sessionId = session.sessionId;
          this.sessionModel = model;
        }
        const result = await processTurn(this.client, this.sessionId!, enriched, emit, () => {
          emit({ type: 'context_receipt', receipt: context.receipt });
        }, { deferErrors: !isLast });
        if (result.status === 'done') {
          await this.afterTurn(emit, model);
          return;
        }
        if (result.status === 'cancelled') return;
        lastError = result.message || 'The model returned an error';
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        if (isLast) throw new Error(`Model "${model}" failed: ${lastError}`);
      }
      if (this.cancelled) return;
      if (isLast) return;
      this.client = undefined;
      this.sessionId = undefined;
      const next = chain[index + 1];
      const notice = `Voltix: model "${model}" failed (${lastError}). Switching automatically to "${next}".`;
      getLogger().appendLine(notice);
      void vscode.window.showWarningMessage(notice);
      emit({ type: 'text_delta', content: `⚠ ${notice}\n\n` });
    }
  }

  /** Verify-before-apply loop, then the Change Passport. */
  private async afterTurn(emit: Emit, model: string) {
    const settings = getSettings();
    let fixRounds = 0;
    try {
      if (settings.verifyEnabled && PendingChanges.getAll().length) {
        const maxRounds = settings.verifyMaxFixRounds;
        for (;;) {
          if (this.cancelled) break;
          const command = chooseCommand();
          const invalid = command ? validateVerifyCommand(command) : 'No test command found. Set voltix.verify.command to enable verification.';
          if (!command || invalid) {
            emit({ type: 'verification', phase: 'skipped', command, summary: invalid ?? '', round: fixRounds, maxRounds, source: 'auto' });
            break;
          }
          let record = currentRecord();
          // Reuse the agent's own verify_changes result when it already covers these exact pending changes.
          const fresh = !record || record.command !== command;
          if (fresh) {
            emit({ type: 'busy', busy: true, label: 'Verifying the proposed changes in a sandbox…' });
            emit({ type: 'verification', phase: 'running', command, summary: 'Running tests against the pending changes in a sandbox copy…', round: fixRounds, maxRounds, source: 'auto' });
            try {
              record = await verifyPending(command, 'auto');
            } catch (error) {
              emit({ type: 'verification', phase: 'skipped', command, summary: error instanceof Error ? error.message : String(error), round: fixRounds, maxRounds, source: 'auto' });
              break;
            }
          }
          if (!record) break;
          if (fresh) {
            emit({
              type: 'verification', phase: record.passed ? 'passed' : 'failed', command: record.command, summary: record.summary,
              round: fixRounds, maxRounds, source: record.source, output: record.output.slice(-4000), durationMs: record.durationMs,
            });
          }
          if (record.passed || fixRounds >= maxRounds || !this.client || !this.sessionId || this.cancelled) break;

          fixRounds++;
          emit({ type: 'verification', phase: 'fixing', command: record.command, summary: `Sending the failures back to the agent (fix round ${fixRounds} of ${maxRounds})…`, round: fixRounds, maxRounds, source: 'auto' });
          emit({ type: 'busy', busy: true, label: `Agent is fixing the failing tests (round ${fixRounds} of ${maxRounds})…` });
          const result = await processTurn(this.client, this.sessionId, buildFixPrompt(record, fixRounds, maxRounds), emit, undefined, {});
          if (result.status !== 'done') break;
        }
      }
    } finally {
      emit({ type: 'busy', busy: false });
    }

    const changes = PendingChanges.getAll();
    if (!changes.length) {
      this.lastPassport = null;
      emit({ type: 'passport', passport: null });
      return;
    }
    const record = currentRecord();
    try {
      this.lastPassport = await buildPassport(
        getWorkspaceRoot(),
        changes,
        record ? { passed: record.passed, command: record.command, summary: record.summary, fixRounds } : undefined,
        model
      );
      emit({ type: 'passport', passport: this.lastPassport });
    } catch (error) {
      getLogger().appendLine(`Change Passport failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  async cancel() {
    this.cancelled = true;
    if (this.client && this.sessionId) await this.client.sessions.cancel(this.sessionId, {});
  }
}
