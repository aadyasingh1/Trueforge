import type { TrueForge } from '@truefoundry/trueforge-sdk';
import type { PanelOutboundMessage } from '../../../shared/types';

interface ToolCallState {
  id?: string;
  name: string;
  arguments: string;
}

function safePreview(value: string, limit: number): string {
  return value
    .replace(/((?:password|secret|token|api[_-]?key)\s*[=:]\s*)(?:"[^"]*"|'[^']*'|\S+)/gi, '$1[REDACTED]')
    .slice(0, limit);
}

export async function processTurn(
  client: TrueForge,
  sessionId: string,
  input: string,
  emit: (message: PanelOutboundMessage) => void,
  onStreamStarted?: () => void
) {
  const stream = await client.sessions.createTurnStream(sessionId, {
    input: [{ type: 'user.message', content: input }],
  });
  onStreamStarted?.();

  let full = '';
  let sawTerminalEvent = false;
  const callsByIndex = new Map<number, ToolCallState>();
  const callsById = new Map<string, ToolCallState>();
  const startedCalls = new Set<string>();

  const rememberCall = (id: string, name: string, args: string) => {
    const call = { id, name, arguments: args };
    callsById.set(id, call);
    return call;
  };
  const emitToolRequest = (id: string, status: 'requested' | 'approval_required') => {
    const call = callsById.get(id);
    emit({
      type: 'tool_start',
      id,
      name: call?.name || 'Tool request',
      argsPreview: safePreview(call?.arguments || '', 240),
      status,
    });
    startedCalls.add(id);
  };

  for await (const event of stream) {
    if (event.type === 'model.message.delta') {
      const content = event.content ?? '';
      full += content;
      emit({ type: 'text_delta', content });
      for (const delta of event.toolCalls ?? []) {
        let call = callsByIndex.get(delta.index);
        if (!call) {
          call = { name: '', arguments: '' };
          callsByIndex.set(delta.index, call);
        }
        if (delta.id) {
          call.id = delta.id;
          callsById.set(delta.id, call);
        }
        call.name += delta.function?.name ?? '';
        call.arguments += delta.function?.arguments ?? '';
      }
    } else if (event.type === 'model.message') {
      for (const call of event.toolCalls ?? []) {
        rememberCall(call.id, call.function.name, call.function.arguments);
      }
    } else if (event.type === 'tool.approval_required') {
      for (const toolCall of event.toolCalls) {
        if (!startedCalls.has(toolCall.id)) emitToolRequest(toolCall.id, 'approval_required');
      }
    } else if (event.type === 'tool.response_required') {
      for (const toolCall of event.toolCalls) {
        emitToolRequest(toolCall.id, 'requested');
      }
    } else if (event.type === 'tool.response') {
      const call = callsById.get(event.toolCallId);
      emit({
        type: 'tool_done',
        id: event.toolCallId,
        name: call?.name,
        resultPreview: safePreview(event.content, 500),
      });
    } else if (event.type === 'turn.done') {
      sawTerminalEvent = true;
      emit({ type: 'text_done', fullContent: full });
      if (event.state.status === 'error') {
        emit({ type: 'turn_done', status: 'error', message: event.state.message });
      } else if (event.state.status === 'cancelled') {
        emit({
          type: 'turn_done',
          status: 'cancelled',
          message: `Cancellation confirmed: ${event.state.reason}`,
        });
      } else {
        emit({ type: 'turn_done', status: 'done' });
      }
      return;
    }
  }

  emit({ type: 'text_done', fullContent: full });
  if (!sawTerminalEvent) {
    emit({
      type: 'turn_done',
      status: 'error',
      message: 'The event stream ended without a terminal turn event.',
    });
  }
}
