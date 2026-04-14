import { SkillEngine } from '../src/SkillEngine';
import type { SkillDefinition } from '../src/types';

const testSkill: SkillDefinition = {
  id: 'test-skill',
  name: 'Test Skill',
  description: 'A test skill',
  systemPrompt: '# Test\nYou are a test assistant.',
  tools: [
    {
      name: 'greet',
      description: 'Say hello',
      parameters: { type: 'object', properties: { name: { type: 'string' } } },
      execute: 'async ({ name }) => ({ message: `Hello, ${name}!` })',
    },
  ],
  allowedDomains: ['api.example.com'],
};

describe('SkillEngine', () => {
  let engine: SkillEngine;

  beforeEach(() => {
    engine = new SkillEngine();
  });

  it('registers and retrieves a skill system prompt', () => {
    engine.registerSkill(testSkill);
    expect(engine.getSystemPrompt('test-skill')).toBe('# Test\nYou are a test assistant.');
  });

  it('returns tool definitions for pi-ai integration', () => {
    engine.registerSkill(testSkill);
    const tools = engine.getToolDefinitions('test-skill');
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('greet');
    expect(tools[0].description).toBe('Say hello');
    expect(tools[0].parameters).toEqual({
      type: 'object',
      properties: { name: { type: 'string' } },
    });
  });

  it('throws when accessing unregistered skill', () => {
    expect(() => engine.getSystemPrompt('nonexistent')).toThrow('Skill not found');
  });

  it('unregisters a skill', () => {
    engine.registerSkill(testSkill);
    engine.unregisterSkill('test-skill');
    expect(() => engine.getSystemPrompt('test-skill')).toThrow('Skill not found');
  });

  it('lists registered skills', () => {
    engine.registerSkill(testSkill);
    const skills = engine.listSkills();
    expect(skills).toEqual([{ id: 'test-skill', name: 'Test Skill', description: 'A test skill' }]);
  });
});
