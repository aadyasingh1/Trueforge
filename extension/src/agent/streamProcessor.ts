import type { TrueForge } from '@truefoundry/trueforge-sdk';
import type { PanelOutboundMessage } from '../../../shared/types';

export async function processTurn(
  client: TrueForge,
  sessionId: string,
  input: string,
  emit: (message: PanelOutboundMessage) => void
) {
  const stream = await client.sessions.createTurnStream(sessionId, {
    input: [{ type: 'user.message', content: input }],
  });
  let full = '';
  for await (const event of stream) {
    if (event.type === 'model.message.delta') {
      const content = event.content ?? '';
      full += content;
      emit({ type: 'text_delta', content });
    } else if (event.type === 'tool.response') {
      emit({ type: 'tool_done', id: event.toolCallId, resultPreview: event.content.slice(0, 500), isError: false });
    } else if (event.type === 'turn.done') {
      emit({ type: 'text_done', fullContent: full });
      emit({ type: 'turn_done', status: event.state.status as 'done' | 'cancelled' | 'error' });
      return;
    }
  }
  emit({ type: 'text_done', fullContent: full });
}
