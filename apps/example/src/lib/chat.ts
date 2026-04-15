/**
 * Chat module — sends messages to LLM via Vercel AI SDK,
 * streams responses, and handles multi-turn tool call loops.
 *
 * Based on the official manual agent loop pattern:
 * https://sdk.vercel.ai/docs/ai-sdk-core/agents#manual-agent-loop
 */
import { streamText, jsonSchema, tool, type ModelMessage } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
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

/**
 * Create a Vercel AI SDK model instance from provider ID + API key.
 */
function createModel(providerId: string, modelId: string, apiKey: string) {
  switch (providerId) {
    case 'anthropic': {
      const anthropic = createAnthropic({ apiKey });
      return anthropic(modelId);
    }
    case 'openai-codex':
    case 'openai': {
      const openai = createOpenAI({ apiKey });
      return openai(modelId);
    }
    case 'google-gemini':
    case 'google': {
      const google = createGoogleGenerativeAI({ apiKey });
      return google(modelId);
    }
    default: {
      const openai = createOpenAI({ apiKey });
      return openai(modelId);
    }
  }
}

/**
 * Convert skill tool definitions to Vercel AI SDK format.
 * Uses jsonSchema() for raw JSON Schema — no Zod needed.
 * No execute function — tool calls are handled manually via SkillEngine.
 */
function buildTools(skillId: string) {
  const defs = skillEngine.getToolDefinitions(skillId);
  const tools: Record<string, ReturnType<typeof tool>> = {};

  for (const def of defs) {
    tools[def.name] = tool({
      description: def.description,
      inputSchema: jsonSchema(def.parameters as any),
      // No execute — handled manually in the agent loop below
    });
  }

  return tools;
}

/**
 * Send a user message and stream the response.
 * Implements the manual agent loop pattern from the AI SDK docs.
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
  const model = createModel(providerId, modelId, apiKey);
  const systemPrompt = skillId ? skillEngine.getSystemPrompt(skillId) : undefined;
  const tools = skillId ? buildTools(skillId) : {};
  const hasTools = Object.keys(tools).length > 0;

  // Build message history in AI SDK format
  const messages: ModelMessage[] = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  for (const m of history) {
    if (m.role === 'user') {
      messages.push({ role: 'user', content: m.content });
    } else if (m.role === 'assistant') {
      messages.push({ role: 'assistant', content: m.content });
    }
  }
  messages.push({ role: 'user', content: userText });

  const newMessages: ChatMessage[] = [];
  const maxSteps = 8;

  // Manual agent loop — keeps running while the model requests tool calls
  for (let step = 0; step < maxSteps; step++) {
    console.log('[chat] step', step, { messageCount: messages.length });

    try {
      const result = streamText({
        model,
        messages,
        tools: hasTools ? tools : undefined,
      });

      // Stream text deltas to the UI
      let fullText = '';
      for await (const part of result.fullStream) {
        switch (part.type) {
          case 'text-delta':
            fullText += part.text;
            callbacks.onTextDelta(part.text);
            break;
          case 'tool-call':
            console.log('[chat] tool-call', part.toolName);
            callbacks.onToolCallStart(part.toolName);
            break;
          case 'error':
            console.error('[chat] stream error', part.error);
            callbacks.onError(
              part.error instanceof Error ? part.error.message : String(part.error),
            );
            return newMessages;
        }
      }

      // Add assistant text to our UI messages
      if (fullText) {
        newMessages.push({
          id: `a-${Date.now()}-${step}`,
          role: 'assistant',
          content: fullText,
        });
      }

      // Add all response messages (assistant + tool-call parts) to history
      // This is the AI SDK's recommended way to maintain conversation state
      const responseMessages = (await result.response).messages;
      messages.push(...responseMessages);

      // Check if the model wants to call tools
      const finishReason = await result.finishReason;
      console.log('[chat] finishReason', finishReason);

      if (finishReason !== 'tool-calls') {
        // Model is done — no more tool calls
        callbacks.onDone(fullText);
        return newMessages;
      }

      // Execute tool calls manually via SkillEngine
      const toolCalls = await result.toolCalls;
      for (const tc of toolCalls) {
        let execResult: { success: boolean; data?: unknown; error?: string };
        if (skillId) {
          execResult = await skillEngine.executeTool(
            skillId,
            tc.toolName,
            tc.input as Record<string, unknown>,
          );
        } else {
          execResult = { success: false, error: 'No skill loaded' };
        }

        const resultText = JSON.stringify(
          execResult.success ? execResult.data : { error: execResult.error },
        );
        callbacks.onToolCallEnd(tc.toolName, resultText);

        // Add to UI messages
        newMessages.push({
          id: `t-${Date.now()}-${tc.toolName}`,
          role: 'tool',
          content: resultText,
          toolName: tc.toolName,
        });

        // Add tool result to conversation history (AI SDK format)
        messages.push({
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: tc.toolCallId,
              toolName: tc.toolName,
              output: { type: 'text', value: resultText },
            },
          ],
        });
      }

      // Continue loop — model will see tool results and respond
    } catch (e: any) {
      console.error('[chat] error', e);
      callbacks.onError(e.message ?? String(e));
      return newMessages;
    }
  }

  callbacks.onDone('');
  return newMessages;
}
