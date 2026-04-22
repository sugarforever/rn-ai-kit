import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  FlatList,
  Text,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useSession,
  useSessionStore,
  titleFromFirstMessage,
} from '@rn-ai-kit/sessions';
import { MessageBubble } from '../components/MessageBubble';
import { ChatInput } from '../components/ChatInput';
import { sendMessage, type ChatMessage, type GeneratedImage } from '../lib/chat';
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

function partsToText(parts: Array<{ type: string; text?: string }>): string {
  return parts
    .filter((p) => p.type === 'text' && typeof p.text === 'string')
    .map((p) => p.text as string)
    .join('');
}

function partsToImages(
  parts: Array<{ type: string; data?: string; mimeType?: string }>,
): GeneratedImage[] {
  return parts
    .filter(
      (p) =>
        p.type === 'file' &&
        typeof p.data === 'string' &&
        typeof p.mimeType === 'string' &&
        p.mimeType.startsWith('image/'),
    )
    .map((p) => ({ base64: p.data as string, mimeType: p.mimeType as string }));
}

export default function ChatScreen() {
  const router = useRouter();
  const store = useSessionStore();
  const params = useLocalSearchParams<{ sessionId?: string }>();
  const sessionId = params.sessionId ?? null;

  const { messages: persisted, session, updateSession } = useSession(sessionId);
  const [activeProvider, setActiveProvider] = useState<{ id: string; model: string } | null>(null);
  const [streamingMessage, setStreamingMessage] = useState<ChatMessage | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const flatListRef = useRef<FlatList>(null);

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
  }, []);

  const displayMessages = useMemo<ChatMessage[]>(() => {
    const rehydrated: ChatMessage[] = persisted
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: partsToText(m.parts as any),
        images: partsToImages(m.parts as any),
      }));
    return streamingMessage ? [...rehydrated, streamingMessage] : rehydrated;
  }, [persisted, streamingMessage]);

  const handleSend = useCallback(
    async (text: string) => {
      if (isStreaming) return;
      if (!activeProvider) {
        setStreamingMessage({
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: 'No provider connected. Go to **Settings** to sign in or add an API key.',
        });
        return;
      }

      let currentSessionId = sessionId;
      if (!currentSessionId) {
        const s = await store.createSession({
          title: titleFromFirstMessage(text),
          providerId: activeProvider.id,
          modelId: activeProvider.model,
        });
        currentSessionId = s.id;
        router.setParams({ sessionId: s.id });
      } else if (session && !session.providerId) {
        await updateSession({ providerId: activeProvider.id, modelId: activeProvider.model });
      }

      await store.appendMessage(currentSessionId, {
        role: 'user',
        parts: [{ type: 'text', text } as any],
      });

      setIsStreaming(true);
      const streamingId = `s-${Date.now()}`;
      let streamedText = '';
      setStreamingMessage({ id: streamingId, role: 'assistant', content: '', isStreaming: true });

      const historyForModel: ChatMessage[] = persisted
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          content: partsToText(m.parts as any),
        }));

      await sendMessage(
        text,
        historyForModel,
        SYSTEM_PROMPT,
        activeProvider.id,
        activeProvider.model,
        {
          onTextDelta: (delta) => {
            streamedText += delta;
            setStreamingMessage((prev) =>
              prev && prev.id === streamingId
                ? { ...prev, content: streamedText }
                : prev,
            );
          },
          onFile: (img) => {
            setStreamingMessage((prev) =>
              prev && prev.id === streamingId
                ? { ...prev, images: [...(prev.images ?? []), img] }
                : prev,
            );
          },
          onDone: async (_fullText, parts) => {
            if (parts.length > 0) {
              await store.appendMessage(currentSessionId!, {
                role: 'assistant',
                parts,
              });
            }
            setStreamingMessage(null);
          },
          onError: (errMsg) => {
            setStreamingMessage({
              id: streamingId,
              role: 'assistant',
              content: `Something went wrong: ${errMsg}`,
            });
          },
        },
      );

      setIsStreaming(false);
    },
    [isStreaming, activeProvider, sessionId, store, session, updateSession, persisted, router],
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
          data={displayMessages}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => <MessageBubble message={item} />}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: true })
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>{'✦'}</Text>
              <Text style={styles.emptyTitle}>RN AI Kit</Text>
              <Text style={styles.emptySubtitle}>
                Multi-provider AI on React Native
              </Text>
              <Text
                style={styles.emptyAction}
                onPress={() => router.push('/settings')}
              >
                {activeProvider
                  ? 'Start a conversation below'
                  : 'Connect a provider in Settings →'}
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
  container: { flex: 1, backgroundColor: '#FAFAF7' },
  messageList: { padding: 16, paddingBottom: 8 },
  empty: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 40,
    marginTop: 140,
  },
  emptyIcon: { fontSize: 32, color: '#D4C9A8', marginBottom: 16 },
  emptyTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#8C8577',
    marginBottom: 24,
  },
  emptyAction: {
    fontSize: 15,
    color: '#8B6914',
    fontWeight: '500',
  },
});
