import type {
  LanguageModelV1,
  LanguageModelV1CallOptions,
  LanguageModelV1StreamPart,
} from '@ai-sdk/provider';
import { convertToResponsesAPI } from './convert-to-responses-api';
import { mapSSEStream } from './map-sse-stream';

const DEFAULT_BASE_URL = 'https://chatgpt.com/backend-api';
const JWT_CLAIM_PATH = 'https://api.openai.com/auth';

/** Extract chatgpt_account_id from the JWT token. */
function extractAccountId(token: string): string {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT token');
  const payload = JSON.parse(atob(parts[1]));
  const accountId = payload?.[JWT_CLAIM_PATH]?.chatgpt_account_id;
  if (!accountId) throw new Error('No chatgpt_account_id in token');
  return accountId;
}

export interface ChatGPTLanguageModelConfig {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
}

export class ChatGPTLanguageModel implements LanguageModelV1 {
  readonly specificationVersion = 'v1' as const;
  readonly defaultObjectGenerationMode = undefined;

  readonly provider: string;
  readonly modelId: string;

  private config: ChatGPTLanguageModelConfig;

  constructor(modelId: string, config: ChatGPTLanguageModelConfig) {
    this.provider = 'chatgpt-backend';
    this.modelId = modelId;
    this.config = config;
  }

  private buildHeaders(): Record<string, string> {
    const accountId = extractAccountId(this.config.apiKey);
    return {
      'Authorization': `Bearer ${this.config.apiKey}`,
      'chatgpt-account-id': accountId,
      'OpenAI-Beta': 'responses=experimental',
      'originator': 'pi-ai-rn',
      'User-Agent': 'pi-ai-rn (mobile)',
      'Accept': 'text/event-stream',
      'Content-Type': 'application/json',
    };
  }

  private buildRequestBody(options: LanguageModelV1CallOptions): Record<string, unknown> {
    const { instructions, input } = convertToResponsesAPI(options.prompt);

    const body: Record<string, unknown> = {
      model: this.modelId,
      store: false,
      input,
    };

    if (instructions) body.instructions = instructions;

    // Map AI SDK tool definitions to Responses API format
    if (options.mode.type === 'regular' && options.mode.tools && options.mode.tools.length > 0) {
      body.tools = options.mode.tools
        .filter((t): t is { type: 'function'; name: string; description?: string; parameters: unknown } => t.type === 'function')
        .map((t) => ({
          type: 'function',
          name: t.name,
          description: t.description,
          parameters: t.parameters,
          strict: null,
        }));
      body.tool_choice = 'auto';
      body.parallel_tool_calls = true;
    }

    // Map standard AI SDK settings
    if (options.maxTokens !== undefined) body.max_output_tokens = options.maxTokens;
    if (options.temperature !== undefined) body.temperature = options.temperature;
    if (options.topP !== undefined) body.top_p = options.topP;

    return body;
  }

  async doGenerate(options: LanguageModelV1CallOptions) {
    const fetchFn = this.config.fetch ?? globalThis.fetch;
    const baseUrl = (this.config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    const url = `${baseUrl}/codex/responses`;

    const body = this.buildRequestBody(options);
    body.stream = false;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const signal = options.abortSignal
      ? AbortSignal.any([options.abortSignal, controller.signal])
      : controller.signal;

    const response = await fetchFn(url, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
      signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      let message: string;
      try {
        const parsed = JSON.parse(errorText);
        message = parsed.detail || parsed.error?.message || parsed.message || errorText;
      } catch {
        message = errorText;
      }
      throw new Error(message);
    }

    const data = await response.json();

    // Extract text and tool calls from the response output
    let text = '';
    const toolCalls: Array<{ toolCallType: 'function'; toolCallId: string; toolName: string; args: string }> = [];

    for (const item of data.output ?? []) {
      if (item.type === 'message') {
        for (const content of item.content ?? []) {
          if (content.type === 'output_text') text += content.text;
        }
      }
      if (item.type === 'function_call') {
        toolCalls.push({
          toolCallType: 'function',
          toolCallId: item.call_id,
          toolName: item.name,
          args: item.arguments,
        });
      }
    }

    const usage = data.usage ?? {};
    return {
      text: text || undefined,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason: (toolCalls.length > 0 ? 'tool-calls' : 'stop') as 'tool-calls' | 'stop',
      usage: {
        promptTokens: usage.input_tokens ?? 0,
        completionTokens: usage.output_tokens ?? 0,
      },
      rawCall: { rawPrompt: body.input, rawSettings: {} },
      rawResponse: { body: data },
      warnings: [],
    };
  }

  async doStream(options: LanguageModelV1CallOptions) {
    const fetchFn = this.config.fetch ?? globalThis.fetch;
    const baseUrl = (this.config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    const url = `${baseUrl}/codex/responses`;

    const body = this.buildRequestBody(options);
    body.stream = true;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const signal = options.abortSignal
      ? AbortSignal.any([options.abortSignal, controller.signal])
      : controller.signal;

    let response: Response;
    try {
      response = await fetchFn(url, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(body),
        signal,
      });
    } catch (e: any) {
      clearTimeout(timeout);
      if (e.name === 'AbortError') {
        throw new Error('Request timed out. The ChatGPT backend may be slow — try again.');
      }
      throw e;
    }
    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      let message: string;
      try {
        const parsed = JSON.parse(errorText);
        message = parsed.detail || parsed.error?.message || parsed.message || errorText;
      } catch {
        message = errorText;
      }
      throw new Error(message);
    }

    if (!response.body) {
      throw new Error('Response body is null — streaming not supported by this fetch implementation');
    }

    return {
      stream: mapSSEStream(response.body),
      rawCall: { rawPrompt: body.input, rawSettings: {} },
      rawResponse: { headers: Object.fromEntries(response.headers.entries()) },
      warnings: [],
    };
  }
}
