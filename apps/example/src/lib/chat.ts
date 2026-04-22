import { streamText } from 'ai';
import type { UIMessage } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createChatGPT, chatgptTools } from '@rn-ai-kit/chatgpt-provider';
import { fetch as expoFetch } from 'expo/fetch';
import { authManager } from './auth';

type UIMessagePart = UIMessage['parts'][number];

export interface GeneratedImage {
  base64: string;
  mimeType: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  images?: GeneratedImage[];
  isStreaming?: boolean;
}

interface StreamCallbacks {
  onTextDelta: (text: string) => void;
  onFile?: (file: GeneratedImage) => void;
  onDone: (fullText: string, parts: UIMessagePart[]) => void;
  onError: (error: string) => void;
}

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

  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const m of history) {
    messages.push({ role: m.role, content: m.content });
  }
  messages.push({ role: 'user', content: userText });

  // Offer the built-in image_generation tool when talking to ChatGPT OAuth.
  // The model decides whether to invoke it based on the user prompt.
  const tools =
    providerId === 'openai-codex'
      ? { image_generation: chatgptTools.imageGeneration() }
      : undefined;

  try {
    const result = streamText({ model, system: systemPrompt, messages, tools: tools as any });

    let fullText = '';
    const images: GeneratedImage[] = [];
    for await (const part of result.fullStream) {
      switch (part.type) {
        case 'text-delta':
          fullText += part.textDelta;
          callbacks.onTextDelta(part.textDelta);
          break;
        case 'file': {
          const mimeType = part.mimeType ?? 'image/png';
          if (mimeType.startsWith('image/')) {
            const img: GeneratedImage = { base64: part.base64, mimeType };
            images.push(img);
            callbacks.onFile?.(img);
          }
          break;
        }
        case 'error':
          callbacks.onError(
            part.error instanceof Error ? part.error.message : String(part.error),
          );
          return;
      }
    }

    const parts: UIMessagePart[] = [];
    if (fullText) parts.push({ type: 'text', text: fullText } as UIMessagePart);
    for (const img of images) {
      parts.push({
        type: 'file',
        data: img.base64,
        mimeType: img.mimeType,
      } as UIMessagePart);
    }
    callbacks.onDone(fullText, parts);
  } catch (e: any) {
    callbacks.onError(e.message ?? String(e));
  }
}
