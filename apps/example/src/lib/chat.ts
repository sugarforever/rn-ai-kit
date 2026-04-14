import { stream } from '@mariozechner/pi-ai';
import type {
  AssistantMessageEvent,
  AssistantMessage,
  Message,
  Tool,
  ToolCall,
  Context,
} from '@mariozechner/pi-ai';
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

  // Build pi-ai context
  const systemPrompt = skillId ? skillEngine.getSystemPrompt(skillId) : undefined;
  const tools: Tool[] = skillId
    ? skillEngine.getToolDefinitions(skillId).map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters as any,
      }))
    : [];

  // Convert our ChatMessages to pi-ai Messages
  const piMessages: Message[] = history
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => {
      if (m.role === 'user') {
        return { role: 'user' as const, content: m.content, timestamp: Date.now() };
      }
      return {
        role: 'assistant' as const,
        content: [{ type: 'text' as const, text: m.content }],
        timestamp: Date.now(),
      };
    });

  // Add the new user message
  piMessages.push({ role: 'user', content: userText, timestamp: Date.now() });

  const newMessages: ChatMessage[] = [];
  const maxSteps = 8;

  for (let step = 0; step < maxSteps; step++) {
    const context: Context = {
      systemPrompt,
      messages: piMessages,
      tools: tools.length > 0 ? tools : undefined,
    };

    // Create a model reference
    const { getModel } = await import('@mariozechner/pi-ai');
    const model = getModel(providerId, modelId, apiKey);

    let fullText = '';
    const toolCalls: ToolCall[] = [];

    try {
      const s = stream(model, context);
      for await (const event of s) {
        switch (event.type) {
          case 'text_delta':
            fullText += event.delta;
            callbacks.onTextDelta(event.delta);
            break;
          case 'toolcall_end':
            toolCalls.push(event.toolCall);
            break;
          case 'error':
            callbacks.onError(String(event.error));
            return newMessages;
        }
      }
    } catch (e: any) {
      callbacks.onError(e.message ?? 'Stream failed');
      return newMessages;
    }

    // Add assistant message
    if (fullText) {
      const assistantMsg: ChatMessage = {
        id: `a-${Date.now()}-${step}`,
        role: 'assistant',
        content: fullText,
      };
      newMessages.push(assistantMsg);
      piMessages.push({
        role: 'assistant',
        content: [{ type: 'text', text: fullText }],
        timestamp: Date.now(),
      });
    }

    // No tool calls — done
    if (toolCalls.length === 0) {
      callbacks.onDone(fullText);
      return newMessages;
    }

    // Execute tool calls
    for (const tc of toolCalls) {
      callbacks.onToolCallStart(tc.name);

      let result: { success: boolean; data?: unknown; error?: string };
      if (skillId) {
        result = await skillEngine.executeTool(
          skillId,
          tc.name,
          typeof tc.arguments === 'string' ? JSON.parse(tc.arguments) : tc.arguments,
        );
      } else {
        result = { success: false, error: 'No skill loaded' };
      }

      const resultText = JSON.stringify(result.success ? result.data : { error: result.error });
      callbacks.onToolCallEnd(tc.name, resultText);

      const toolMsg: ChatMessage = {
        id: `t-${Date.now()}-${tc.name}`,
        role: 'tool',
        content: resultText,
        toolName: tc.name,
      };
      newMessages.push(toolMsg);

      // Add tool result to pi-ai conversation
      piMessages.push({
        role: 'toolResult' as any,
        toolCallId: tc.id,
        toolName: tc.name,
        content: [{ type: 'text', text: resultText }],
        isError: !result.success,
        timestamp: Date.now(),
      });
    }

    // Continue loop — model will see tool results
  }

  callbacks.onDone('');
  return newMessages;
}
