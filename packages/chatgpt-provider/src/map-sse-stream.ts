import type { LanguageModelV1StreamPart } from '@ai-sdk/provider';

/**
 * Transform a raw SSE byte stream from the ChatGPT backend API into
 * AI SDK LanguageModelV1StreamPart objects.
 */
export function mapSSEStream(body: ReadableStream<Uint8Array>): ReadableStream<LanguageModelV1StreamPart> {
  let buffer = '';
  const decoder = new TextDecoder();
  const pendingTools = new Map<number, { id: string; name: string; args: string }>();
  let hasToolCalls = false;

  return body.pipeThrough(
    new TransformStream<Uint8Array, LanguageModelV1StreamPart>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });

        let idx = buffer.indexOf('\n\n');
        while (idx !== -1) {
          const raw = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);

          const dataLines = raw
            .split('\n')
            .filter((l) => l.startsWith('data:'))
            .map((l) => l.slice(5).trim());

          if (dataLines.length === 0) {
            idx = buffer.indexOf('\n\n');
            continue;
          }

          const data = dataLines.join('\n').trim();
          if (!data || data === '[DONE]') {
            idx = buffer.indexOf('\n\n');
            continue;
          }

          let event: any;
          try {
            event = JSON.parse(data);
          } catch {
            idx = buffer.indexOf('\n\n');
            continue;
          }

          const type = event.type as string;

          // Error
          if (type === 'error' || type === 'response.failed') {
            const msg = event.message || event.response?.error?.message || JSON.stringify(event);
            controller.enqueue({ type: 'error', error: new Error(msg) });
            idx = buffer.indexOf('\n\n');
            continue;
          }

          // Text delta
          if (type === 'response.output_text.delta') {
            controller.enqueue({ type: 'text-delta', textDelta: event.delta ?? '' });
          }

          // Tool call starts
          if (type === 'response.output_item.added' && event.item?.type === 'function_call') {
            const item = event.item;
            pendingTools.set(event.output_index, {
              id: item.call_id || item.id || `call-${Date.now()}`,
              name: item.name || '',
              args: '',
            });
            hasToolCalls = true;
          }

          // Tool call argument delta
          if (type === 'response.function_call_arguments.delta') {
            const tc = pendingTools.get(event.output_index);
            if (tc) {
              tc.args += event.delta ?? '';
              controller.enqueue({
                type: 'tool-call-delta',
                toolCallType: 'function',
                toolCallId: tc.id,
                toolName: tc.name,
                argsTextDelta: event.delta ?? '',
              });
            }
          }

          // Tool call complete
          if (type === 'response.output_item.done' && event.item?.type === 'function_call') {
            const item = event.item;
            const tc = pendingTools.get(event.output_index) || {
              id: item.call_id || item.id || `call-${Date.now()}`,
              name: item.name || '',
              args: item.arguments || '',
            };
            if (item.name) tc.name = item.name;
            if (item.arguments) tc.args = item.arguments;
            if (item.call_id) tc.id = item.call_id;

            controller.enqueue({
              type: 'tool-call',
              toolCallType: 'function',
              toolCallId: tc.id,
              toolName: tc.name,
              args: tc.args,
            });
            pendingTools.delete(event.output_index);
          }

          // Image generation — partial image during streaming.
          // Intentionally not emitted: the backend streams 1-3 near-final
          // previews plus the completed result. Showing each partial as a
          // separate <Image> produces duplicates; we only emit the final.
          // If you want a progressive preview, diff the file parts in the
          // UI instead of piping every partial into the stream.
          // if (type === 'response.image_generation_call.partial_image') { ... }

          // Image generation — final image
          if (
            type === 'response.output_item.done' &&
            event.item?.type === 'image_generation_call'
          ) {
            const b64 = event.item?.result;
            if (typeof b64 === 'string' && b64.length > 0) {
              controller.enqueue({ type: 'file', mimeType: 'image/png', data: b64 });
            }
          }

          // Response completed
          if (type === 'response.completed' || type === 'response.done') {
            const usage = event.response?.usage;
            controller.enqueue({
              type: 'finish',
              finishReason: hasToolCalls ? 'tool-calls' : 'stop',
              usage: {
                promptTokens: usage?.input_tokens ?? 0,
                completionTokens: usage?.output_tokens ?? 0,
              },
            });
          }

          idx = buffer.indexOf('\n\n');
        }
      },
    }),
  );
}
