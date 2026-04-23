import { useState, useRef, useEffect } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Image,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

export interface PickedAttachment {
  uri: string;
  base64: string;
  mimeType: string;
}

interface Props {
  onSend: (text: string, attachment?: PickedAttachment) => void;
  disabled?: boolean;
}

function inferMimeType(asset: ImagePicker.ImagePickerAsset): string {
  if (asset.mimeType) return asset.mimeType;
  const uri = asset.uri.toLowerCase();
  if (uri.endsWith('.jpg') || uri.endsWith('.jpeg')) return 'image/jpeg';
  if (uri.endsWith('.webp')) return 'image/webp';
  if (uri.endsWith('.gif')) return 'image/gif';
  return 'image/png';
}

export function ChatInput({ onSend, disabled }: Props) {
  const [text, setText] = useState('');
  const [attachment, setAttachment] = useState<PickedAttachment | null>(null);
  const buttonScale = useRef(new Animated.Value(0)).current;
  const hasContent = text.trim().length > 0 || attachment !== null;

  useEffect(() => {
    Animated.spring(buttonScale, {
      toValue: hasContent && !disabled ? 1 : 0,
      friction: 8,
      tension: 100,
      useNativeDriver: true,
    }).start();
  }, [hasContent, disabled]);

  const handleSend = () => {
    const trimmed = text.trim();
    if ((!trimmed && !attachment) || disabled) return;
    onSend(trimmed, attachment ?? undefined);
    setText('');
    setAttachment(null);
  };

  const handlePickImage = async () => {
    if (disabled) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photo access needed', 'Enable photo library access in Settings to attach images.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]?.base64) return;
    const asset = result.assets[0];
    setAttachment({
      uri: asset.uri,
      base64: asset.base64 as string,
      mimeType: inferMimeType(asset),
    });
  };

  return (
    <View style={styles.container}>
      {attachment && (
        <View style={styles.previewRow}>
          <View style={styles.previewChip}>
            <Image source={{ uri: attachment.uri }} style={styles.previewImage} />
            <TouchableOpacity
              style={styles.previewRemove}
              onPress={() => setAttachment(null)}
              hitSlop={8}
            >
              <Ionicons name="close" size={14} color="#FAFAF7" />
            </TouchableOpacity>
          </View>
        </View>
      )}
      <View style={styles.inputRow}>
        <TouchableOpacity
          style={styles.attachButton}
          onPress={handlePickImage}
          disabled={disabled}
          hitSlop={6}
        >
          <Ionicons name="image-outline" size={20} color={disabled ? '#C7BFA8' : '#8C8577'} />
        </TouchableOpacity>
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
            disabled={!hasContent || disabled}
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
  previewRow: {
    flexDirection: 'row',
    marginBottom: 8,
    paddingLeft: 4,
  },
  previewChip: {
    position: 'relative',
  },
  previewImage: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: '#EDE8DC',
  },
  previewRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#F0EDE8',
    borderRadius: 24,
    borderCurve: 'continuous',
    paddingLeft: 8,
    paddingRight: 6,
    paddingVertical: 6,
    minHeight: 44,
  },
  attachButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
    marginRight: 2,
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
