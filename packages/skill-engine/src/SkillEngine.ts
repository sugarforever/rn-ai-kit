import type { SkillDefinition, SkillTool, ToolExecutionResult } from './types';

export class SkillEngine {
  private skills = new Map<string, SkillDefinition>();
  private executeInSandbox:
    | ((skillId: string, toolName: string, args: Record<string, unknown>) => Promise<ToolExecutionResult>)
    | null = null;

  registerSkill(skill: SkillDefinition): void {
    this.skills.set(skill.id, skill);
  }

  unregisterSkill(skillId: string): void {
    this.skills.delete(skillId);
  }

  listSkills(): { id: string; name: string; description: string }[] {
    return Array.from(this.skills.values()).map((s) => ({
      id: s.id, name: s.name, description: s.description,
    }));
  }

  getSystemPrompt(skillId: string): string {
    return this.getSkill(skillId).systemPrompt;
  }

  getToolDefinitions(skillId: string): Omit<SkillTool, 'execute'>[] {
    const skill = this.getSkill(skillId);
    return skill.tools.map(({ execute, ...rest }) => rest);
  }

  getSkillDefinition(skillId: string): SkillDefinition {
    return this.getSkill(skillId);
  }

  setExecutor(
    fn: (skillId: string, toolName: string, args: Record<string, unknown>) => Promise<ToolExecutionResult>,
  ): void {
    this.executeInSandbox = fn;
  }

  async executeTool(
    skillId: string, toolName: string, args: Record<string, unknown>,
  ): Promise<ToolExecutionResult> {
    const skill = this.getSkill(skillId);
    const tool = skill.tools.find((t) => t.name === toolName);
    if (!tool) return { success: false, error: `Tool not found: ${toolName}` };
    if (!this.executeInSandbox) return { success: false, error: 'No sandbox executor configured' };
    return this.executeInSandbox(skillId, toolName, args);
  }

  private getSkill(skillId: string): SkillDefinition {
    const skill = this.skills.get(skillId);
    if (!skill) throw new Error(`Skill not found: ${skillId}`);
    return skill;
  }
}
