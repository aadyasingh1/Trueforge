import * as vscode from 'vscode';

export function getSettings() {
  const config = vscode.workspace.getConfiguration('trueforge');
  return {
    baseUrl: config.get<string>('baseUrl', 'http://localhost:8790'),
    model: config.get<string>('model', 'anthropic/claude-sonnet-4-6'),
    contextTokenBudget: config.get<number>('contextTokenBudget', 8000),
  };
}
