import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  FlatList,
  Text,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MessageBubble } from '../components/MessageBubble';
import { ChatInput } from '../components/ChatInput';
import { sendMessage, type ChatMessage } from '../lib/chat';
import { authManager } from '../lib/auth';

const DEFAULT_MODELS: Record<string, string> = {
  'anthropic': 'claude-sonnet-4-6',
  'openai-codex': 'gpt-5.4',
  'openai': 'gpt-4o',
  'google-gemini': 'gemini-3-flash',
  'github-copilot': 'gpt-4o',
  'google-antigravity': 'claude-sonnet-4-6',
};

const SYSTEM_PROMPT = `You are a helpful assistant. Format your responses using Markdown for readability.`;

export default function ChatScreen() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeProvider, setActiveProvider] = useState<{ id: string; model: string } | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const flatListRef = useRef<FlatList>(null);

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
  }, [messages.length === 0]);

  const handleSend = useCallback(
    async (text: string) => {
      if (isStreaming) return;
      if (!activeProvider) {
        setMessages((prev) => [
          ...prev,
          { id: `u-${Date.now()}`, role: 'user', content: text },
          {
            id: `e-${Date.now()}`,
            role: 'assistant',
            content: 'No provider connected. Tap the gear icon to sign in or add an API key.',
          },
        ]);
        return;
      }

      const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', content: text };
      setMessages((prev) => [...prev, userMsg]);
      setIsStreaming(true);

      const streamingId = `s-${Date.now()}`;
      let streamedText = '';

      setMessages((prev) => [
        ...prev,
        { id: streamingId, role: 'assistant', content: '', isStreaming: true },
      ]);

      await sendMessage(
        text,
        [...messages, userMsg],
        SYSTEM_PROMPT,
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
          onDone: (fullText) => {
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
            setMessages((prev) =>
              prev.map((m) =>
                m.id === streamingId
                  ? { ...m, content: `Something went wrong: ${error}`, isStreaming: false }
                  : m,
              ),
            );
          },
        },
      );

      setIsStreaming(false);
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
                Send a message to start chatting, or go to{' '}
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

        <ChatInput onSend={handleSend} disabled={isStreaming} />
      </KeyboardAvoidingView>
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
});
