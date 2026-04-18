import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import Markdown from 'react-native-marked';
import type { ChatMessage } from '../lib/chat';

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 280,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  if (isUser) {
    return (
      <Animated.View
        style={[
          styles.userRow,
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
        ]}
      >
        <View style={styles.userBubble}>
          <Text style={styles.userText} selectable>
            {message.content}
          </Text>
        </View>
      </Animated.View>
    );
  }

  // Assistant message — editorial style, no bubble
  return (
    <Animated.View
      style={[
        styles.assistantRow,
        { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
      ]}
    >
      {message.isStreaming && !message.content ? (
        <TypingIndicator />
      ) : (
        <View style={styles.assistantContent}>
          <View style={styles.accentBar} />
          <View style={styles.markdownWrap}>
            <Markdown
              value={message.content || ' '}
              flatListProps={{
                scrollEnabled: false,
                style: { backgroundColor: 'transparent' },
              }}
              styles={{
                list: { paddingLeft: 4 },
                li: { fontSize: 16, lineHeight: 24 },
              }}
              theme={{
                colors: {
                  text: '#1A1A1A',
                  code: '#F0EDE8',
                  link: '#8B6914',
                  border: '#E8E4DD',
                  background: '#FAFAF7',
                },
              }}
            />
          </View>
        </View>
      )}
    </Animated.View>
  );
}

function TypingIndicator() {
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animate = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0.3, duration: 300, useNativeDriver: true }),
          Animated.delay(600 - delay),
        ]),
      );
    animate(dot1, 0).start();
    animate(dot2, 200).start();
    animate(dot3, 400).start();
  }, []);

  return (
    <View style={styles.typingRow}>
      {[dot1, dot2, dot3].map((dot, i) => (
        <Animated.View key={i} style={[styles.typingDot, { opacity: dot }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  userRow: {
    alignItems: 'flex-end',
    marginVertical: 4,
    paddingLeft: 48,
  },
  userBubble: {
    backgroundColor: '#2C2C2E',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 20,
    borderBottomRightRadius: 6,
    borderCurve: 'continuous',
  },
  userText: {
    color: '#FAFAF7',
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: -0.2,
  },
  assistantRow: {
    marginVertical: 6,
    paddingRight: 24,
  },
  assistantContent: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  accentBar: {
    width: 2.5,
    backgroundColor: '#D4C9A8',
    borderRadius: 2,
    marginRight: 14,
    marginVertical: 4,
  },
  markdownWrap: {
    flex: 1,
  },
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 12,
    paddingLeft: 16,
  },
  typingDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#A09882',
  },
});
