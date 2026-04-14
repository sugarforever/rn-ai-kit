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
