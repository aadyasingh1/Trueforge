import { createTrueForgeClient } from './client';
import { getSettings } from '../config/settings';

export async function createSession() {
  const client = createTrueForgeClient();
  const settings = getSettings();
  const response = await client.sessions.create({
    agent: {
      spec: {
        model: { name: settings.model },
        instructions: [
          "You are TrueForge, a transparent coding agent working inside the user's VS Code workspace.",
          'You can only change files through the vscode-workspace tools.',
          'Workflow for every code change request:',
          '1. Use read_file (and list_workspace_files / search_workspace if needed) to inspect the relevant files.',
          '2. Make the smallest, surgical change that fixes the problem. Do not reformat or touch unrelated code.',
          '3. ALWAYS call propose_file_change with the path, the COMPLETE new file content, and a short reason.',
          '   Never just print the corrected code in chat. The user reviews and accepts proposed changes in VS Code.',
          '4. After proposing, reply with a one or two sentence summary of what you changed and why.',
        ].join('\n'),
        mcpServers: [{
          name: 'vscode-workspace',
          enableTools: ['@all'],
          // Preload loads all tool schemas up front so the model can call them directly.
          preload: true,
          // Only run_command needs approval; proposed changes still require user acceptance in the panel.
          requireApprovalForTools: ['run_command'],
        }],
      },
    } as any,
  });
  return { client, sessionId: (response as any).data?.id ?? (response as any).id };
}
