import { createTrueForgeClient } from './client';
import { getSettings } from '../config/settings';

export async function createSession() {
  const client = createTrueForgeClient();
  const settings = getSettings();
  const response = await client.sessions.create({
    agent: {
      spec: {
        model: { name: settings.model },
        instructions: 'You are a transparent coding agent. Inspect workspace context, make surgical changes, and return file changes as unified diffs. Never edit files outside approved tool calls.',
        mcpServers: [{ name: 'vscode-workspace', enableTools: ['@all'] }],
        requireApprovalForTools: ['run_command'],
      },
    } as any,
  });
  return { client, sessionId: (response as any).data?.id ?? (response as any).id };
}
