# Example App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a minimal Expo example app that demonstrates `@pi-ai-rn/auth` and `@pi-ai-rn/skill-engine` with a working chat interface — a developer should understand the integration in under 5 minutes of reading.

**Architecture:** Two-screen Expo Router app (chat + settings). The chat screen streams LLM responses via `@mariozechner/pi-ai`, executes skill tools in the `SandboxWebView`, and displays messages. The settings screen lets users sign in via OAuth or paste an API key. No persistence — ephemeral session only.

**Tech Stack:** Expo SDK 55, expo-router, `@mariozechner/pi-ai`, `@pi-ai-rn/auth`, `@pi-ai-rn/skill-engine`, react-native-markdown-display

---

## File Structure

```
apps/example/
├── app.json                         # Expo config with deep link scheme
├── package.json                     # Workspace package
├── tsconfig.json                    # Extends root
├── src/
│   ├── app/
│   │   ├── _layout.tsx              # Root layout — Stack navigator
│   │   ├── index.tsx                # Chat screen (main)
│   │   └── settings.tsx             # Auth settings (OAuth + API key)
│   ├── lib/
│   │   ├── auth.ts                  # AuthManager singleton
│   │   ├── chat.ts                  # sendMessage logic (stream + tool loop)
│   │   └── skills.ts                # SkillEngine singleton + FPL skill def
│   └── components/
│       ├── MessageBubble.tsx         # Single message (markdown or tool result)
│       └── ChatInput.tsx            # Text input + send button
```

8 source files. Intentionally flat — a developer reads top-to-bottom.

---

## Task 1: Expo App Scaffolding

**Files:**
- Create: `apps/example/package.json`
- Create: `apps/example/app.json`
- Create: `apps/example/tsconfig.json`
- Create: `apps/example/src/app/_layout.tsx`

- [ ] **Step 1: Create apps/example/package.json**

```json
{
  "name": "pi-ai-rn-example",
  "version": "0.1.0",
  "private": true,
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "ios": "expo run:ios"
  },
  "dependencies": {
    "expo": "~55.0.0",
    "expo-router": "~4.0.0",
    "expo-linking": "~7.0.0",
    "expo-secure-store": "~14.0.0",
    "expo-web-browser": "~14.0.0",
    "expo-crypto": "~14.0.0",
    "expo-sqlite": "~15.0.0",
    "expo-file-system": "~18.0.0",
    "expo-status-bar": "~2.0.0",
    "react": "^18.3.0",
    "react-native": "~0.83.0",
    "react-native-webview": "~13.12.0",
    "react-native-markdown-display": "^7.0.0",
    "react-native-safe-area-context": "~5.0.0",
    "@mariozechner/pi-ai": ">=0.67.0",
    "@pi-ai-rn/auth": "*",
    "@pi-ai-rn/skill-engine": "*"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "@types/react": "^18.0.0"
  }
}
```

- [ ] **Step 2: Create apps/example/app.json**

```json
{
  "expo": {
    "name": "Pi AI Example",
    "slug": "pi-ai-rn-example",
    "version": "0.1.0",
    "scheme": "pi-ai-rn",
    "orientation": "portrait",
    "userInterfaceStyle": "automatic",
    "newArchEnabled": true,
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.piai.rn.example"
    },
    "plugins": ["expo-router", "expo-secure-store"]
  }
}
```

- [ ] **Step 3: Create apps/example/tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "paths": {
      "@pi-ai-rn/auth": ["../../packages/auth/src"],
      "@pi-ai-rn/skill-engine": ["../../packages/skill-engine/src"]
    }
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create root layout**

Create `apps/example/src/app/_layout.tsx`:

```tsx
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="auto" />
      <Stack>
        <Stack.Screen name="index" options={{ title: 'Pi AI Chat' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      </Stack>
    </>
  );
}
```

- [ ] **Step 5: Install dependencies and verify app starts**

```bash
cd /Users/wyang14/github/pi-ai-react-native/.worktrees/phase1-packages
npm install
cd apps/example
npx expo start
```

Expected: Expo dev server starts, app loads (blank screen is fine — no routes yet).

- [ ] **Step 6: Commit**

```bash
git add apps/example/
git commit -m "feat(example): scaffold Expo app with routing"
```

---

## Task 2: Auth Singleton + Settings Screen

**Files:**
- Create: `apps/example/src/lib/auth.ts`
- Create: `apps/example/src/app/settings.tsx`

- [ ] **Step 1: Create auth singleton**

Create `apps/example/src/lib/auth.ts`:

```typescript
import { AuthManager } from '@pi-ai-rn/auth';

// Single AuthManager instance for the app
export const authManager = new AuthManager();
```

- [ ] **Step 2: Create Settings screen**

Create `apps/example/src/app/settings.tsx`:

```tsx
import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { authManager } from '../lib/auth';

export default function SettingsScreen() {
  const providers = authManager.listProviders();
  const [connectedIds, setConnectedIds] = useState<Set<string>>(new Set());
  const [apiKeyInputs, setApiKeyInputs] = useState<Record<string, string>>({});
  const [showKeyInput, setShowKeyInput] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    const connected = new Set<string>();
    for (const p of providers) {
      const key = await authManager.getApiKey(p.id);
      if (key) connected.add(p.id);
    }
    setConnectedIds(connected);
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const handleLogin = async (providerId: string) => {
    try {
      await authManager.login(providerId);
      refreshStatus();
    } catch (e: any) {
      Alert.alert('Login failed', e.message);
    }
  };

  const handleLogout = async (providerId: string) => {
    await authManager.logout(providerId);
    refreshStatus();
  };

  const handleSaveKey = async (providerId: string) => {
    const key = apiKeyInputs[providerId]?.trim();
    if (!key) return;
    await authManager.setApiKey(providerId, key);
    setApiKeyInputs((prev) => ({ ...prev, [providerId]: '' }));
    setShowKeyInput(null);
    refreshStatus();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>AI PROVIDERS</Text>
      <Text style={styles.hint}>Sign in with OAuth or paste an API key.</Text>

      {providers.map((p) => {
        const connected = connectedIds.has(p.id);
        return (
          <View key={p.id} style={styles.providerRow}>
            <View style={styles.providerInfo}>
              <Text style={styles.providerName}>{p.name}</Text>
              <Text style={[styles.status, connected && styles.connected]}>
                {connected ? 'Connected' : 'Not connected'}
              </Text>
            </View>
            <View style={styles.actions}>
              {connected ? (
                <TouchableOpacity onPress={() => handleLogout(p.id)}>
                  <Text style={styles.disconnectText}>Disconnect</Text>
                </TouchableOpacity>
              ) : (
                <>
                  <TouchableOpacity
                    style={styles.button}
                    onPress={() => handleLogin(p.id)}
                  >
                    <Text style={styles.buttonText}>Sign In</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.button}
                    onPress={() =>
                      setShowKeyInput(showKeyInput === p.id ? null : p.id)
                    }
                  >
                    <Text style={styles.buttonText}>API Key</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
            {showKeyInput === p.id && (
              <View style={styles.keyRow}>
                <TextInput
                  style={styles.keyInput}
                  value={apiKeyInputs[p.id] ?? ''}
                  onChangeText={(t) =>
                    setApiKeyInputs((prev) => ({ ...prev, [p.id]: t }))
                  }
                  placeholder="Paste API key..."
                  secureTextEntry
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  style={styles.saveButton}
                  onPress={() => handleSaveKey(p.id)}
                >
                  <Text style={styles.saveText}>Save</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        );
      })}

      <Text style={[styles.sectionTitle, { marginTop: 32 }]}>RAW API KEY</Text>
      <Text style={styles.hint}>
        For providers not listed above (Groq, Together, Ollama, etc.)
      </Text>
      <View style={styles.keyRow}>
        <TextInput
          style={styles.keyInput}
          value={apiKeyInputs['custom'] ?? ''}
          onChangeText={(t) =>
            setApiKeyInputs((prev) => ({ ...prev, custom: t }))
          }
          placeholder="Provider ID (e.g. groq)"
          autoCapitalize="none"
        />
      </View>
      <View style={styles.keyRow}>
        <TextInput
          style={styles.keyInput}
          value={apiKeyInputs['custom-key'] ?? ''}
          onChangeText={(t) =>
            setApiKeyInputs((prev) => ({ ...prev, 'custom-key': t }))
          }
          placeholder="API key..."
          secureTextEntry
          autoCapitalize="none"
        />
        <TouchableOpacity
          style={styles.saveButton}
          onPress={async () => {
            const id = apiKeyInputs['custom']?.trim();
            const key = apiKeyInputs['custom-key']?.trim();
            if (!id || !key) return;
            await authManager.setApiKey(id, key);
            setApiKeyInputs((prev) => ({ ...prev, custom: '', 'custom-key': '' }));
            Alert.alert('Saved', `API key stored for "${id}"`);
          }}
        >
          <Text style={styles.saveText}>Save</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, paddingBottom: 40 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  hint: { fontSize: 14, color: '#aaa', marginBottom: 16 },
  providerRow: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  providerInfo: { marginBottom: 8 },
  providerName: { fontSize: 16, fontWeight: '500' },
  status: { fontSize: 13, color: '#aaa', marginTop: 2 },
  connected: { color: '#34c759' },
  actions: { flexDirection: 'row', gap: 10 },
  button: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
  },
  buttonText: { fontSize: 14, color: '#007aff', fontWeight: '500' },
  disconnectText: { fontSize: 14, color: '#ff3b30', fontWeight: '500' },
  keyRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  keyInput: {
    flex: 1,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
  },
  saveButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#007aff',
    borderRadius: 8,
  },
  saveText: { fontSize: 14, color: '#fff', fontWeight: '500' },
});
```

- [ ] **Step 3: Commit**

```bash
git add apps/example/src/
git commit -m "feat(example): add auth singleton and Settings screen"
```

---

## Task 3: Skill Engine Singleton + HN Copilot Definition

**Files:**
- Create: `apps/example/src/lib/skills.ts`

- [ ] **Step 1: Create skill engine singleton with HN Copilot skill**

Create `apps/example/src/lib/skills.ts`:

```typescript
import { SkillEngine, type SkillDefinition } from '@pi-ai-rn/skill-engine';

export const skillEngine = new SkillEngine();

const hnCopilotSkill: SkillDefinition = {
  id: 'hn-copilot',
  name: 'HN Copilot',
  description: 'Hacker News assistant — sync top stories, search, and analyze trends',
  allowedDomains: ['hacker-news.firebaseio.com'],
  systemPrompt: `# HN Copilot

You are a Hacker News assistant. Use tools to fetch and query live HN data.

## Workflow
1. Call sync_top_stories first to fetch the latest stories
2. Use the query tool to answer questions with SQL

## Tables (after sync)
- stories: id INTEGER PRIMARY KEY, title TEXT, url TEXT, score INTEGER, by TEXT, time INTEGER, descendants INTEGER (comment count)

## Example Queries
- Top stories by score: SELECT * FROM stories ORDER BY score DESC LIMIT 10
- Stories about a topic: SELECT * FROM stories WHERE title LIKE '%AI%' ORDER BY score DESC
- Most discussed: SELECT * FROM stories ORDER BY descendants DESC LIMIT 10
- By author: SELECT * FROM stories WHERE by = 'username'`,
  tools: [
    {
      name: 'sync_top_stories',
      description: 'Fetch the current top 30 stories from Hacker News and store them in SQLite',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Number of stories to fetch (default 30, max 100)' },
        },
      },
      execute: `async ({ limit }) => {
  const count = Math.min(limit || 30, 100);

  // Get top story IDs
  const idsRes = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
  const allIds = await idsRes.json();
  const ids = allIds.slice(0, count);

  // Create table
  await sqlite.exec('CREATE TABLE IF NOT EXISTS stories (id INTEGER PRIMARY KEY, title TEXT, url TEXT, score INTEGER, by TEXT, time INTEGER, descendants INTEGER)');

  // Fetch each story
  let synced = 0;
  for (const id of ids) {
    const res = await fetch('https://hacker-news.firebaseio.com/v0/item/' + id + '.json');
    const item = await res.json();
    if (item && item.type === 'story') {
      await sqlite.exec(
        'INSERT OR REPLACE INTO stories (id, title, url, score, by, time, descendants) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [item.id, item.title, item.url || '', item.score, item.by, item.time, item.descendants || 0]
      );
      synced++;
    }
  }

  return { synced, total_available: allIds.length };
}`,
    },
    {
      name: 'query',
      description: 'Run a read-only SQL query against the HN stories database',
      parameters: {
        type: 'object',
        properties: {
          sql: { type: 'string', description: 'SQL SELECT query' },
        },
        required: ['sql'],
      },
      execute: `async ({ sql }) => {
  if (!sql.trim().toUpperCase().startsWith('SELECT') && !sql.trim().toUpperCase().startsWith('WITH')) {
    return { error: 'Only SELECT queries allowed' };
  }
  const rows = await sqlite.query(sql);
  return { rows, count: rows.length };
}`,
    },
  ],
};

// Register the skill on import
skillEngine.registerSkill(hnCopilotSkill);
```

- [ ] **Step 2: Commit**

```bash
git add apps/example/src/lib/skills.ts
git commit -m "feat(example): add SkillEngine singleton with HN Copilot skill"
```

---

## Task 4: Chat Logic (stream + tool loop)

**Files:**
- Create: `apps/example/src/lib/chat.ts`

- [ ] **Step 1: Create chat module**

Create `apps/example/src/lib/chat.ts`:

```typescript
import { stream } from '@mariozechner/pi-ai';
import type {
  AssistantMessageEvent,
  AssistantMessage,
  Message,
  Tool,
  ToolCall,
  Context,
} from '@mariozechner/pi-ai';
import { authManager } from './auth';
import { skillEngine } from './skills';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolName?: string;
  isStreaming?: boolean;
}

interface StreamCallbacks {
  onTextDelta: (text: string) => void;
  onToolCallStart: (toolName: string) => void;
  onToolCallEnd: (toolName: string, result: string) => void;
  onDone: (fullText: string) => void;
  onError: (error: string) => void;
}

/**
 * Send a user message and stream the response.
 * Handles multi-turn tool call loops automatically.
 */
export async function sendMessage(
  userText: string,
  history: ChatMessage[],
  skillId: string | null,
  providerId: string,
  modelId: string,
  callbacks: StreamCallbacks,
): Promise<ChatMessage[]> {
  const apiKey = await authManager.getApiKey(providerId);
  if (!apiKey) {
    callbacks.onError('Not signed in. Go to Settings to connect a provider.');
    return [];
  }

  // Build pi-ai context
  const systemPrompt = skillId ? skillEngine.getSystemPrompt(skillId) : undefined;
  const tools: Tool[] = skillId
    ? skillEngine.getToolDefinitions(skillId).map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters as any,
      }))
    : [];

  // Convert our ChatMessages to pi-ai Messages
  const piMessages: Message[] = history
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => {
      if (m.role === 'user') {
        return { role: 'user' as const, content: m.content, timestamp: Date.now() };
      }
      return {
        role: 'assistant' as const,
        content: [{ type: 'text' as const, text: m.content }],
        timestamp: Date.now(),
      };
    });

  // Add the new user message
  piMessages.push({ role: 'user', content: userText, timestamp: Date.now() });

  const newMessages: ChatMessage[] = [];
  const maxSteps = 8;

  for (let step = 0; step < maxSteps; step++) {
    const context: Context = {
      systemPrompt,
      messages: piMessages,
      tools: tools.length > 0 ? tools : undefined,
    };

    // Create a model reference — pi-ai resolves this from provider + model ID
    const { getModel } = await import('@mariozechner/pi-ai');
    const model = getModel(providerId, modelId, apiKey);

    let fullText = '';
    const toolCalls: ToolCall[] = [];

    try {
      const s = stream(model, context);
      for await (const event of s) {
        switch (event.type) {
          case 'text_delta':
            fullText += event.delta;
            callbacks.onTextDelta(event.delta);
            break;
          case 'toolcall_end':
            toolCalls.push(event.toolCall);
            break;
          case 'error':
            callbacks.onError(String(event.error));
            return newMessages;
        }
      }
    } catch (e: any) {
      callbacks.onError(e.message ?? 'Stream failed');
      return newMessages;
    }

    // Add assistant message
    if (fullText) {
      const assistantMsg: ChatMessage = {
        id: `a-${Date.now()}-${step}`,
        role: 'assistant',
        content: fullText,
      };
      newMessages.push(assistantMsg);
      piMessages.push({
        role: 'assistant',
        content: [{ type: 'text', text: fullText }],
        timestamp: Date.now(),
      });
    }

    // No tool calls — done
    if (toolCalls.length === 0) {
      callbacks.onDone(fullText);
      return newMessages;
    }

    // Execute tool calls
    for (const tc of toolCalls) {
      callbacks.onToolCallStart(tc.name);

      let result: { success: boolean; data?: unknown; error?: string };
      if (skillId) {
        result = await skillEngine.executeTool(
          skillId,
          tc.name,
          typeof tc.arguments === 'string' ? JSON.parse(tc.arguments) : tc.arguments,
        );
      } else {
        result = { success: false, error: 'No skill loaded' };
      }

      const resultText = JSON.stringify(result.success ? result.data : { error: result.error });
      callbacks.onToolCallEnd(tc.name, resultText);

      const toolMsg: ChatMessage = {
        id: `t-${Date.now()}-${tc.name}`,
        role: 'tool',
        content: resultText,
        toolName: tc.name,
      };
      newMessages.push(toolMsg);

      // Add tool result to pi-ai conversation
      piMessages.push({
        role: 'toolResult' as any,
        toolCallId: tc.id,
        toolName: tc.name,
        content: [{ type: 'text', text: resultText }],
        isError: !result.success,
        timestamp: Date.now(),
      });
    }

    // Continue loop — model will see tool results
  }

  callbacks.onDone('');
  return newMessages;
}
```

**Note:** The `getModel` function from `@mariozechner/pi-ai` resolves provider + model + API key into a model object. The exact signature may vary — adapt the import path and arguments when integrating with the actual installed package. The stream events `text_delta`, `toolcall_end`, `error`, and `done` follow the pi-ai event types documented above.

- [ ] **Step 2: Commit**

```bash
git add apps/example/src/lib/chat.ts
git commit -m "feat(example): add chat module with streaming and tool call loop"
```

---

## Task 5: UI Components

**Files:**
- Create: `apps/example/src/components/MessageBubble.tsx`
- Create: `apps/example/src/components/ChatInput.tsx`

- [ ] **Step 1: Create MessageBubble**

Create `apps/example/src/components/MessageBubble.tsx`:

```tsx
import { View, Text, StyleSheet } from 'react-native';
import Markdown from 'react-native-markdown-display';
import type { ChatMessage } from '../lib/chat';

export function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === 'tool') {
    return (
      <View style={styles.toolBubble}>
        <Text style={styles.toolLabel}>{message.toolName ?? 'tool'}</Text>
        <Text style={styles.toolContent} selectable numberOfLines={6}>
          {formatJson(message.content)}
        </Text>
      </View>
    );
  }

  const isUser = message.role === 'user';

  return (
    <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
      {isUser ? (
        <Text style={styles.userText} selectable>{message.content}</Text>
      ) : (
        <Markdown style={assistantMarkdown}>{message.content}</Markdown>
      )}
    </View>
  );
}

function formatJson(s: string): string {
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}

const styles = StyleSheet.create({
  bubble: {
    maxWidth: '85%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    borderCurve: 'continuous',
    marginVertical: 3,
  },
  userBubble: { alignSelf: 'flex-end', backgroundColor: '#007aff' },
  assistantBubble: { alignSelf: 'flex-start', backgroundColor: '#f0f0f0' },
  userText: { color: '#fff', fontSize: 16 },
  toolBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#f8f8f0',
    borderRadius: 12,
    borderCurve: 'continuous',
    padding: 10,
    marginVertical: 3,
    maxWidth: '90%',
  },
  toolLabel: { fontSize: 11, fontWeight: '600', color: '#888', marginBottom: 4 },
  toolContent: { fontSize: 12, color: '#555', fontFamily: 'Menlo' },
});

const assistantMarkdown = StyleSheet.create({
  body: { color: '#000', fontSize: 16 },
  code_inline: { backgroundColor: '#e8e8e8', fontSize: 14, fontFamily: 'Menlo' },
  fence: { backgroundColor: '#f5f5f5', padding: 10, borderRadius: 8, fontSize: 13 },
});
```

- [ ] **Step 2: Create ChatInput**

Create `apps/example/src/components/ChatInput.tsx`:

```tsx
import { useState } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: Props) {
  const [text, setText] = useState('');

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        placeholder="Message..."
        placeholderTextColor="#999"
        multiline
        maxLength={4000}
        editable={!disabled}
      />
      <TouchableOpacity
        style={styles.sendButton}
        onPress={handleSend}
        disabled={!text.trim() || disabled}
      >
        <Ionicons
          name="arrow-up-circle"
          size={32}
          color={text.trim() && !disabled ? '#007aff' : '#ccc'}
        />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  input: {
    flex: 1,
    fontSize: 16,
    maxHeight: 120,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 20,
    borderCurve: 'continuous',
    marginRight: 8,
  },
  sendButton: { paddingBottom: 2 },
});
```

- [ ] **Step 3: Commit**

```bash
git add apps/example/src/components/
git commit -m "feat(example): add MessageBubble and ChatInput components"
```

---

## Task 6: Chat Screen — Full Integration

**Files:**
- Create: `apps/example/src/app/index.tsx`

- [ ] **Step 1: Create the Chat screen**

Create `apps/example/src/app/index.tsx`:

```tsx
import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  FlatList,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MessageBubble } from '../components/MessageBubble';
import { ChatInput } from '../components/ChatInput';
import { sendMessage, type ChatMessage } from '../lib/chat';
import { skillEngine } from '../lib/skills';
import { SandboxWebView, type SandboxWebViewRef, BridgeHost } from '@pi-ai-rn/skill-engine';
import { openDatabaseSync } from 'expo-sqlite';
import * as FileSystem from 'expo-file-system';

// Hardcoded defaults — a real app would let the user pick these
const DEFAULT_PROVIDER = 'anthropic';
const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const SKILL_ID = 'hn-copilot';

export default function ChatScreen() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeToolCall, setActiveToolCall] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const sandboxRef = useRef<SandboxWebViewRef>(null);
  const bridgeRef = useRef<BridgeHost | null>(null);

  // Set up sandbox bridge + executor
  useEffect(() => {
    const skill = skillEngine.getSkillDefinition(SKILL_ID);
    const skillDataDir = `${FileSystem.documentDirectory}skills/${SKILL_ID}`;
    const skillDb = openDatabaseSync(`skill-${SKILL_ID}.db`);

    const bridge = new BridgeHost({
      skillId: SKILL_ID,
      allowedDomains: skill.allowedDomains ?? [],
      sendToWebView: (response) => sandboxRef.current?.sendMessage(response),
      db: skillDb,
      dataDir: skillDataDir,
    });
    bridgeRef.current = bridge;

    // Wire up SkillEngine executor
    const pendingCalls = new Map<string, (r: any) => void>();

    skillEngine.setExecutor(async (_sid, toolName, args) => {
      const requestId = `tool-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      return new Promise((resolve) => {
        pendingCalls.set(requestId, resolve);
        sandboxRef.current?.executeToolRequest(toolName, args, requestId);
      });
    });

    // Listen for tool results from WebView
    const onToolResult = (requestId: string, result: any) => {
      const resolve = pendingCalls.get(requestId);
      if (resolve) {
        pendingCalls.delete(requestId);
        resolve(result);
      }
    };

    // Store onToolResult so the SandboxWebView can call it
    (globalThis as any).__onToolResult = onToolResult;

    // Register tools in WebView after a brief delay for load
    const timer = setTimeout(() => {
      for (const tool of skill.tools) {
        sandboxRef.current?.injectToolRegistration(tool.name, tool.execute);
      }
    }, 500);

    return () => {
      clearTimeout(timer);
      pendingCalls.clear();
    };
  }, []);

  const handleSend = useCallback(
    async (text: string) => {
      if (isStreaming) return;

      // Add user message immediately
      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: 'user',
        content: text,
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsStreaming(true);

      // Streaming placeholder
      let streamingId = `s-${Date.now()}`;
      let streamedText = '';

      setMessages((prev) => [
        ...prev,
        { id: streamingId, role: 'assistant', content: '', isStreaming: true },
      ]);

      try {
        const newMsgs = await sendMessage(
          text,
          [...messages, userMsg],
          SKILL_ID,
          DEFAULT_PROVIDER,
          DEFAULT_MODEL,
          {
            onTextDelta: (delta) => {
              streamedText += delta;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === streamingId ? { ...m, content: streamedText } : m,
                ),
              );
            },
            onToolCallStart: (name) => setActiveToolCall(name),
            onToolCallEnd: (name, result) => {
              setActiveToolCall(null);
              // Add tool result message
              setMessages((prev) => [
                ...prev.filter((m) => m.id !== streamingId),
                ...newMsgs.filter((m) => m.role !== 'assistant'),
              ]);
              // Reset streaming for next assistant turn
              streamingId = `s-${Date.now()}`;
              streamedText = '';
              setMessages((prev) => [
                ...prev,
                { id: streamingId, role: 'assistant', content: '', isStreaming: true },
              ]);
            },
            onDone: (fullText) => {
              // Replace streaming placeholder with final message
              setMessages((prev) =>
                prev
                  .filter((m) => m.id !== streamingId || fullText)
                  .map((m) =>
                    m.id === streamingId
                      ? { ...m, content: fullText, isStreaming: false }
                      : m,
                  ),
              );
            },
            onError: (error) => {
              Alert.alert('Error', error);
              setMessages((prev) => prev.filter((m) => m.id !== streamingId));
            },
          },
        );
      } finally {
        setIsStreaming(false);
        setActiveToolCall(null);
      }
    },
    [messages, isStreaming],
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        {/* Message list */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => <MessageBubble message={item} />}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: true })
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Pi AI Example</Text>
              <Text style={styles.emptyHint}>
                HN Copilot is loaded. Try "Sync the latest Hacker News stories" or go to{' '}
                <Text
                  style={styles.link}
                  onPress={() => router.push('/settings')}
                >
                  Settings
                </Text>{' '}
                to connect a provider.
              </Text>
            </View>
          }
        />

        {/* Tool call indicator */}
        {activeToolCall && (
          <View style={styles.toolIndicator}>
            <ActivityIndicator size="small" color="#007aff" />
            <Text style={styles.toolIndicatorText}>
              Running {activeToolCall}...
            </Text>
          </View>
        )}

        <ChatInput onSend={handleSend} disabled={isStreaming} />
      </KeyboardAvoidingView>

      {/* Hidden sandbox WebView */}
      <SandboxWebView
        ref={sandboxRef}
        onBridgeMessage={(msg) => bridgeRef.current?.handleMessage(msg)}
        onToolResult={(requestId, result) => {
          (globalThis as any).__onToolResult?.(requestId, result);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  messageList: { padding: 16, paddingBottom: 8 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, marginTop: 100 },
  emptyTitle: { fontSize: 22, fontWeight: '600', marginBottom: 12 },
  emptyHint: { fontSize: 15, color: '#888', textAlign: 'center', lineHeight: 22 },
  link: { color: '#007aff' },
  toolIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: '#f0f4ff',
    marginHorizontal: 16,
    borderRadius: 8,
    borderCurve: 'continuous',
  },
  toolIndicatorText: { marginLeft: 8, fontSize: 13, color: '#007aff', fontWeight: '500' },
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/example/src/app/index.tsx
git commit -m "feat(example): add Chat screen with streaming, tool calls, and sandbox"
```

---

## Task 7: Install, Verify, and Polish

- [ ] **Step 1: Install all dependencies**

```bash
cd /Users/wyang14/github/pi-ai-react-native/.worktrees/phase1-packages
npm install
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/example
npx tsc --noEmit
```

Fix any type errors. Common issues:
- `@mariozechner/pi-ai` types may need `--skipLibCheck`
- `react-native-markdown-display` may need `@types/` or a `.d.ts` shim
- `@expo/vector-icons` types

- [ ] **Step 3: Start dev server**

```bash
npx expo start
```

Verify:
1. App launches (Expo Go or dev client)
2. Chat screen shows empty state with hint text
3. "Settings" is accessible from header
4. Settings screen lists all 5 OAuth providers

- [ ] **Step 4: Test the flow manually**

1. Go to Settings → paste an API key for a provider
2. Go back to Chat → type a message → verify streaming response
3. Type "Sync the latest Hacker News stories" → verify tool call indicator shows → verify data comes back
4. Type "Show top 5 stories by score" → verify SQL query executes

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix(example): resolve type and runtime issues"
```

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat(example): complete minimal example app"
```
