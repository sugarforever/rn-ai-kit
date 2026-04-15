import { View, Text, StyleSheet } from 'react-native';
import Markdown from 'react-native-marked';
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
        <Markdown
          value={message.content || ' '}
          flatListProps={{ scrollEnabled: false }}
          theme={{
            colors: { text: '#000', code: '#e8e8e8', link: '#007aff' },
          }}
        />
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
