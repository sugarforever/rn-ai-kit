import { View, Text, StyleSheet } from 'react-native';
import Markdown from 'react-native-marked';
import type { ChatMessage } from '../lib/chat';

export function MessageBubble({ message }: { message: ChatMessage }) {
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
});
