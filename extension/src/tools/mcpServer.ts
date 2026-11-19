import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import fg from 'fast-glob';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { guardWorkspacePath, getWorkspaceRoot } from './pathGuard';
import { runCommand } from './handlers/runCommand';

export async function startMcpServer(
  port = 7891,
  onProposedChange?: (input: { path: string; proposedContent: string; reason: string }) => void
): Promise<http.Server> {
  const server = new McpServer({ name: 'vscode-workspace', version: '1.0.0' });
  (server as any).tool('list_workspace_files', { pattern: z.string().optional() }, async ({ pattern }: { pattern?: string }) => {
    const root = getWorkspaceRoot();
    const files = await fg([pattern || '**/*'], { cwd: root, onlyFiles: true, ignore: ['**/node_modules/**', '**/.git/**'] });
    return { content: [{ type: 'text', text: JSON.stringify(files.slice(0, 500)) }] };
  });
  (server as any).tool('read_file', { path: z.string() }, async ({ path: file }: { path: string }) => {
    const guarded = guardWorkspacePath(file);
    if (!guarded.allowed) return { isError: true, content: [{ type: 'text', text: guarded.error }] };
    if (!fs.existsSync(guarded.absPath)) return { isError: true, content: [{ type: 'text', text: 'File not found' }] };
    return { content: [{ type: 'text', text: fs.readFileSync(guarded.absPath, 'utf8') }] };
  });
  (server as any).tool('search_workspace', { query: z.string() }, async ({ query }: { query: string }) => {
    const root = getWorkspaceRoot();
    const matches: string[] = [];
    const files = await fg(['**/*.{ts,tsx,js,jsx,py,json,md,html,css}'], { cwd: root, ignore: ['**/node_modules/**', '**/.git/**'] });
    for (const file of files) {
      const abs = path.resolve(root, file);
      if (fs.readFileSync(abs, 'utf8').toLowerCase().includes(query.toLowerCase())) matches.push(file);
      if (matches.length >= 200) break;
    }
    return { content: [{ type: 'text', text: JSON.stringify(matches) }] };
  });
  (server as any).tool('propose_file_change', {
    path: z.string(),
    proposedContent: z.string(),
    reason: z.string(),
  }, async ({ path: file, proposedContent, reason }: { path: string; proposedContent: string; reason: string }) => {
    onProposedChange?.({ path: file, proposedContent, reason });
    return { content: [{ type: 'text', text: 'Change registered for review' }] };
  });
  (server as any).tool('run_command', { command: z.string(), cwd: z.string().optional() }, async ({ command, cwd }: { command: string; cwd?: string }) => {
    const root = getWorkspaceRoot();
    const resolvedCwd = cwd ? require('node:path').resolve(root, cwd) : root;
    if (resolvedCwd !== root && !resolvedCwd.startsWith(root + require('node:path').sep)) {
      return { isError: true, content: [{ type: 'text', text: 'Working directory is outside workspace' }] };
    }
    try {
      const result = await runCommand(command, resolvedCwd);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : 'Command failed' }] };
    }
  });

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  const httpServer = http.createServer(async (req, res) => {
    if (req.url !== '/mcp') { res.writeHead(404).end(); return; }
    await transport.handleRequest(req, res);
  });
  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, '127.0.0.1', resolve);
  });
  return httpServer;
}
