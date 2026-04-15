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
import { authManager } from '../lib/auth';
import { skillEngine } from '../lib/skills';
import { SandboxWebView, type SandboxWebViewRef, BridgeHost } from '@pi-ai-rn/skill-engine';
import { openDatabaseSync } from 'expo-sqlite';
import * as FileSystem from 'expo-file-system';

// Default models per provider — a real app would let the user pick
const DEFAULT_MODELS: Record<string, string> = {
  'anthropic': 'claude-sonnet-4-20250514',
  'openai-codex': 'gpt-4o',
  'google-gemini': 'gemini-2.0-flash',
  'github-copilot': 'gpt-4o',
};
const SKILL_ID = 'hn-copilot';

export default function ChatScreen() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeProvider, setActiveProvider] = useState<{ id: string; model: string } | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeToolCall, setActiveToolCall] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const sandboxRef = useRef<SandboxWebViewRef>(null);
  const bridgeRef = useRef<BridgeHost | null>(null);

  // Detect which provider is connected
  useEffect(() => {
    (async () => {
      const providers = authManager.listProviders();
      for (const p of providers) {
        const key = await authManager.getApiKey(p.id);
        if (key) {
          setActiveProvider({ id: p.id, model: DEFAULT_MODELS[p.id] ?? 'gpt-4o' });
          return;
        }
      }
      setActiveProvider(null);
    })();
  }, [messages.length === 0]); // re-check when navigating back from settings

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
      if (!activeProvider) {
        Alert.alert('Not signed in', 'Go to Settings to connect a provider.');
        return;
      }

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
          activeProvider.id,
          activeProvider.model,
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
    [messages, isStreaming, activeProvider],
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
