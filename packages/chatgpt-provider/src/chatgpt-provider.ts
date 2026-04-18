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
