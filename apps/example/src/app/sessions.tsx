import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useSessions } from '@rn-ai-kit/sessions';

export default function SessionsScreen() {
  const router = useRouter();
  const { sessions, isLoading, createSession, deleteSession, renameSession } = useSessions();

  const handleNewChat = async () => {
    const s = await createSession();
    router.replace({ pathname: '/', params: { sessionId: s.id } });
  };

  const handleOpen = (id: string) => {
    router.push({ pathname: '/', params: { sessionId: id } });
  };

  const handleLongPress = (id: string, currentTitle: string) => {
    Alert.prompt(
      'Rename session',
      undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Rename',
          onPress: (value) => {
            if (value && value.trim()) renameSession(id, value.trim());
          },
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteSession(id),
        },
      ],
      'plain-text',
      currentTitle,
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Pressable style={styles.newButton} onPress={handleNewChat}>
        <Text style={styles.newButtonText}>+ New chat</Text>
      </Pressable>

      {isLoading ? (
        <Text style={styles.muted}>Loading…</Text>
      ) : sessions.length === 0 ? (
        <Text style={styles.muted}>No sessions yet.</Text>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(s) => s.id}
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => handleOpen(item.id)}
              onLongPress={() => handleLongPress(item.id, item.title)}
            >
              <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
              <Text style={styles.subtitle}>
                {new Date(item.updatedAt).toLocaleString()}
              </Text>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAF7', padding: 16 },
  newButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#2C2C2E',
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  newButtonText: { color: '#FAFAF7', fontSize: 15, fontWeight: '600' },
  muted: { color: '#8C8577', textAlign: 'center', marginTop: 40 },
  row: {
    paddingVertical: 12,
    borderBottomColor: '#EDE8DC',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1A1A1A',
  },
  subtitle: {
    fontSize: 12,
    color: '#8C8577',
    marginTop: 4,
  },
});
