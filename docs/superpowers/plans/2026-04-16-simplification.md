# Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the skill-engine package, build a proper AI SDK custom provider for the ChatGPT backend API, and unify all providers under a single `streamText()` code path.

**Architecture:** The monorepo ships two packages: `@pi-ai-rn/auth` (unchanged) and `@pi-ai-rn/chatgpt-provider` (new AI SDK LanguageModelV1 provider). The example app uses `streamText()` for all providers with no branching. The skill-engine package and all WebView/sandbox wiring are removed entirely.

**Tech Stack:** TypeScript, AI SDK v4 (`ai` + `@ai-sdk/provider`), Expo SDK 55, React Native 0.83

---

## File Map

### New files (packages/chatgpt-provider/)

| File | Responsibility |
|---|---|
| `packages/chatgpt-provider/package.json` | Package manifest, depends on `@ai-sdk/provider` |
| `packages/chatgpt-provider/tsconfig.json` | TypeScript config |
| `packages/chatgpt-provider/src/index.ts` | Public API: `createChatGPT()` factory + re-exports |
| `packages/chatgpt-provider/src/chatgpt-provider.ts` | Provider class that creates model instances |
| `packages/chatgpt-provider/src/chatgpt-language-model.ts` | `LanguageModelV1` implementation (`doStream`, `doGenerate`) |
| `packages/chatgpt-provider/src/convert-to-responses-api.ts` | Maps AI SDK `LanguageModelV1Prompt` → Responses API input format |
| `packages/chatgpt-provider/src/map-sse-stream.ts` | Parses SSE response → `ReadableStream<LanguageModelV1StreamPart>` |
| `packages/chatgpt-provider/__tests__/convert-to-responses-api.test.ts` | Unit tests for prompt conversion |
| `packages/chatgpt-provider/__tests__/map-sse-stream.test.ts` | Unit tests for SSE → stream part mapping |

### Modified files

| File | Change |
|---|---|
| `apps/example/src/lib/chat.ts` | Rewrite: single `streamText()` code path for all providers |
| `apps/example/src/app/index.tsx` | Remove WebView/bridge/skill wiring, simplify to chat-only |
| `apps/example/package.json` | Remove skill-engine, expo-sqlite, expo-file-system, react-native-webview deps; add chatgpt-provider |
| `tsconfig.json` (root) | Update paths: replace `@pi-ai-rn/skill-engine` with `@pi-ai-rn/chatgpt-provider` |
| `package.json` (root) | No change needed (workspaces glob already covers new package) |

### Deleted files

| File/Directory | Reason |
|---|---|
| `packages/skill-engine/` (entire directory) | Replaced by AI SDK native tools |
| `apps/example/src/lib/skills.ts` | Skill definitions no longer needed |
| `apps/example/src/lib/chatgpt-provider.ts` | Replaced by `@pi-ai-rn/chatgpt-provider` package |

---

## Task 1: Create chatgpt-provider package scaffold

**Files:**
- Create: `packages/chatgpt-provider/package.json`
- Create: `packages/chatgpt-provider/tsconfig.json`
- Create: `packages/chatgpt-provider/src/index.ts` (placeholder)

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@pi-ai-rn/chatgpt-provider",
  "version": "0.1.0",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "test": "jest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@ai-sdk/provider": "^1.1.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "@types/jest": "^29.0.0",
    "jest": "^29.0.0",
    "ts-jest": "^29.0.0"
  },
  "jest": {
    "preset": "ts-jest",
    "testEnvironment": "node",
    "roots": ["<rootDir>/__tests__"]
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create placeholder index.ts**

Write `packages/chatgpt-provider/src/index.ts`:

```typescript
export { createChatGPT, type ChatGPTProviderOptions } from './chatgpt-provider';
```

This will fail to compile until Task 4 — that's expected.

- [ ] **Step 4: Update root tsconfig.json paths**

In the root `tsconfig.json`, replace the `@pi-ai-rn/skill-engine` path with `@pi-ai-rn/chatgpt-provider`:

```json
{
  "compilerOptions": {
    "paths": {
      "@pi-ai-rn/auth": ["packages/auth/src"],
      "@pi-ai-rn/chatgpt-provider": ["packages/chatgpt-provider/src"]
    }
  }
}
```

- [ ] **Step 5: Install dependencies**

Run from the monorepo root (`.worktrees/phase1-packages/`):

```bash
npm install
```

This installs `@ai-sdk/provider` into the chatgpt-provider package.

- [ ] **Step 6: Commit**

```bash
git add packages/chatgpt-provider/package.json packages/chatgpt-provider/tsconfig.json packages/chatgpt-provider/src/index.ts tsconfig.json
git commit -m "feat: scaffold @pi-ai-rn/chatgpt-provider package"
```

---

## Task 2: Implement prompt conversion (convert-to-responses-api.ts)

**Files:**
- Create: `packages/chatgpt-provider/src/convert-to-responses-api.ts`
- Test: `packages/chatgpt-provider/__tests__/convert-to-responses-api.test.ts`

- [ ] **Step 1: Write the failing tests**

Write `packages/chatgpt-provider/__tests__/convert-to-responses-api.test.ts`:

```typescript
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
    // Text part becomes a message, tool call becomes a function_call item
    expect(result.input).toEqual([
      { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Let me check.' }] },
      { type: 'function_call', call_id: 'call-2', name: 'search', arguments: '{"q":"test"}' },
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd .worktrees/phase1-packages && npx jest packages/chatgpt-provider/__tests__/convert-to-responses-api.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement convert-to-responses-api.ts**

Write `packages/chatgpt-provider/src/convert-to-responses-api.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd .worktrees/phase1-packages && npx jest packages/chatgpt-provider/__tests__/convert-to-responses-api.test.ts
```

Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/chatgpt-provider/src/convert-to-responses-api.ts packages/chatgpt-provider/__tests__/convert-to-responses-api.test.ts
git commit -m "feat(chatgpt-provider): add prompt conversion to Responses API format"
```

---

## Task 3: Implement SSE stream mapping (map-sse-stream.ts)

**Files:**
- Create: `packages/chatgpt-provider/src/map-sse-stream.ts`
- Test: `packages/chatgpt-provider/__tests__/map-sse-stream.test.ts`

- [ ] **Step 1: Write the failing tests**

Write `packages/chatgpt-provider/__tests__/map-sse-stream.test.ts`:

```typescript
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

  it('handles chunked SSE data split across reads', async () => {
    // Simulate a single SSE event split across two chunks
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd .worktrees/phase1-packages && npx jest packages/chatgpt-provider/__tests__/map-sse-stream.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement map-sse-stream.ts**

Write `packages/chatgpt-provider/src/map-sse-stream.ts`:

```typescript
import type { LanguageModelV1StreamPart } from '@ai-sdk/provider';

/**
 * Transform a raw SSE byte stream from the ChatGPT backend API into
 * AI SDK LanguageModelV1StreamPart objects.
 */
export function mapSSEStream(body: ReadableStream<Uint8Array>): ReadableStream<LanguageModelV1StreamPart> {
  let buffer = '';
  const decoder = new TextDecoder();
  // Track pending tool calls for argument accumulation
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd .worktrees/phase1-packages && npx jest packages/chatgpt-provider/__tests__/map-sse-stream.test.ts
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/chatgpt-provider/src/map-sse-stream.ts packages/chatgpt-provider/__tests__/map-sse-stream.test.ts
git commit -m "feat(chatgpt-provider): add SSE stream to AI SDK stream part mapping"
```

---

## Task 4: Implement the language model (chatgpt-language-model.ts)

**Files:**
- Create: `packages/chatgpt-provider/src/chatgpt-language-model.ts`

- [ ] **Step 1: Implement chatgpt-language-model.ts**

Write `packages/chatgpt-provider/src/chatgpt-language-model.ts`:

```typescript
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
      finishReason: (toolCalls.length > 0 ? 'tool-calls' : 'stop') as const,
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
```

- [ ] **Step 2: Verify the file compiles**

```bash
cd .worktrees/phase1-packages && npx tsc --noEmit -p packages/chatgpt-provider/tsconfig.json
```

Expected: No errors (or only errors from index.ts importing chatgpt-provider.ts which doesn't exist yet — that's Task 5).

- [ ] **Step 3: Commit**

```bash
git add packages/chatgpt-provider/src/chatgpt-language-model.ts
git commit -m "feat(chatgpt-provider): implement LanguageModelV1 for ChatGPT backend API"
```

---

## Task 5: Implement provider factory (chatgpt-provider.ts + index.ts)

**Files:**
- Create: `packages/chatgpt-provider/src/chatgpt-provider.ts`
- Modify: `packages/chatgpt-provider/src/index.ts`

- [ ] **Step 1: Implement chatgpt-provider.ts**

Write `packages/chatgpt-provider/src/chatgpt-provider.ts`:

```typescript
import { ChatGPTLanguageModel, type ChatGPTLanguageModelConfig } from './chatgpt-language-model';

export interface ChatGPTProviderOptions {
  /** ChatGPT subscription OAuth JWT token. */
  apiKey: string;
  /** Override base URL (default: https://chatgpt.com/backend-api). */
  baseUrl?: string;
  /** Custom fetch function. Use expo/fetch on React Native for streaming support. */
  fetch?: typeof globalThis.fetch;
}

export interface ChatGPTProvider {
  (modelId: string): ChatGPTLanguageModel;
}

/**
 * Create a ChatGPT backend provider for the AI SDK.
 *
 * Usage:
 * ```ts
 * import { createChatGPT } from '@pi-ai-rn/chatgpt-provider';
 * const chatgpt = createChatGPT({ apiKey: '<oauth-token>' });
 * const model = chatgpt('gpt-5.4');
 * ```
 */
export function createChatGPT(options: ChatGPTProviderOptions): ChatGPTProvider {
  const config: ChatGPTLanguageModelConfig = {
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    fetch: options.fetch,
  };

  return (modelId: string) => new ChatGPTLanguageModel(modelId, config);
}
```

- [ ] **Step 2: Update index.ts**

Write `packages/chatgpt-provider/src/index.ts`:

```typescript
export { createChatGPT, type ChatGPTProvider, type ChatGPTProviderOptions } from './chatgpt-provider';
export { ChatGPTLanguageModel, type ChatGPTLanguageModelConfig } from './chatgpt-language-model';
```

- [ ] **Step 3: Verify the package compiles**

```bash
cd .worktrees/phase1-packages && npx tsc --noEmit -p packages/chatgpt-provider/tsconfig.json
```

Expected: No errors.

- [ ] **Step 4: Run all chatgpt-provider tests**

```bash
cd .worktrees/phase1-packages && npx jest packages/chatgpt-provider/
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/chatgpt-provider/src/chatgpt-provider.ts packages/chatgpt-provider/src/index.ts
git commit -m "feat(chatgpt-provider): add createChatGPT() factory and public API"
```

---

## Task 6: Remove skill-engine package

**Files:**
- Delete: `packages/skill-engine/` (entire directory)

- [ ] **Step 1: Delete the skill-engine package**

```bash
rm -rf packages/skill-engine
```

- [ ] **Step 2: Verify it's gone**

```bash
ls packages/
```

Expected: `auth` and `chatgpt-provider` only.

- [ ] **Step 3: Commit**

```bash
git add -A packages/skill-engine
git commit -m "chore: remove skill-engine package

Replaced by AI SDK native tool support. The sandboxed WebView execution
model is no longer needed."
```

---

## Task 7: Simplify the example app

**Files:**
- Rewrite: `apps/example/src/lib/chat.ts`
- Modify: `apps/example/src/app/index.tsx`
- Modify: `apps/example/package.json`
- Delete: `apps/example/src/lib/skills.ts`
- Delete: `apps/example/src/lib/chatgpt-provider.ts`

- [ ] **Step 1: Delete removed files**

```bash
rm apps/example/src/lib/skills.ts apps/example/src/lib/chatgpt-provider.ts
```

- [ ] **Step 2: Rewrite chat.ts**

Write `apps/example/src/lib/chat.ts`:

```typescript
/**
 * Chat module — unified streaming via AI SDK for all providers.
 */
import { streamText } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createChatGPT } from '@pi-ai-rn/chatgpt-provider';
import { fetch as expoFetch } from 'expo/fetch';
import { authManager } from './auth';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

interface StreamCallbacks {
  onTextDelta: (text: string) => void;
  onDone: (fullText: string) => void;
  onError: (error: string) => void;
}

// Expo/fetch for React Native streaming (response.body) support
const fetch = expoFetch as unknown as typeof globalThis.fetch;

function createModel(providerId: string, modelId: string, apiKey: string) {
  switch (providerId) {
    case 'anthropic':
      return createAnthropic({ apiKey, fetch })(modelId);
    case 'openai':
      return createOpenAI({ apiKey, fetch })(modelId);
    case 'google-gemini':
    case 'google':
      return createGoogleGenerativeAI({ apiKey, fetch })(modelId);
    case 'openai-codex':
      return createChatGPT({ apiKey, fetch })(modelId);
    default:
      return createOpenAI({ apiKey, fetch })(modelId);
  }
}

/**
 * Send a message and stream the response.
 * All providers go through AI SDK streamText() — no branching.
 */
export async function sendMessage(
  userText: string,
  history: ChatMessage[],
  systemPrompt: string | undefined,
  providerId: string,
  modelId: string,
  callbacks: StreamCallbacks,
): Promise<void> {
  const apiKey = await authManager.getApiKey(providerId);
  if (!apiKey) {
    callbacks.onError('Not signed in. Go to Settings to connect a provider.');
    return;
  }

  const model = createModel(providerId, modelId, apiKey);

  // Build messages from history
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const m of history) {
    messages.push({ role: m.role, content: m.content });
  }
  messages.push({ role: 'user', content: userText });

  try {
    const result = streamText({
      model,
      system: systemPrompt,
      messages,
    });

    let fullText = '';
    for await (const part of result.fullStream) {
      switch (part.type) {
        case 'text-delta':
          fullText += part.textDelta;
          callbacks.onTextDelta(part.textDelta);
          break;
        case 'error':
          callbacks.onError(
            part.error instanceof Error ? part.error.message : String(part.error),
          );
          return;
      }
    }

    callbacks.onDone(fullText);
  } catch (e: any) {
    callbacks.onError(e.message ?? String(e));
  }
}
```

- [ ] **Step 3: Simplify index.tsx**

Write `apps/example/src/app/index.tsx`:

```typescript
import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  FlatList,
  Text,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MessageBubble } from '../components/MessageBubble';
import { ChatInput } from '../components/ChatInput';
import { sendMessage, type ChatMessage } from '../lib/chat';
import { authManager } from '../lib/auth';

const DEFAULT_MODELS: Record<string, string> = {
  'anthropic': 'claude-sonnet-4-6',
  'openai-codex': 'gpt-5.4',
  'openai': 'gpt-4o',
  'google-gemini': 'gemini-3-flash',
  'github-copilot': 'gpt-4o',
  'google-antigravity': 'claude-sonnet-4-6',
};

const SYSTEM_PROMPT = `You are a helpful assistant. Format your responses using Markdown for readability.`;

export default function ChatScreen() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeProvider, setActiveProvider] = useState<{ id: string; model: string } | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // Detect which provider is connected
  useEffect(() => {
    (async () => {
      const providers = authManager.listProviders();
      for (const p of providers) {
        const key = await authManager.getApiKey(p.id);
        if (key) {
          setActiveProvider({ id: p.id, model: DEFAULT_MODELS[p.id] ?? 'gpt-4o' });
          return;
        }
      }
      setActiveProvider(null);
    })();
  }, [messages.length === 0]);

  const handleSend = useCallback(
    async (text: string) => {
      if (isStreaming) return;
      if (!activeProvider) {
        setMessages((prev) => [
          ...prev,
          { id: `u-${Date.now()}`, role: 'user', content: text },
          {
            id: `e-${Date.now()}`,
            role: 'assistant',
            content: 'No provider connected. Tap the gear icon to sign in or add an API key.',
          },
        ]);
        return;
      }

      const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', content: text };
      setMessages((prev) => [...prev, userMsg]);
      setIsStreaming(true);

      const streamingId = `s-${Date.now()}`;
      let streamedText = '';

      setMessages((prev) => [
        ...prev,
        { id: streamingId, role: 'assistant', content: '', isStreaming: true },
      ]);

      await sendMessage(
        text,
        [...messages, userMsg],
        SYSTEM_PROMPT,
        activeProvider.id,
        activeProvider.model,
        {
          onTextDelta: (delta) => {
            streamedText += delta;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === streamingId ? { ...m, content: streamedText } : m,
              ),
            );
          },
          onDone: (fullText) => {
            setMessages((prev) =>
              prev
                .filter((m) => m.id !== streamingId || fullText)
                .map((m) =>
                  m.id === streamingId
                    ? { ...m, content: fullText, isStreaming: false }
                    : m,
                ),
            );
          },
          onError: (error) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === streamingId
                  ? { ...m, content: `Something went wrong: ${error}`, isStreaming: false }
                  : m,
              ),
            );
          },
        },
      );

      setIsStreaming(false);
    },
    [messages, isStreaming, activeProvider],
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => <MessageBubble message={item} />}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: true })
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Pi AI Example</Text>
              <Text style={styles.emptyHint}>
                Send a message to start chatting, or go to{' '}
                <Text
                  style={styles.link}
                  onPress={() => router.push('/settings')}
                >
                  Settings
                </Text>{' '}
                to connect a provider.
              </Text>
            </View>
          }
        />

        <ChatInput onSend={handleSend} disabled={isStreaming} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  messageList: { padding: 16, paddingBottom: 8 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, marginTop: 100 },
  emptyTitle: { fontSize: 22, fontWeight: '600', marginBottom: 12 },
  emptyHint: { fontSize: 15, color: '#888', textAlign: 'center', lineHeight: 22 },
  link: { color: '#007aff' },
});
```

- [ ] **Step 4: Update MessageBubble to remove tool message type**

Edit `apps/example/src/components/MessageBubble.tsx` — remove the tool role handling since `ChatMessage` no longer has `role: 'tool'`:

```typescript
import { View, Text, StyleSheet } from 'react-native';
import Markdown from 'react-native-marked';
import type { ChatMessage } from '../lib/chat';

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
      {isUser ? (
        <Text style={styles.userText} selectable>{message.content}</Text>
      ) : (
        <Markdown
          value={message.content || ' '}
          flatListProps={{ scrollEnabled: false }}
          theme={{
            colors: { text: '#000', code: '#e8e8e8', link: '#007aff' },
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    maxWidth: '85%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    borderCurve: 'continuous',
    marginVertical: 3,
  },
  userBubble: { alignSelf: 'flex-end', backgroundColor: '#007aff' },
  assistantBubble: { alignSelf: 'flex-start', backgroundColor: '#f0f0f0' },
  userText: { color: '#fff', fontSize: 16 },
});
```

- [ ] **Step 5: Update package.json**

Edit `apps/example/package.json` — remove skill-engine, expo-sqlite, expo-file-system, react-native-webview; add chatgpt-provider:

```json
{
  "name": "pi-ai-rn-example",
  "version": "0.1.0",
  "private": true,
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "ios": "expo run:ios"
  },
  "dependencies": {
    "@ai-sdk/anthropic": "^1.0.0",
    "@ai-sdk/openai": "^1.0.0",
    "@ai-sdk/google": "^1.0.0",
    "ai": "^4.0.0",
    "@pi-ai-rn/auth": "*",
    "@pi-ai-rn/chatgpt-provider": "*",
    "expo": "~55.0.15",
    "expo-crypto": "~55.0.14",
    "expo-linking": "~55.0.13",
    "expo-router": "~55.0.12",
    "expo-secure-store": "~55.0.13",
    "expo-status-bar": "~55.0.5",
    "expo-web-browser": "~55.0.14",
    "lightningcss": "^1.32.0",
    "react": "19.2.0",
    "react-native": "0.83.4",
    "react-native-marked": "^8.0.0",
    "react-native-svg": "^15.0.0",
    "react-native-safe-area-context": "~5.6.2"
  },
  "devDependencies": {
    "@types/react": "~19.2.10",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 6: Reinstall dependencies**

```bash
cd .worktrees/phase1-packages && npm install
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: simplify example app — remove skill-engine, use unified streamText()

- Remove skill-engine dependency and all WebView/sandbox wiring
- Remove chatgpt-provider.ts (replaced by @pi-ai-rn/chatgpt-provider)
- Remove skills.ts (no longer needed)
- Rewrite chat.ts: single streamText() path for all providers
- Simplify index.tsx: remove bridge, sandbox refs, tool indicators
- Update MessageBubble: remove tool message type
- Remove unused deps: expo-sqlite, expo-file-system, react-native-webview"
```

---

## Task 8: Build verification and smoke test

**Files:** None (verification only)

- [ ] **Step 1: Run chatgpt-provider tests**

```bash
cd .worktrees/phase1-packages && npx jest packages/chatgpt-provider/
```

Expected: All tests pass.

- [ ] **Step 2: Run auth package tests**

```bash
cd .worktrees/phase1-packages && npx jest packages/auth/
```

Expected: All tests pass (unchanged package).

- [ ] **Step 3: Typecheck the entire monorepo**

```bash
cd .worktrees/phase1-packages && npx tsc --noEmit
```

Expected: No errors. If there are errors from the example app (Metro bundler resolution), they may be expected since Expo uses its own module resolution.

- [ ] **Step 4: Start the example app**

```bash
cd .worktrees/phase1-packages/apps/example && npx expo start --ios
```

Expected: App launches in simulator. Chat screen shows "Pi AI Example" empty state with link to Settings.

- [ ] **Step 5: Verify Settings screen**

Navigate to Settings, confirm providers are listed and sign-in works as before.

- [ ] **Step 6: Verify chat streaming**

Sign in with any provider, send a message. Confirm:
- Text streams in real-time
- No errors in terminal logs
- Message appears as Markdown in assistant bubble

- [ ] **Step 7: Final commit (if any fixes needed)**

If any fixes were needed during verification, commit them:

```bash
git add -A
git commit -m "fix: address issues found during build verification"
```
