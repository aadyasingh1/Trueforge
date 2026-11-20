import * as childProcess from 'node:child_process';
import * as vscode from 'vscode';
import type { CommandResult } from '../../../../shared/types';

const SAFE_COMMAND_PATTERNS = [
  /^python\s/,
  /^python3\s/,
  /^pip\s+install\b/,
  /^flask\b/,
  /^pytest\b/,
  /^npm\s+(test|run)\b/,
  /^npx\b/,
  /^git\s+(status|diff|log)\b/,
];

export function isCommandAllowed(command: string): boolean {
  return SAFE_COMMAND_PATTERNS.some(pattern => pattern.test(command.trim()));
}

export function scrubSecrets(output: string): string {
  return output.replace(/(?:password|secret|token|key)\s*[=:]\s*\S+/gi, '[REDACTED]');
}

export async function runCommand(command: string, cwd: string): Promise<CommandResult> {
  if (!isCommandAllowed(command)) {
    throw new Error('Command not in allowed list');
  }
  const choice = await vscode.window.showWarningMessage(
    `Voltix wants to run:\n${command}\n\nWorking directory: ${cwd}`,
    { modal: true },
    'Run',
    'Cancel'
  );
  if (choice !== 'Run') throw new Error('Command cancelled by user');
  const started = Date.now();
  return await new Promise(resolve => {
    const child = childProcess.spawn(command, {
      cwd,
      shell: true,
      timeout: 30000,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => stdout += chunk.toString());
    child.stderr.on('data', chunk => stderr += chunk.toString());
    child.on('close', (code, signal) => {
      const timedOut = signal === 'SIGTERM';
      const cap = (value: string) => value.length > 10000
        ? value.slice(0, 10000) + '\n[output truncated]'
        : value;
      resolve({
        command,
        stdout: scrubSecrets(cap(stdout)),
        stderr: scrubSecrets(cap(stderr)),
        exitCode: code ?? -1,
        timedOut,
        durationMs: Date.now() - started,
      });
    });
  });
}
