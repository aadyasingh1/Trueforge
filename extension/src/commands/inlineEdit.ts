import * as vscode from 'vscode';
import { createSession } from '../agent/session';
import { guardWorkspacePath } from '../tools/pathGuard';
import { PendingChanges } from '../review/pendingChanges';
import { applyAccepted } from '../review/changeApplicator';
import { TrueForgeDiffProvider } from '../review/diffProvider';

export async function runInlineEdit(provider: TrueForgeDiffProvider) {
  try {
    const editor = vscode.window.activeTextEditor;
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!editor || !workspaceRoot) {
      await vscode.window.showWarningMessage('Open a file in a workspace to use inline edit.');
      return;
    }

    const guarded = guardWorkspacePath(editor.document.uri.fsPath, workspaceRoot);
    if (!guarded.allowed) {
      await vscode.window.showWarningMessage(guarded.error);
      return;
    }

    const instruction = await vscode.window.showInputBox({
      prompt: 'Describe the inline change',
      ignoreFocusOut: true,
    });
    if (!instruction) return;
    if (editor.document.isDirty && !(await editor.document.save())) return;

    const rel = vscode.workspace.asRelativePath(editor.document.uri, false);
    const selection = editor.selection;
    const selectedText = editor.document.getText(selection);
    const selectedLines = `${selection.start.line + 1}-${selection.end.line + 1}`;
    const existingIds = new Set(PendingChanges.getAll().map(change => change.id));
    const prompt = [
      `File path: ${rel}`,
      `Selected lines: ${selectedLines}`,
      `Selected text:\n${selectedText}`,
      `Instruction: ${instruction}`,
      `Call read_file with path "${rel}" to inspect the file.`,
      `Then call propose_file_change with path "${rel}", the COMPLETE new file content (keep unrelated lines identical), and a short reason.`,
      'Do not print code in chat.',
    ].join('\n\n');

    const change = await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `TrueForge: working on inline edit for ${rel}…`,
    }, async () => {
      const { client, sessionId } = await createSession();
      const stream = await client.sessions.createTurnStream(sessionId, {
        input: [{ type: 'user.message', content: prompt }],
      });
      for await (const event of stream) {
        if (event.type === 'turn.done') break;
      }
      return PendingChanges.getAll().reverse().find(candidate =>
        !existingIds.has(candidate.id) &&
        (candidate.path === rel || candidate.absPath === guarded.absPath)
      );
    });

    if (!change) {
      await vscode.window.showWarningMessage('the agent did not propose a change for this file');
      return;
    }
    if (change.hunks.length === 0) {
      PendingChanges.remove(change.id);
      await vscode.window.showInformationMessage('No changes were proposed for this file.');
      return;
    }

    const left = editor.document.uri;
    const right = provider.set(change.id, change.proposedContent);
    await vscode.commands.executeCommand('vscode.diff', left, right, `TrueForge Inline Edit: ${rel}`);

    const choice = await vscode.window.showInformationMessage(
      change.reason,
      'Accept & Apply',
      'Reject'
    );
    if (choice === 'Accept & Apply') {
      PendingChanges.acceptFile(change.id);
      const result = applyAccepted([change]);
      PendingChanges.remove(change.id);
      if (result.applied.includes(change.path)) {
        await vscode.window.showInformationMessage(`Inline edit applied to ${rel}.`);
      } else if (result.conflicts.includes(change.path)) {
        await vscode.window.showWarningMessage(`Inline edit conflict: ${rel} changed since the diff was made.`);
      } else {
        await vscode.window.showErrorMessage(`Failed to apply inline edit to ${rel}.`);
      }
    } else {
      PendingChanges.remove(change.id);
      await vscode.window.showInformationMessage('inline edit rejected. No files were modified.');
    }
  } catch (error) {
    await vscode.window.showErrorMessage(
      `TrueForge inline edit failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
