import * as path from 'node:path';
import * as fs from 'node:fs';

export function getWorkspaceRoot(): string {
  const folder = require('vscode').workspace.workspaceFolders?.[0];
  if (!folder) throw new Error('Voltix requires an open workspace');
  return fs.realpathSync(folder.uri.fsPath);
}

export function guardWorkspacePath(input: string, workspaceRoot = getWorkspaceRoot()):
  { allowed: true; absPath: string } | { allowed: false; error: string } {
  const resolved = path.resolve(workspaceRoot, input);
  if (resolved !== workspaceRoot && !resolved.startsWith(workspaceRoot + path.sep)) {
    return { allowed: false, error: 'Path is outside the workspace' };
  }
  try {
    if (!fs.existsSync(workspaceRoot)) {
      return { allowed: true, absPath: resolved };
    }
    const realWorkspace = fs.realpathSync(workspaceRoot);
    let candidate = fs.existsSync(resolved) ? resolved : path.dirname(resolved);
    while (!fs.existsSync(candidate) && candidate !== path.dirname(candidate)) {
      candidate = path.dirname(candidate);
    }
    if (fs.existsSync(candidate)) {
      const realCandidate = fs.realpathSync(candidate);
      if (realCandidate !== realWorkspace && !realCandidate.startsWith(realWorkspace + path.sep)) {
        return { allowed: false, error: 'Symlink points outside the workspace' };
      }
    }
  } catch (error) {
    return { allowed: false, error: String(error) };
  }
  return { allowed: true, absPath: resolved };
}
