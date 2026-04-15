/**
 * Chat module — sends messages to LLM, streams responses,
 * and handles multi-turn tool call loops.
 *
 * Uses Vercel AI SDK for standard providers (Anthropic, Google, OpenAI API key).
 * Uses custom ChatGPT provider for OpenAI OAuth (subscription tokens).
 */
import { streamText, jsonSchema, tool, type ModelMessage } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { fetch as expoFetch } from 'expo/fetch';
import { streamChatGPT } from './chatgpt-provider';
import { authManager } from './auth';
import { skillEngine } from './skills';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolName?: string;
  isStreaming?: boolean;
}

interface StreamCallbacks {
  onTextDelta: (text: string) => void;
  onToolCallStart: (toolName: string) => void;
  onToolCallEnd: (toolName: string, result: string) => void;
  onDone: (fullText: string) => void;
  onError: (error: string) => void;
}

// ============================================================================
// Provider factory (Vercel AI SDK models)
// ============================================================================

function createModel(providerId: string, modelId: string, apiKey: string) {
  // Pass expo/fetch for React Native streaming support.
  // RN's built-in fetch doesn't support ReadableStream (response.body is null).
  const fetch = expoFetch as unknown as typeof globalThis.fetch;

  switch (providerId) {
    case 'anthropic': {
      const anthropic = createAnthropic({ apiKey, fetch });
      return anthropic(modelId);
    }
    case 'openai': {
      const openai = createOpenAI({ apiKey, fetch });
      return openai(modelId);
    }
    case 'google-gemini':
    case 'google': {
      const google = createGoogleGenerativeAI({ apiKey, fetch });
      return google(modelId);
    }
    default: {
      const openai = createOpenAI({ apiKey, fetch });
      return openai(modelId);
    }
  }
}

// ============================================================================
// Tool definitions
// ============================================================================

function buildToolDefs(skillId: string) {
  return skillEngine.getToolDefinitions(skillId);
}

function buildAISDKTools(skillId: string) {
  const defs = buildToolDefs(skillId);
  const tools: Record<string, ReturnType<typeof tool>> = {};
  for (const def of defs) {
    tools[def.name] = tool({
      description: def.description,
      inputSchema: jsonSchema(def.parameters as any),
    });
  }
  return tools;
}

// ============================================================================
// ChatGPT backend path (OAuth subscription tokens)
// ============================================================================

async function sendMessageChatGPT(
  userText: string,
  history: ChatMessage[],
  skillId: string | null,
  modelId: string,
  apiKey: string,
  callbacks: StreamCallbacks,
): Promise<ChatMessage[]> {
  const systemPrompt = skillId ? skillEngine.getSystemPrompt(skillId) : undefined;
  const toolDefs = skillId ? buildToolDefs(skillId) : [];

  // Build simple message array
  const messages: Array<{ role: string; content: string }> = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  for (const m of history) {
    if (m.role === 'user' || m.role === 'assistant') {
      messages.push({ role: m.role, content: m.content });
    }
  }
  messages.push({ role: 'user', content: userText });

  const tools = toolDefs.length > 0
    ? toolDefs.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }))
    : undefined;

  const newMessages: ChatMessage[] = [];
  const maxSteps = 8;

  for (let step = 0; step < maxSteps; step++) {
    console.log('[chat:chatgpt] step', step);

    try {
      const result = await streamChatGPT({
        apiKey,
        modelId,
        messages,
        tools,
        onTextDelta: (text) => callbacks.onTextDelta(text),
        onToolCall: (tc) => callbacks.onToolCallStart(tc.name),
      });

      // Add assistant text
      if (result.text) {
        newMessages.push({
          id: `a-${Date.now()}-${step}`,
          role: 'assistant',
          content: result.text,
        });
        messages.push({ role: 'assistant', content: result.text });
      }

      // No tool calls — done
      if (result.finishReason !== 'tool-calls' || result.toolCalls.length === 0) {
        callbacks.onDone(result.text);
        return newMessages;
      }

      // Execute tool calls
      for (const tc of result.toolCalls) {
        let execResult: { success: boolean; data?: unknown; error?: string };
        if (skillId) {
          const args = typeof tc.arguments === 'string' ? JSON.parse(tc.arguments) : tc.arguments;
          execResult = await skillEngine.executeTool(skillId, tc.name, args);
        } else {
          execResult = { success: false, error: 'No skill loaded' };
        }

        const resultText = JSON.stringify(
          execResult.success ? execResult.data : { error: execResult.error },
        );
        callbacks.onToolCallEnd(tc.name, resultText);

        newMessages.push({
          id: `t-${Date.now()}-${tc.name}`,
          role: 'tool',
          content: resultText,
          toolName: tc.name,
        });

        // Add tool result to messages for next turn
        // ChatGPT Responses API expects function_call_output items
        messages.push({ role: 'tool', content: resultText });
      }
    } catch (e: any) {
      console.error('[chat:chatgpt] error', e);
      callbacks.onError(e.message ?? String(e));
      return newMessages;
    }
  }

  callbacks.onDone('');
  return newMessages;
}

// ============================================================================
// Standard Vercel AI SDK path
// ============================================================================

async function sendMessageAISDK(
  userText: string,
  history: ChatMessage[],
  skillId: string | null,
  providerId: string,
  modelId: string,
  apiKey: string,
  callbacks: StreamCallbacks,
): Promise<ChatMessage[]> {
  const model = createModel(providerId, modelId, apiKey);
  const systemPrompt = skillId ? skillEngine.getSystemPrompt(skillId) : undefined;
  const tools = skillId ? buildAISDKTools(skillId) : {};
  const hasTools = Object.keys(tools).length > 0;

  const messages: ModelMessage[] = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  for (const m of history) {
    if (m.role === 'user') messages.push({ role: 'user', content: m.content });
    else if (m.role === 'assistant') messages.push({ role: 'assistant', content: m.content });
  }
  messages.push({ role: 'user', content: userText });

  const newMessages: ChatMessage[] = [];
  const maxSteps = 8;

  for (let step = 0; step < maxSteps; step++) {
    console.log('[chat:aisdk] step', step, { messageCount: messages.length });

    try {
      const result = streamText({
        model,
        messages,
        tools: hasTools ? tools : undefined,
      });

      let fullText = '';
      for await (const part of result.fullStream) {
        switch (part.type) {
          case 'text-delta':
            fullText += part.text;
            callbacks.onTextDelta(part.text);
            break;
          case 'tool-call':
            callbacks.onToolCallStart(part.toolName);
            break;
          case 'error':
            console.error('[chat:aisdk] stream error', part.error);
            callbacks.onError(
              part.error instanceof Error ? part.error.message : String(part.error),
            );
            return newMessages;
        }
      }

      if (fullText) {
        newMessages.push({ id: `a-${Date.now()}-${step}`, role: 'assistant', content: fullText });
      }

      const responseMessages = (await result.response).messages;
      messages.push(...responseMessages);

      const finishReason = await result.finishReason;
      console.log('[chat:aisdk] finishReason', finishReason);

      if (finishReason !== 'tool-calls') {
        callbacks.onDone(fullText);
        return newMessages;
      }

      const toolCalls = await result.toolCalls;
      for (const tc of toolCalls) {
        let execResult: { success: boolean; data?: unknown; error?: string };
        if (skillId) {
          execResult = await skillEngine.executeTool(skillId, tc.toolName, tc.input as Record<string, unknown>);
        } else {
          execResult = { success: false, error: 'No skill loaded' };
        }

        const resultText = JSON.stringify(
          execResult.success ? execResult.data : { error: execResult.error },
        );
        callbacks.onToolCallEnd(tc.toolName, resultText);
        newMessages.push({ id: `t-${Date.now()}-${tc.toolName}`, role: 'tool', content: resultText, toolName: tc.toolName });

        messages.push({
          role: 'tool',
          content: [{ type: 'tool-result', toolCallId: tc.toolCallId, toolName: tc.toolName, output: { type: 'text', value: resultText } }],
        });
      }
    } catch (e: any) {
      console.error('[chat:aisdk] error', e);
      callbacks.onError(e.message ?? String(e));
      return newMessages;
    }
  }

  callbacks.onDone('');
  return newMessages;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Send a message and stream the response.
 * Routes to the ChatGPT backend for OAuth tokens, or Vercel AI SDK otherwise.
 */
export async function sendMessage(
  userText: string,
  history: ChatMessage[],
  skillId: string | null,
  providerId: string,
  modelId: string,
  callbacks: StreamCallbacks,
): Promise<ChatMessage[]> {
  const apiKey = await authManager.getApiKey(providerId);
  if (!apiKey) {
    callbacks.onError('Not signed in. Go to Settings to connect a provider.');
    return [];
  }

  console.log('[chat] sendMessage', { providerId, modelId });

  // ChatGPT OAuth tokens (JWT) use a different backend API
  if (providerId === 'openai-codex') {
    return sendMessageChatGPT(userText, history, skillId, modelId, apiKey, callbacks);
  }

  // All other providers use the standard Vercel AI SDK
  return sendMessageAISDK(userText, history, skillId, providerId, modelId, apiKey, callbacks);
}
