/**
 * Custom ChatGPT Backend Provider for Vercel AI SDK.
 *
 * ChatGPT subscription OAuth tokens (from auth.openai.com) target the
 * ChatGPT backend API (chatgpt.com/backend-api/codex/responses), NOT
 * the standard OpenAI platform API (api.openai.com/v1).
 *
 * This provider implements the Vercel AI SDK's LanguageModelV1 interface
 * to stream responses from the ChatGPT backend using SSE.
 *
 * Based on pi-ai's openai-codex-responses provider.
 */
import { fetch as expoFetch } from 'expo/fetch';

const DEFAULT_BASE_URL = 'https://chatgpt.com/backend-api';
const JWT_CLAIM_PATH = 'https://api.openai.com/auth';

/**
 * Extract chatgpt_account_id from the JWT token.
 */
function extractAccountId(token: string): string {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT token');
  const payload = JSON.parse(atob(parts[1]));
  const accountId = payload?.[JWT_CLAIM_PATH]?.chatgpt_account_id;
  if (!accountId) throw new Error('No chatgpt_account_id in token');
  return accountId;
}


/**
 * Parse SSE events from a ReadableStream.
 */
async function* parseSSE(response: Response): AsyncGenerator<any> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx = buffer.indexOf('\n\n');
    while (idx !== -1) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);

      const dataLines = chunk
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trim());

      if (dataLines.length > 0) {
        const data = dataLines.join('\n').trim();
        if (data && data !== '[DONE]') {
          try {
            yield JSON.parse(data);
          } catch {}
        }
      }
      idx = buffer.indexOf('\n\n');
    }
  }
}

export interface ChatGPTStreamOptions {
  apiKey: string;
  modelId: string;
  /** Responses API input items (messages, function_call, function_call_output) */
  messages: any[];
  /** System prompt — sent as `instructions` field */
  systemPrompt?: string;
  tools?: Array<{ name: string; description: string; parameters: any }>;
  baseUrl?: string;
  onTextDelta?: (text: string) => void;
  onToolCall?: (toolCall: { id: string; name: string; arguments: string }) => void;
  onError?: (error: string) => void;
  signal?: AbortSignal;
}

export interface ChatGPTStreamResult {
  text: string;
  toolCalls: Array<{ id: string; name: string; arguments: string }>;
  finishReason: 'stop' | 'tool-calls' | 'error';
}

/**
 * Stream a response from the ChatGPT backend API.
 * Returns the full text and any tool calls.
 */
export async function streamChatGPT(options: ChatGPTStreamOptions): Promise<ChatGPTStreamResult> {
  const {
    apiKey,
    modelId,
    messages,
    systemPrompt,
    tools,
    baseUrl = DEFAULT_BASE_URL,
    onTextDelta,
    onToolCall,
    onError,
    signal,
  } = options;

  const accountId = extractAccountId(apiKey);

  // Build request body — input is passed directly (already in Responses API format)
  const body: any = {
    model: modelId,
    store: false,
    stream: true,
    input: messages,
    text: { verbosity: 'medium' },
    tool_choice: 'auto',
    parallel_tool_calls: true,
  };
  if (systemPrompt) body.instructions = systemPrompt;
  if (tools && tools.length > 0) {
    body.tools = tools.map((t) => ({
      type: 'function',
      name: t.name,
      description: t.description,
      parameters: t.parameters,
      strict: null,
    }));
  }
  const url = `${baseUrl.replace(/\/+$/, '')}/codex/responses`;

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${apiKey}`,
    'chatgpt-account-id': accountId,
    'OpenAI-Beta': 'responses=experimental',
    'originator': 'pi-ai-rn',
    'User-Agent': 'pi-ai-rn (mobile)',
    'Accept': 'text/event-stream',
    'Content-Type': 'application/json',
  };

  console.log('[chatgpt] POST', url, { model: modelId });

  // Add a 30s timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  const combinedSignal = signal
    ? AbortSignal.any([signal, controller.signal])
    : controller.signal;

  let response: Response;
  try {
    // Use expo/fetch for streaming ReadableStream support on React Native
    response = await (expoFetch as unknown as typeof globalThis.fetch)(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: combinedSignal,
    });
  } catch (e: any) {
    clearTimeout(timeout);
    if (e.name === 'AbortError') {
      throw new Error('Request timed out. The ChatGPT backend may be slow — try again.');
    }
    throw e;
  }
  clearTimeout(timeout);

  console.log('[chatgpt] response', response.status, response.headers.get('content-type'));

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[chatgpt] error', response.status, errorText);
    // Parse the error body for a friendly message
    let message: string;
    try {
      const parsed = JSON.parse(errorText);
      message = parsed.detail || parsed.error?.message || parsed.message || errorText;
    } catch {
      message = errorText;
    }
    throw new Error(message);
  }

  let fullText = '';
  const toolCalls: Array<{ id: string; name: string; arguments: string }> = [];
  const pendingToolCalls = new Map<number, { id: string; name: string; args: string }>();
  let finishReason: 'stop' | 'tool-calls' | 'error' = 'stop';
  let eventCount = 0;

  for await (const event of parseSSE(response)) {
    eventCount++;
    const type = event.type;
    if (eventCount <= 5 || type?.includes('done') || type?.includes('error')) {
      console.log('[chatgpt] SSE event', type);
    }

    if (type === 'error' || type === 'response.failed') {
      const msg = event.message || event.response?.error?.message || JSON.stringify(event);
      throw new Error(msg);
    }

    // Text delta
    if (type === 'response.output_text.delta') {
      const delta = event.delta ?? '';
      fullText += delta;
      onTextDelta?.(delta);
    }

    // Tool call function starts
    if (type === 'response.output_item.added' && event.item?.type === 'function_call') {
      const item = event.item;
      pendingToolCalls.set(event.output_index, {
        id: item.call_id || item.id || `call-${Date.now()}`,
        name: item.name || '',
        args: '',
      });
    }

    // Tool call function name (if sent separately)
    if (type === 'response.function_call_arguments.delta') {
      const tc = pendingToolCalls.get(event.output_index);
      if (tc) {
        tc.args += event.delta ?? '';
      }
    }

    // Tool call complete
    if (type === 'response.output_item.done' && event.item?.type === 'function_call') {
      const item = event.item;
      const tc = pendingToolCalls.get(event.output_index) || {
        id: item.call_id || item.id || `call-${Date.now()}`,
        name: item.name || '',
        args: item.arguments || '',
      };
      // Use final values from the done event if available
      if (item.name) tc.name = item.name;
      if (item.arguments) tc.args = item.arguments;
      if (item.call_id) tc.id = item.call_id;

      toolCalls.push({ id: tc.id, name: tc.name, arguments: tc.args });
      onToolCall?.(toolCalls[toolCalls.length - 1]);
      pendingToolCalls.delete(event.output_index);
    }

    // Response completed
    if (type === 'response.completed' || type === 'response.done') {
      const status = event.response?.status;
      if (status === 'incomplete' || toolCalls.length > 0) {
        finishReason = 'tool-calls';
      }
    }
  }

  if (toolCalls.length > 0) {
    finishReason = 'tool-calls';
  }

  return { text: fullText, toolCalls, finishReason };
}
