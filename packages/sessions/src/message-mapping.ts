import type { UIMessage } from 'ai';
import type { PersistedMessage, AppendMessageInput } from './types';

export function toUIMessage(persisted: PersistedMessage): UIMessage {
  const content = persisted.parts
    .filter((p): p is Extract<typeof p, { type: 'text'; text: string }> =>
      p.type === 'text' && typeof (p as { text?: unknown }).text === 'string',
    )
    .map((p) => p.text)
    .join('');
  return {
    id: persisted.id,
    role: persisted.role,
    content,
    parts: persisted.parts,
  };
}

export function fromUIMessage(
  message: UIMessage,
): Pick<AppendMessageInput, 'role' | 'parts'> {
  return {
    role: message.role,
    parts: message.parts,
  };
}

export function titleFromFirstMessage(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (!collapsed) return 'New chat';
  if (collapsed.length <= 50) return collapsed;
  return collapsed.slice(0, 47) + '...';
}
