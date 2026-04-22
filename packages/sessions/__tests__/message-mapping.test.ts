import type { UIMessage } from 'ai';
import type { PersistedMessage } from '../src/types';
import {
  toUIMessage,
  fromUIMessage,
  titleFromFirstMessage,
} from '../src/message-mapping';

describe('toUIMessage', () => {
  it('builds a UIMessage with the persisted id, role, parts, and synthesized content', () => {
    const persisted: PersistedMessage = {
      id: 'msg-1',
      sessionId: 'sess-1',
      role: 'user',
      parts: [{ type: 'text', text: 'hello' }],
      createdAt: '2026-04-20T10:00:00.000Z',
    };
    const ui = toUIMessage(persisted);
    expect(ui.id).toBe('msg-1');
    expect(ui.role).toBe('user');
    expect(ui.parts).toEqual([{ type: 'text', text: 'hello' }]);
    expect(ui.content).toBe('hello');
  });

  it('concatenates multiple text parts into content', () => {
    const persisted: PersistedMessage = {
      id: 'msg-2',
      sessionId: 'sess-1',
      role: 'assistant',
      parts: [
        { type: 'text', text: 'Hello, ' },
        { type: 'text', text: 'world!' },
      ],
      createdAt: '2026-04-20T10:00:00.000Z',
    };
    const ui = toUIMessage(persisted);
    expect(ui.content).toBe('Hello, world!');
  });

  it('returns empty content when no text parts are present', () => {
    const persisted: PersistedMessage = {
      id: 'msg-3',
      sessionId: 'sess-1',
      role: 'assistant',
      parts: [],
      createdAt: '2026-04-20T10:00:00.000Z',
    };
    const ui = toUIMessage(persisted);
    expect(ui.content).toBe('');
  });
});

describe('fromUIMessage', () => {
  it('returns role + parts only', () => {
    const ui: UIMessage = {
      id: 'tmp',
      role: 'assistant',
      content: 'hi',
      parts: [{ type: 'text', text: 'hi' }],
    };
    const result = fromUIMessage(ui);
    expect(result).toEqual({
      role: 'assistant',
      parts: [{ type: 'text', text: 'hi' }],
    });
  });
});

describe('titleFromFirstMessage', () => {
  it('returns the text verbatim when under 50 chars', () => {
    expect(titleFromFirstMessage('Short question')).toBe('Short question');
  });

  it('truncates at 47 chars + ellipsis when over 50', () => {
    const long = 'a'.repeat(100);
    const title = titleFromFirstMessage(long);
    expect(title).toHaveLength(50);
    expect(title.endsWith('...')).toBe(true);
  });

  it('collapses newlines and excess whitespace to single spaces', () => {
    expect(titleFromFirstMessage('hello\n\n  world')).toBe('hello world');
  });

  it('returns "New chat" for empty or whitespace-only input', () => {
    expect(titleFromFirstMessage('')).toBe('New chat');
    expect(titleFromFirstMessage('   \n  ')).toBe('New chat');
  });
});
