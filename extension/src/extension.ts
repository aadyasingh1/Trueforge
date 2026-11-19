import * as vscode from 'vscode';
import * as fs from 'node:fs';
import { getLogger } from './utils/logger';
import { AgentPanel } from './ui/agentPanel';
import { AgentMode } from './commands/agentMode';
import { runInlineEdit } from './commands/inlineEdit';
import { TrueForgeDiffProvider } from './review/diffProvider';
import { PendingChanges } from './review/pendingChanges';
import { applyAccepted } from './review/changeApplicator';
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
      panel = new AgentPanel(context.extensionUri);
      agentMode = new AgentMode(panel);
      panel.setInboundHandler(async message => {
        if (message.type === 'submit') {
          try { await agentMode?.submit(message.text); } catch (error) {
            panel?.post({ type: 'error', message: error instanceof Error ? error.message : 'Request failed', recoverable: true });
          }
        } else if (message.type === 'cancel') {
          await agentMode?.cancel();
        } else if (message.type === 'accept_hunk') {
          PendingChanges.acceptHunk(message.changeId, message.hunkId);
        } else if (message.type === 'reject_hunk') {
          PendingChanges.rejectHunk(message.changeId, message.hunkId);
        } else if (message.type === 'accept_file') {
          PendingChanges.acceptFile(message.changeId);
        } else if (message.type === 'reject_file') {
          PendingChanges.rejectFile(message.changeId);
        } else if (message.type === 'apply_accepted') {
          const result = applyAccepted(PendingChanges.getAll());
          panel?.post({ type: 'apply_result', ...result });
        } else if (message.type === 'discard_all') {
          for (const change of PendingChanges.getAll()) panel?.post({ type: 'change_removed', changeId: change.id });
          PendingChanges.clear();
        }
      });
    }
    panel.reveal();
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('trueforge.openPanel', openPanel),
    vscode.commands.registerCommand('trueforge.inlineEdit', () => runInlineEdit(diffProvider)),
    vscode.commands.registerCommand('trueforge.applyAccepted', () => {
      const result = applyAccepted(PendingChanges.getAll());
      panel?.post({ type: 'apply_result', ...result });
    }),
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
    mcpServer = await startMcpServer(7891, input => {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) return;
      const guarded = guardWorkspacePath(input.path, root);
      if (!guarded.allowed) return;
      const original = fs.existsSync(guarded.absPath) ? fs.readFileSync(guarded.absPath, 'utf8') : '';
      const change = PendingChanges.add({
        path: vscode.workspace.asRelativePath(guarded.absPath),
        absPath: guarded.absPath,
        originalContent: original,
        proposedContent: input.proposedContent,
        reason: input.reason,
      });
      panel?.post({ type: 'pending_change', change });
    });
    logger.appendLine('MCP server listening on http://127.0.0.1:7891/mcp');
  } catch (error) {
    logger.appendLine(`MCP server failed to start: ${error instanceof Error ? error.message : error}`);
  }
}

export function deactivate() {
  void mcpServer?.close();
}
