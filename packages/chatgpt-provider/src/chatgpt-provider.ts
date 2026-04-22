import { ChatGPTLanguageModel, type ChatGPTLanguageModelConfig } from './chatgpt-language-model';

export interface ChatGPTProviderOptions {
  /** ChatGPT subscription OAuth JWT token. */
  apiKey: string;
  /** Override base URL (default: https://chatgpt.com/backend-api). */
  baseUrl?: string;
  /** Custom fetch function. Use expo/fetch on React Native for streaming support. */
  fetch?: typeof globalThis.fetch;
  /**
   * Stable per-install UUID sent as the `x-codex-installation-id` header.
   * The backend uses this for first-party client identification; Codex CLI
   * always sends one. Generate once on first launch and persist.
   */
  installationId?: string;
  /**
   * Stable per-conversation identifier sent as `prompt_cache_key` in the
   * request body. Maps to Codex's conversation_id. Enables prompt caching
   * and is part of first-party client signals.
   */
  conversationId?: string;
}

export interface ChatGPTProvider {
  (modelId: string): ChatGPTLanguageModel;
}

/**
 * Create a ChatGPT backend provider for the AI SDK.
 *
 * Usage:
 * ```ts
 * import { createChatGPT } from '@rn-ai-kit/chatgpt-provider';
 * const chatgpt = createChatGPT({ apiKey: '<oauth-token>' });
 * const model = chatgpt('gpt-5.4');
 * ```
 */
export function createChatGPT(options: ChatGPTProviderOptions): ChatGPTProvider {
  const config: ChatGPTLanguageModelConfig = {
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    fetch: options.fetch,
    installationId: options.installationId,
    conversationId: options.conversationId,
  };

  return (modelId: string) => new ChatGPTLanguageModel(modelId, config);
}
