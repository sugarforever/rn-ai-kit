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
