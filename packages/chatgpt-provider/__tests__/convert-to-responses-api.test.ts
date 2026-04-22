import { convertToResponsesAPI } from '../src/convert-to-responses-api';
import type { LanguageModelV1Prompt } from '@ai-sdk/provider';

describe('convertToResponsesAPI', () => {
  it('converts system message to instructions', () => {
    const prompt: LanguageModelV1Prompt = [
      { role: 'system', content: 'You are helpful.' },
    ];
    const result = convertToResponsesAPI(prompt);
    expect(result.instructions).toBe('You are helpful.');
    expect(result.input).toEqual([]);
  });

  it('converts user text message', () => {
    const prompt: LanguageModelV1Prompt = [
      { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
    ];
    const result = convertToResponsesAPI(prompt);
    expect(result.instructions).toBeUndefined();
    expect(result.input).toEqual([
      { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Hello' }] },
    ]);
  });

  it('converts assistant text message', () => {
    const prompt: LanguageModelV1Prompt = [
      { role: 'assistant', content: [{ type: 'text', text: 'Hi there' }] },
    ];
    const result = convertToResponsesAPI(prompt);
    expect(result.input).toEqual([
      { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Hi there' }] },
    ]);
  });

  it('converts assistant tool call + tool result pair', () => {
    const prompt: LanguageModelV1Prompt = [
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'get_weather',
            args: { city: 'SF' },
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call-1',
            toolName: 'get_weather',
            result: { temp: 72 },
          },
        ],
      },
    ];
    const result = convertToResponsesAPI(prompt);
    expect(result.input).toEqual([
      { type: 'function_call', call_id: 'call-1', name: 'get_weather', arguments: '{"city":"SF"}' },
      { type: 'function_call_output', call_id: 'call-1', output: '{"temp":72}' },
    ]);
  });

  it('converts multi-turn conversation', () => {
    const prompt: LanguageModelV1Prompt = [
      { role: 'system', content: 'Be concise.' },
      { role: 'user', content: [{ type: 'text', text: 'Hi' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'Hello!' }] },
      { role: 'user', content: [{ type: 'text', text: 'How are you?' }] },
    ];
    const result = convertToResponsesAPI(prompt);
    expect(result.instructions).toBe('Be concise.');
    expect(result.input).toHaveLength(3);
    expect(result.input[0]).toEqual({ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Hi' }] });
    expect(result.input[1]).toEqual({ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Hello!' }] });
    expect(result.input[2]).toEqual({ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'How are you?' }] });
  });

  it('converts user image (Uint8Array) to input_image data URL', () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const prompt: LanguageModelV1Prompt = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'what is this?' },
          { type: 'image', image: bytes, mimeType: 'image/jpeg' },
        ],
      },
    ];
    const result = convertToResponsesAPI(prompt);
    expect(result.input).toEqual([
      {
        type: 'message',
        role: 'user',
        content: [
          { type: 'input_text', text: 'what is this?' },
          { type: 'input_image', image_url: 'data:image/jpeg;base64,AQIDBA==', detail: 'high' },
        ],
      },
    ]);
  });

  it('converts user image (URL) to input_image with url.toString()', () => {
    const prompt: LanguageModelV1Prompt = [
      {
        role: 'user',
        content: [
          { type: 'image', image: new URL('https://example.com/cat.png') },
        ],
      },
    ];
    const result = convertToResponsesAPI(prompt);
    expect(result.input).toEqual([
      {
        type: 'message',
        role: 'user',
        content: [
          { type: 'input_image', image_url: 'https://example.com/cat.png', detail: 'high' },
        ],
      },
    ]);
  });

  it('defaults mimeType to image/png for Uint8Array images without mimeType', () => {
    const prompt: LanguageModelV1Prompt = [
      {
        role: 'user',
        content: [{ type: 'image', image: new Uint8Array([255, 216]) }],
      },
    ];
    const result = convertToResponsesAPI(prompt);
    expect(result.input[0].content[0]).toEqual({
      type: 'input_image',
      image_url: 'data:image/png;base64,/9g=',
      detail: 'high',
    });
  });

  it('handles assistant message with mixed text and tool calls', () => {
    const prompt: LanguageModelV1Prompt = [
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Let me check.' },
          { type: 'tool-call', toolCallId: 'call-2', toolName: 'search', args: { q: 'test' } },
        ],
      },
    ];
    const result = convertToResponsesAPI(prompt);
    expect(result.input).toEqual([
      { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Let me check.' }] },
      { type: 'function_call', call_id: 'call-2', name: 'search', arguments: '{"q":"test"}' },
    ]);
  });
});
