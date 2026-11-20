import * as vscode from 'vscode';

export function getSettings() {
  const config = vscode.workspace.getConfiguration('voltix');
  return {
    baseUrl: config.get<string>('baseUrl', 'http://localhost:8790'),
    model: config.get<string>('model', 'openrouter/north-mini-code'),
    fallbackModels: config.get<string[]>('fallbackModels', []),
    contextTokenBudget: config.get<number>('contextTokenBudget', 8000),
  };
}

/** Primary model first, then each configured fallback model (duplicates removed). */
export function getModelChain(): string[] {
  const settings = getSettings();
  return [...new Set([settings.model, ...(settings.fallbackModels ?? [])].filter(Boolean))];
}
