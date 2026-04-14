import type { SkillDefinition, SkillTool, BridgeMessage, BridgeResponse } from '../src/types';

describe('Skill Engine types', () => {
  it('SkillDefinition is structurally valid', () => {
    const skill: SkillDefinition = {
      id: 'fpl-copilot',
      name: 'FPL Copilot',
      description: 'Fantasy Premier League assistant',
      systemPrompt: '# FPL Copilot\nYou help with FPL.',
      tools: [],
      allowedDomains: ['fantasy.premierleague.com'],
    };
    expect(skill.id).toBe('fpl-copilot');
    expect(skill.tools).toHaveLength(0);
  });

  it('SkillTool is structurally valid', () => {
    const tool: SkillTool = {
      name: 'sync_bootstrap',
      description: 'Fetch latest FPL data',
      parameters: { type: 'object', properties: { force: { type: 'boolean' } } },
      execute: 'async ({ force }) => { return { ok: true }; }',
    };
    expect(tool.name).toBe('sync_bootstrap');
  });

  it('BridgeMessage has required fields', () => {
    const msg: BridgeMessage = {
      id: 'msg-1',
      type: 'fetch',
      payload: { url: 'https://example.com', options: {} },
    };
    expect(msg.type).toBe('fetch');
  });

  it('BridgeResponse has required fields', () => {
    const res: BridgeResponse = {
      id: 'msg-1',
      success: true,
      data: { status: 200, body: '{}' },
    };
    expect(res.success).toBe(true);
  });
});
