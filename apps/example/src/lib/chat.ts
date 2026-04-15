import { streamText, type ModelMessage, type ToolCallPart, tool } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { z } from 'zod';
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
      // Note: ChatGPT subscription OAuth tokens (openai-codex) use a JWT
      // that works with api.openai.com — OpenAI validates the token and
      // routes to the user's subscription. Standard API keys also work.
      const openai = createOpenAI({ apiKey });
      return openai(modelId);
    }
    case 'google-gemini':
    case 'google': {
      const google = createGoogleGenerativeAI({ apiKey });
      return google(modelId);
    }
    default: {
      // Fallback: treat as OpenAI-compatible endpoint
      const openai = createOpenAI({ apiKey });
      return openai(modelId);
    }
  }
}

/**
 * Convert skill tool definitions to Vercel AI SDK tool format.
 * Note: execute is NOT included here — tool calls are handled manually
 * because execution happens in the WebView sandbox, not in JS.
 */
function buildTools(skillId: string) {
  const defs = skillEngine.getToolDefinitions(skillId);
  const tools: Record<string, ReturnType<typeof tool>> = {};

  for (const def of defs) {
    // Convert JSONSchema properties to a simple zod object schema
    const props: Record<string, z.ZodType> = {};
    if (def.parameters.properties) {
      for (const [key, schema] of Object.entries(def.parameters.properties)) {
        switch (schema.type) {
          case 'string':
            props[key] = z.string().optional().describe(schema.description ?? '');
            break;
          case 'number':
            props[key] = z.number().optional().describe(schema.description ?? '');
            break;
          case 'boolean':
            props[key] = z.boolean().optional().describe(schema.description ?? '');
            break;
          default:
            props[key] = z.any().optional();
        }
      }
    }

    tools[def.name] = tool({
      description: def.description,
      inputSchema: z.object(props),
      // No execute — we handle tool execution manually via SkillEngine
    });
  }

  return tools;
}

/**
 * Send a user message and stream the response.
 * Handles multi-turn tool call loops automatically.
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

  const model = createModel(providerId, modelId, apiKey);
  const systemPrompt = skillId ? skillEngine.getSystemPrompt(skillId) : undefined;
  const tools = skillId ? buildTools(skillId) : {};

  // Build message history
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

  for (let step = 0; step < maxSteps; step++) {
    let fullText = '';
    let toolCallParts: ToolCallPart[] = [];

    try {
      const result = streamText({
        model,
        messages,
        tools: Object.keys(tools).length > 0 ? tools : undefined,
      });

      for await (const chunk of result.fullStream) {
        if (chunk.type === 'text-delta') {
          fullText += chunk.textDelta;
          callbacks.onTextDelta(chunk.textDelta);
        }
        if (chunk.type === 'tool-call') {
          toolCallParts.push({
            type: 'tool-call',
            toolCallId: chunk.toolCallId,
            toolName: chunk.toolName,
            args: chunk.args,
          });
        }
      }
    } catch (e: any) {
      callbacks.onError(e.message ?? 'Stream failed');
      return newMessages;
    }

    // Add assistant message to history and results
    if (fullText) {
      const assistantMsg: ChatMessage = {
        id: `a-${Date.now()}-${step}`,
        role: 'assistant',
        content: fullText,
      };
      newMessages.push(assistantMsg);
    }

    // Add the full assistant response (text + tool calls) to message history
    if (fullText || toolCallParts.length > 0) {
      const content: any[] = [];
      if (fullText) content.push({ type: 'text', text: fullText });
      content.push(...toolCallParts);
      messages.push({ role: 'assistant', content });
    }

    // No tool calls — done
    if (toolCallParts.length === 0) {
      callbacks.onDone(fullText);
      return newMessages;
    }

    // Execute tool calls via SkillEngine sandbox
    const toolResultContent: any[] = [];

    for (const tc of toolCallParts) {
      callbacks.onToolCallStart(tc.toolName);

      let result: { success: boolean; data?: unknown; error?: string };
      if (skillId) {
        result = await skillEngine.executeTool(skillId, tc.toolName, tc.args as Record<string, unknown>);
      } else {
        result = { success: false, error: 'No skill loaded' };
      }

      const resultText = JSON.stringify(result.success ? result.data : { error: result.error });
      callbacks.onToolCallEnd(tc.toolName, resultText);

      const toolMsg: ChatMessage = {
        id: `t-${Date.now()}-${tc.toolName}`,
        role: 'tool',
        content: resultText,
        toolName: tc.toolName,
      };
      newMessages.push(toolMsg);

      toolResultContent.push({
        type: 'tool-result',
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        result: resultText,
      });
    }

    // Add tool results to message history
    messages.push({ role: 'tool', content: toolResultContent });

    // Continue loop — model will see tool results
  }

  callbacks.onDone('');
  return newMessages;
}
