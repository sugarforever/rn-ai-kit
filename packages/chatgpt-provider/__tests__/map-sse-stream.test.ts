import { mapSSEStream } from '../src/map-sse-stream';
import type { LanguageModelV1StreamPart } from '@ai-sdk/provider';

/** Helper: create a ReadableStream from an array of SSE text chunks. */
function sseStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

/** Helper: collect all parts from a stream. */
async function collectParts(stream: ReadableStream<LanguageModelV1StreamPart>) {
  const parts: LanguageModelV1StreamPart[] = [];
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
  }
  return parts;
}

describe('mapSSEStream', () => {
  it('maps text delta events', async () => {
    const body = sseStream([
      'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"Hello"}\n\n',
      'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":" world"}\n\n',
      'event: response.completed\ndata: {"type":"response.completed","response":{"status":"completed","usage":{"input_tokens":10,"output_tokens":5}}}\n\n',
    ]);
    const parts = await collectParts(mapSSEStream(body));

    expect(parts).toEqual([
      { type: 'text-delta', textDelta: 'Hello' },
      { type: 'text-delta', textDelta: ' world' },
      { type: 'finish', finishReason: 'stop', usage: { promptTokens: 10, completionTokens: 5 } },
    ]);
  });

  it('maps tool call events', async () => {
    const body = sseStream([
      'event: response.output_item.added\ndata: {"type":"response.output_item.added","output_index":0,"item":{"type":"function_call","call_id":"call-1","name":"get_weather"}}\n\n',
      'event: response.function_call_arguments.delta\ndata: {"type":"response.function_call_arguments.delta","output_index":0,"delta":"{\\"city\\""}\n\n',
      'event: response.function_call_arguments.delta\ndata: {"type":"response.function_call_arguments.delta","output_index":0,"delta":":\\"SF\\"}"}\n\n',
      'event: response.output_item.done\ndata: {"type":"response.output_item.done","output_index":0,"item":{"type":"function_call","call_id":"call-1","name":"get_weather","arguments":"{\\"city\\":\\"SF\\"}"}}\n\n',
      'event: response.completed\ndata: {"type":"response.completed","response":{"status":"completed","usage":{"input_tokens":10,"output_tokens":8}}}\n\n',
    ]);
    const parts = await collectParts(mapSSEStream(body));

    expect(parts).toEqual([
      { type: 'tool-call-delta', toolCallType: 'function', toolCallId: 'call-1', toolName: 'get_weather', argsTextDelta: '{"city"' },
      { type: 'tool-call-delta', toolCallType: 'function', toolCallId: 'call-1', toolName: 'get_weather', argsTextDelta: ':"SF"}' },
      { type: 'tool-call', toolCallType: 'function', toolCallId: 'call-1', toolName: 'get_weather', args: '{"city":"SF"}' },
      { type: 'finish', finishReason: 'tool-calls', usage: { promptTokens: 10, completionTokens: 8 } },
    ]);
  });

  it('maps error events', async () => {
    const body = sseStream([
      'event: error\ndata: {"type":"error","message":"Rate limited"}\n\n',
    ]);
    const parts = await collectParts(mapSSEStream(body));

    expect(parts).toEqual([
      { type: 'error', error: new Error('Rate limited') },
    ]);
  });

  it('handles [DONE] sentinel', async () => {
    const body = sseStream([
      'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"Hi"}\n\n',
      'data: [DONE]\n\n',
    ]);
    const parts = await collectParts(mapSSEStream(body));

    expect(parts).toEqual([
      { type: 'text-delta', textDelta: 'Hi' },
    ]);
  });

  it('maps image_generation_call completion to a file part', async () => {
    const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const body = sseStream([
      `event: response.output_item.added\ndata: {"type":"response.output_item.added","output_index":0,"item":{"type":"image_generation_call","id":"ig_1","status":"in_progress"}}\n\n`,
      `event: response.output_item.done\ndata: {"type":"response.output_item.done","output_index":0,"item":{"type":"image_generation_call","id":"ig_1","status":"completed","result":"${b64}","revised_prompt":"A gray tabby cat"}}\n\n`,
      'event: response.completed\ndata: {"type":"response.completed","response":{"status":"completed","usage":{"input_tokens":10,"output_tokens":0}}}\n\n',
    ]);
    const parts = await collectParts(mapSSEStream(body));

    expect(parts).toEqual([
      { type: 'file', mimeType: 'image/png', data: b64 },
      { type: 'finish', finishReason: 'stop', usage: { promptTokens: 10, completionTokens: 0 } },
    ]);
  });

  it('ignores partial_image events to avoid duplicate images', async () => {
    const b64 = 'FINAL';
    const body = sseStream([
      `event: response.image_generation_call.partial_image\ndata: {"type":"response.image_generation_call.partial_image","partial_image_index":0,"partial_image_b64":"AAAA"}\n\n`,
      `event: response.image_generation_call.partial_image\ndata: {"type":"response.image_generation_call.partial_image","partial_image_index":1,"partial_image_b64":"BBBB"}\n\n`,
      `event: response.output_item.done\ndata: {"type":"response.output_item.done","output_index":0,"item":{"type":"image_generation_call","id":"ig_1","status":"completed","result":"${b64}"}}\n\n`,
      'event: response.completed\ndata: {"type":"response.completed","response":{"status":"completed","usage":{"input_tokens":1,"output_tokens":1}}}\n\n',
    ]);
    const parts = await collectParts(mapSSEStream(body));

    expect(parts).toEqual([
      { type: 'file', mimeType: 'image/png', data: b64 },
      { type: 'finish', finishReason: 'stop', usage: { promptTokens: 1, completionTokens: 1 } },
    ]);
  });

  it('handles chunked SSE data split across reads', async () => {
    const body = sseStream([
      'event: response.output_text.delta\ndata: {"type":"respo',
      'nse.output_text.delta","delta":"Hi"}\n\n',
      'event: response.completed\ndata: {"type":"response.completed","response":{"status":"completed","usage":{"input_tokens":1,"output_tokens":1}}}\n\n',
    ]);
    const parts = await collectParts(mapSSEStream(body));

    expect(parts[0]).toEqual({ type: 'text-delta', textDelta: 'Hi' });
    expect(parts[1]).toEqual({ type: 'finish', finishReason: 'stop', usage: { promptTokens: 1, completionTokens: 1 } });
  });
});
