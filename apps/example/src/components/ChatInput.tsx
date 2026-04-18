import { useState, useRef, useEffect } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: Props) {
  const [text, setText] = useState('');
  const buttonScale = useRef(new Animated.Value(0)).current;
  const hasText = text.trim().length > 0;

  useEffect(() => {
    Animated.spring(buttonScale, {
      toValue: hasText && !disabled ? 1 : 0,
      friction: 8,
      tension: 100,
      useNativeDriver: true,
    }).start();
  }, [hasText, disabled]);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
  };

  return (
    <View style={styles.container}>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Ask anything..."
          placeholderTextColor="#A09882"
          multiline
          maxLength={4000}
          editable={!disabled}
        />
        <Animated.View
          style={[
            styles.sendWrap,
            {
              transform: [{ scale: buttonScale }],
              opacity: buttonScale,
            },
          ]}
        >
          <TouchableOpacity
            style={styles.sendButton}
            onPress={handleSend}
            disabled={!hasText || disabled}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-up" size={18} color="#FAFAF7" />
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    paddingBottom: 4,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#F0EDE8',
    borderRadius: 24,
    borderCurve: 'continuous',
    paddingLeft: 18,
    paddingRight: 6,
    paddingVertical: 6,
    minHeight: 44,
  },
  input: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: -0.2,
    color: '#1A1A1A',
    maxHeight: 120,
    paddingVertical: 6,
  },
  sendWrap: {
    marginLeft: 6,
    marginBottom: 2,
  },
  sendButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
