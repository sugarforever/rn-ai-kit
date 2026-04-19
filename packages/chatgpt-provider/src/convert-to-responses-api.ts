import type { LanguageModelV1Prompt } from '@ai-sdk/provider';

export interface ResponsesAPIInput {
  instructions?: string;
  input: any[];
}

/**
 * Convert AI SDK LanguageModelV1Prompt to OpenAI Responses API input format.
 *
 * - system messages → `instructions` field (last one wins)
 * - user messages → `{ type: 'message', role: 'user', content: [{ type: 'input_text', text }] }`
 * - assistant text → `{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }`
 * - assistant tool-call → `{ type: 'function_call', call_id, name, arguments }`
 * - tool results → `{ type: 'function_call_output', call_id, output }`
 */
export function convertToResponsesAPI(prompt: LanguageModelV1Prompt): ResponsesAPIInput {
  let instructions: string | undefined;
  const input: any[] = [];

  for (const message of prompt) {
    switch (message.role) {
      case 'system':
        instructions = message.content;
        break;

      case 'user': {
        const textParts = message.content
          .filter((p) => p.type === 'text')
          .map((p) => ({ type: 'input_text' as const, text: (p as { type: 'text'; text: string }).text }));
        if (textParts.length > 0) {
          input.push({ type: 'message', role: 'user', content: textParts });
        }
        break;
      }

      case 'assistant': {
        const textParts = message.content.filter((p) => p.type === 'text');
        const toolCalls = message.content.filter((p) => p.type === 'tool-call');

        if (textParts.length > 0) {
          input.push({
            type: 'message',
            role: 'assistant',
            content: textParts.map((p) => ({
              type: 'output_text' as const,
              text: (p as { type: 'text'; text: string }).text,
            })),
          });
        }

        for (const tc of toolCalls) {
          const call = tc as { type: 'tool-call'; toolCallId: string; toolName: string; args: unknown };
          input.push({
            type: 'function_call',
            call_id: call.toolCallId,
            name: call.toolName,
            arguments: typeof call.args === 'string' ? call.args : JSON.stringify(call.args),
          });
        }
        break;
      }

      case 'tool': {
        for (const part of message.content) {
          const result = part as { type: 'tool-result'; toolCallId: string; result: unknown };
          input.push({
            type: 'function_call_output',
            call_id: result.toolCallId,
            output: typeof result.result === 'string' ? result.result : JSON.stringify(result.result),
          });
        }
        break;
      }
    }
  }

  return { instructions, input };
}
