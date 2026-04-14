export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  tools: SkillTool[];
  allowedDomains?: string[];
}

export interface SkillTool {
  name: string;
  description: string;
  parameters: JSONSchema;
  execute: string;
}

export interface JSONSchema {
  type: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  description?: string;
  items?: JSONSchema;
  enum?: (string | number)[];
}

export type BridgeMessageType = 'fetch' | 'sqlite-exec' | 'sqlite-query' | 'fs-read' | 'fs-write' | 'tool-result' | 'tool-error';

export interface BridgeMessage {
  id: string;
  type: BridgeMessageType;
  payload: unknown;
}

export interface BridgeResponse {
  id: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface ToolExecutionRequest {
  skillId: string;
  toolName: string;
  args: Record<string, unknown>;
}

export interface ToolExecutionResult {
  success: boolean;
  data?: unknown;
  error?: string;
}
