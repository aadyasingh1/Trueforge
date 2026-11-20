import * as vscode from 'vscode';

let output: vscode.OutputChannel | undefined;
export function getLogger(): vscode.OutputChannel {
  if (!output) output = vscode.window.createOutputChannel('Voltix');
  return output;
}
