import type { AgentPanel } from '../ui/agentPanel';
import { createSession } from '../agent/session';
import { processTurn } from '../agent/streamProcessor';
import { assembleContext } from '../context/retriever';
import { getSettings } from '../config/settings';
import { getWorkspaceRoot } from '../tools/pathGuard';
import type { PanelOutboundMessage } from '../../../shared/types';

export class AgentMode {
  private client: Awaited<ReturnType<typeof createSession>>['client'] | undefined;
  private sessionId: string | undefined;

  constructor(private panel: AgentPanel) {}

  async submit(text: string) {
    const emit = (message: PanelOutboundMessage) => this.panel.post(message);
    const root = getWorkspaceRoot();
    const context = await assembleContext(text, root, getSettings().contextTokenBudget);
    emit({ type: 'context_receipt', receipt: context.receipt });
    if (!this.client || !this.sessionId) {
      const session = await createSession();
      this.client = session.client;
      this.sessionId = session.sessionId;
    }
    const sessionId = this.sessionId;
    if (!sessionId) throw new Error('TrueForge session could not be created');
    const enriched = `${text}\n\nSelected workspace context:\n${context.items.map(item => `${item.path}\n${item.content}`).join('\n\n')}`;
    await processTurn(this.client, sessionId, enriched, emit);
  }

  async cancel() {
    if (this.client && this.sessionId) await this.client.sessions.cancel(this.sessionId, {});
  }
}
