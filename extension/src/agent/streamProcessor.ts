import type { TrueForge } from '@truefoundry/trueforge-sdk';
import type { PanelOutboundMessage } from '../../../shared/types';

export interface TurnResult {
  status: 'done' | 'cancelled' | 'error';
  message?: string;
}

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
  onStreamStarted?: () => void,
  options: { deferErrors?: boolean } = {}
): Promise<TurnResult> {
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
        if (!call || (delta.id && call.id && call.id !== delta.id)) {
          // A new tool call reusing this index (next model message): start fresh.
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
      callsByIndex.clear();
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
      if (event.state.status === 'error' && options.deferErrors) {
        // The caller will retry with a fallback model; it reports the error itself.
        return { status: 'error', message: event.state.message };
      }
      emit({ type: 'text_done', fullContent: full });
      if (event.state.status === 'error') {
        emit({ type: 'turn_done', status: 'error', message: event.state.message });
        return { status: 'error', message: event.state.message };
      } else if (event.state.status === 'cancelled') {
        emit({
          type: 'turn_done',
          status: 'cancelled',
          message: `Cancellation confirmed: ${event.state.reason}`,
        });
        return { status: 'cancelled', message: event.state.reason };
      } else {
        emit({ type: 'turn_done', status: 'done' });
      }
      return { status: 'done' };
    }
  }

  const missingTerminal = 'The event stream ended without a terminal turn event.';
  if (!sawTerminalEvent && options.deferErrors) return { status: 'error', message: missingTerminal };
  emit({ type: 'text_done', fullContent: full });
  if (!sawTerminalEvent) {
    emit({ type: 'turn_done', status: 'error', message: missingTerminal });
    return { status: 'error', message: missingTerminal };
  }
  return { status: 'done' };
}
