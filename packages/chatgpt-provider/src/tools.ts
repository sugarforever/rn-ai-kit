import type { LanguageModelV1ProviderDefinedTool } from '@ai-sdk/provider';

export interface ImageGenerationToolArgs {
  /** Output image format. Defaults to 'png' to match the Codex CLI contract. */
  output_format?: 'png' | 'jpeg' | 'webp';
  action?: 'auto' | 'generate' | 'edit';
  quality?: 'low' | 'medium' | 'high' | 'auto';
  size?: string;
  partial_images?: number;
  input_image_mask?: { file_id: string };
}

type ImageGenerationTool = Omit<LanguageModelV1ProviderDefinedTool, 'name'> & {
  parameters: { jsonSchema: Record<string, unknown> };
};

/**
 * Declare the built-in image_generation tool for ChatGPT OAuth / Codex Responses.
 * Pass the result via `tools: { image_generation: chatgptTools.imageGeneration() }`
 * to `streamText` or `generateText`.
 *
 * The Codex CLI gates this tool on ChatGPT OAuth auth mode — raw API keys hit
 * a different entitlement path. Only expose this when the active provider is
 * the ChatGPT OAuth flow.
 */
export function imageGenerationTool(
  args: ImageGenerationToolArgs = {},
): ImageGenerationTool {
  const serialized: Record<string, unknown> = { output_format: 'png', ...args };
  return {
    type: 'provider-defined',
    id: 'chatgpt.image_generation',
    args: serialized,
    parameters: { jsonSchema: { type: 'object', properties: {}, additionalProperties: false } },
  };
}

export const chatgptTools = {
  imageGeneration: imageGenerationTool,
};
