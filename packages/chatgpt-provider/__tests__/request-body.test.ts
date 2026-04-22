import { ChatGPTLanguageModel } from '../src/chatgpt-language-model';
import { imageGenerationTool } from '../src/tools';
import type { LanguageModelV1CallOptions } from '@ai-sdk/provider';

// Synthetic JWT with a valid chatgpt_account_id claim.
function makeToken(): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      'https://api.openai.com/auth': { chatgpt_account_id: 'acct-test' },
    }),
  ).toString('base64url');
  return `${header}.${payload}.sig`;
}

function buildOptions(
  tools: NonNullable<Extract<LanguageModelV1CallOptions['mode'], { type: 'regular' }>['tools']>,
): LanguageModelV1CallOptions {
  return {
    inputFormat: 'prompt',
    prompt: [{ role: 'user', content: [{ type: 'text', text: 'draw a cat' }] }],
    mode: { type: 'regular', tools },
  };
}

describe('ChatGPTLanguageModel.buildRequestBody (via captured fetch)', () => {
  it('passes chatgpt.image_generation as a built-in image_generation tool', async () => {
    let captured: any;
    const fakeFetch = async (_url: string, init: RequestInit) => {
      captured = JSON.parse(init.body as string);
      return new Response('', { status: 500 });
    };
    const model = new ChatGPTLanguageModel('gpt-5.4', {
      apiKey: makeToken(),
      fetch: fakeFetch as any,
    });
    const tool = imageGenerationTool({ quality: 'high', size: '1024x1024' });
    try {
      await model.doGenerate(
        buildOptions([{ ...tool, name: 'image_generation' } as any]),
      );
    } catch {
      // expected — fake fetch returns 500
    }
    expect(captured.tools).toEqual([
      { type: 'image_generation', output_format: 'png', quality: 'high', size: '1024x1024' },
    ]);
    expect(captured.tool_choice).toBe('auto');
  });

  it('defaults output_format to png to match Codex CLI contract', async () => {
    let captured: any;
    const fakeFetch = async (_url: string, init: RequestInit) => {
      captured = JSON.parse(init.body as string);
      return new Response('', { status: 500 });
    };
    const model = new ChatGPTLanguageModel('gpt-5.4', {
      apiKey: makeToken(),
      fetch: fakeFetch as any,
    });
    try {
      await model.doGenerate(
        buildOptions([{ ...imageGenerationTool(), name: 'image_generation' } as any]),
      );
    } catch {
      // expected
    }
    expect(captured.tools).toEqual([{ type: 'image_generation', output_format: 'png' }]);
  });

  it('mixes function and built-in tools', async () => {
    let captured: any;
    const fakeFetch = async (_url: string, init: RequestInit) => {
      captured = JSON.parse(init.body as string);
      return new Response('', { status: 500 });
    };
    const model = new ChatGPTLanguageModel('gpt-5.4', {
      apiKey: makeToken(),
      fetch: fakeFetch as any,
    });
    try {
      await model.doGenerate(
        buildOptions([
          {
            type: 'function',
            name: 'get_weather',
            description: 'w',
            parameters: { type: 'object', properties: {} },
          },
          { ...imageGenerationTool(), name: 'image_generation' } as any,
        ]),
      );
    } catch {
      // expected
    }
    expect(captured.tools).toHaveLength(2);
    expect(captured.tools[0].type).toBe('function');
    expect(captured.tools[1]).toEqual({ type: 'image_generation', output_format: 'png' });
  });
});
