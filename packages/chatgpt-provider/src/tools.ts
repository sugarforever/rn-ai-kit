import type { LanguageModelV1ProviderDefinedTool } from '@ai-sdk/provider';

export interface ImageGenerationToolArgs {
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
 */
export function imageGenerationTool(
  args: ImageGenerationToolArgs = {},
): ImageGenerationTool {
  return {
    type: 'provider-defined',
    id: 'chatgpt.image_generation',
    args: args as Record<string, unknown>,
    parameters: { jsonSchema: { type: 'object', properties: {}, additionalProperties: false } },
  };
}

export const chatgptTools = {
  imageGeneration: imageGenerationTool,
};
