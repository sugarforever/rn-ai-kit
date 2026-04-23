import { useEffect, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SessionStoreProvider } from '@rn-ai-kit/sessions';
import { sessionStore, initSessionStore } from '../lib/sessionStore';

export default function RootLayout() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    initSessionStore().then(() => setReady(true));
  }, []);

  if (!ready) return null;

  return (
    <SessionStoreProvider store={sessionStore}>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#FAFAF7' },
          headerShadowVisible: false,
          headerTintColor: '#1A1A1A',
          headerTitleStyle: {
            fontWeight: '600',
            fontSize: 17,
            color: '#1A1A1A',
          },
          contentStyle: { backgroundColor: '#FAFAF7' },
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            title: 'RN AI Kit',
            headerRight: () => (
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity onPress={() => router.push('/sessions')} hitSlop={8}>
                  <Ionicons name="list-outline" size={22} color="#8C8577" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => router.push('/settings')} hitSlop={8}>
                  <Ionicons name="ellipsis-horizontal" size={22} color="#8C8577" />
                </TouchableOpacity>
              </View>
            ),
          }}
        />
        <Stack.Screen
          name="sessions"
          options={{
            title: 'Sessions',
            headerBackTitle: 'Chat',
          }}
        />
        <Stack.Screen
          name="settings"
          options={{
            title: 'Settings',
            headerBackTitle: 'Chat',
          }}
        />
      </Stack>
    </SessionStoreProvider>
  );
}
