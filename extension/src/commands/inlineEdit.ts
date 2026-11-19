import * as vscode from 'vscode';
import * as fs from 'node:fs';
import { createSession } from '../agent/session';
import { assembleContext } from '../context/retriever';
import { getSettings } from '../config/settings';
import { guardWorkspacePath } from '../tools/pathGuard';
import { PendingChanges } from '../review/pendingChanges';
import { TrueForgeDiffProvider } from '../review/diffProvider';

export async function runInlineEdit(provider: TrueForgeDiffProvider) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const instruction = await vscode.window.showInputBox({ prompt: 'Describe the inline change', ignoreFocusOut: true });
  if (!instruction) return;
  const selection = editor.document.getText(editor.selection);
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) return;
  const guarded = guardWorkspacePath(editor.document.uri.fsPath, workspaceRoot);
  if (!guarded.allowed) {
    vscode.window.showErrorMessage(guarded.error);
    return;
  }
  const context = await assembleContext(instruction, workspaceRoot, getSettings().contextTokenBudget);
  try {
    const { client, sessionId } = await createSession();
    const stream = await client.sessions.createTurnStream(sessionId, {
      input: [{ type: 'user.message', content: `Selection:\n${selection}\n\nSupporting context:\n${context.items.map(item => `${item.path}\n${item.content}`).join('\n\n')}\n\nInstruction:\n${instruction}\n\nReturn a unified diff only, with a +++/--- header.` }],
    });
    let response = '';
    for await (const event of stream) {
      if (event.type === 'model.message.delta') response += event.content ?? '';
      if (event.type === 'turn.done') break;
    }
    const diffMatch = response.match(/---[\\s\\S]*?\*\*\* End Patch|```diff\s*\n([\s\S]*?)```|(?:--- [^\n]+\n\+\+\+ [^\n]+\n@@[\s\S]*)/);
    const patch = diffMatch?.[1] ?? diffMatch?.[0];
    if (!patch) throw new Error('The agent did not return a unified diff');
    const original = editor.document.getText();
    const proposedMatch = patch.match(/^\+\+\+\s+[^\n]*\n([\s\S]*)/m);
    let proposed = original;
    if (proposedMatch) {
      for (const line of proposedMatch[1].split(/\r?\n/)) {
        if (line.startsWith('+') && !line.startsWith('+++')) {
          // Placeholder: hunk application will validate the final diff.
        }
      }
    }
    const { applyPatch } = await import('diff');
    const applied = applyPatch(original, patch, { fuzzFactor: 0 });
    if (applied === false) throw new Error('Could not parse or apply the agent diff');
    proposed = applied;
    const rel = vscode.workspace.asRelativePath(editor.document.uri);
    const change = PendingChanges.add({
      path: rel,
      absPath: guarded.absPath,
      originalContent: original,
      proposedContent: proposed,
      reason: instruction,
    });
    const left = editor.document.uri;
    const right = provider.set(change.id, proposed);
    await vscode.commands.executeCommand('vscode.diff', left, right, `TrueForge Inline Edit: ${rel}`);
  } catch (error) {
    vscode.window.showErrorMessage(error instanceof Error ? error.message : 'Inline edit failed');
  }
}
