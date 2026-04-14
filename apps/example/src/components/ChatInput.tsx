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
