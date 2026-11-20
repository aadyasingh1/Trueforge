import * as vscode from 'vscode';
import { getLogger } from './utils/logger';
import { AgentPanel } from './ui/agentPanel';
import { AgentMode } from './commands/agentMode';
import { runInlineEdit } from './commands/inlineEdit';
import { TrueForgeDiffProvider } from './review/diffProvider';
import { PendingChanges } from './review/pendingChanges';
import { applyAndRecord, undoLastApply, canUndo } from './review/undoStack';
import { captureOriginalFile } from './review/conflictDetector';
import { startMcpServer } from './tools/mcpServer';
import { guardWorkspacePath } from './tools/pathGuard';

let mcpServer: import('node:http').Server | undefined;

export async function activate(context: vscode.ExtensionContext) {
  const logger = getLogger();
  logger.appendLine('TrueForge activated');
  const diffProvider = new TrueForgeDiffProvider();
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider('trueforge', diffProvider)
  );

  let panel: AgentPanel | undefined;
  let agentMode: AgentMode | undefined;
  const openPanel = () => {
    if (!panel) {
      const newPanel = new AgentPanel(context.extensionUri);
      panel = newPanel;
      if (agentMode) agentMode.setPanel(newPanel);
      else agentMode = new AgentMode(newPanel);
      newPanel.setInboundHandler(async message => {
        if (message.type === 'submit') {
          try { await agentMode?.submit(message.text); } catch (error) {
            newPanel.post({ type: 'error', message: error instanceof Error ? error.message : 'Request failed', recoverable: true });
          }
        } else if (message.type === 'cancel') {
          try { await agentMode?.cancel(); } catch (error) {
            newPanel.post({ type: 'error', message: error instanceof Error ? error.message : 'Cancellation failed', recoverable: true });
          }
        } else if (message.type === 'accept_hunk') {
          PendingChanges.acceptHunk(message.changeId, message.hunkId);
        } else if (message.type === 'reject_hunk') {
          PendingChanges.rejectHunk(message.changeId, message.hunkId);
        } else if (message.type === 'accept_file') {
          PendingChanges.acceptFile(message.changeId);
        } else if (message.type === 'reject_file') {
          PendingChanges.rejectFile(message.changeId);
        } else if (message.type === 'apply_accepted') {
          applyWithUndo();
        } else if (message.type === 'discard_all') {
          for (const change of PendingChanges.getAll()) newPanel.post({ type: 'change_removed', changeId: change.id });
          PendingChanges.clear();
        }
      });
      newPanel.onDidDispose(() => {
        if (panel === newPanel) panel = undefined;
      });
      for (const change of PendingChanges.getAll()) {
        newPanel.post({ type: 'pending_change', change });
      }
    }
    panel.reveal();
  };

  const undo = () => {
    if (!canUndo()) {
      void vscode.window.showInformationMessage('TrueForge: nothing to undo.');
      return;
    }
    const { restored, skipped } = undoLastApply();
    const parts = [];
    if (restored.length) parts.push(`restored ${restored.join(', ')}`);
    if (skipped.length) parts.push(`left ${skipped.join(', ')} alone because it was edited after the apply`);
    void vscode.window.showInformationMessage(`TrueForge undo: ${parts.join('; ') || 'no files changed'}.`);
  };

  const applyWithUndo = () => {
    const result = applyAndRecord(PendingChanges.getAll());
    panel?.post({ type: 'apply_result', ...result });
    if (result.applied.length) {
      void vscode.window.showInformationMessage(
        `TrueForge applied ${result.applied.length} file(s): ${result.applied.join(', ')}`,
        'Undo'
      ).then(choice => { if (choice === 'Undo') undo(); });
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('trueforge.openPanel', openPanel),
    vscode.commands.registerCommand('trueforge.undoLastApply', undo),
    vscode.commands.registerCommand('trueforge.inlineEdit', () => runInlineEdit(diffProvider)),
    vscode.commands.registerCommand('trueforge.applyAccepted', applyWithUndo),
    vscode.commands.registerCommand('trueforge.acceptInlineEdit', () => {
      const active = PendingChanges.getAll().at(-1);
      if (active) PendingChanges.acceptFile(active.id);
    }),
    vscode.commands.registerCommand('trueforge.rejectInlineEdit', () => {
      const active = PendingChanges.getAll().at(-1);
      if (active) PendingChanges.rejectFile(active.id);
    }),
    vscode.commands.registerCommand('trueforge.discardAll', () => PendingChanges.clear())
  );

  try {
    const findPending = (absPath: string) => PendingChanges.getAll().find(change => change.absPath === absPath);
    mcpServer = await startMcpServer(7891, {
      getPendingContent: absPath => findPending(absPath)?.proposedContent,
      onProposedChange: input => {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root) return;
        const guarded = guardWorkspacePath(input.path, root);
        if (!guarded.allowed) return;
        // Several edits to one file merge into ONE proposal, diffed against the original on disk.
        const existing = findPending(guarded.absPath);
        const original = existing
          ? { originalExists: existing.originalExists, originalContent: existing.originalContent }
          : captureOriginalFile(guarded.absPath);
        if (existing) {
          PendingChanges.remove(existing.id);
          panel?.post({ type: 'change_removed', changeId: existing.id });
        }
        const reason = existing && existing.reason !== input.reason ? `${existing.reason}\n${input.reason}` : input.reason;
        const change = PendingChanges.add({
          path: vscode.workspace.asRelativePath(guarded.absPath),
          absPath: guarded.absPath,
          ...original,
          proposedContent: input.proposedContent,
          reason,
        });
        panel?.post({ type: 'pending_change', change });
      },
    });
    logger.appendLine('MCP server listening on http://127.0.0.1:7891/mcp');
  } catch (error) {
    logger.appendLine(`MCP server failed to start: ${error instanceof Error ? error.message : error}`);
  }
}

export function deactivate() {
  void mcpServer?.close();
}
