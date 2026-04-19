import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function RootLayout() {
  const router = useRouter();

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#FAFAF7' },
          headerShadowVisible: false,
          headerTintColor: '#1A1A1A',
          headerTitleStyle: {
            fontWeight: '600',
            fontSize: 17,
            letterSpacing: -0.4,
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
              <TouchableOpacity
                onPress={() => router.push('/settings')}
                hitSlop={8}
              >
                <Ionicons name="ellipsis-horizontal" size={22} color="#8C8577" />
              </TouchableOpacity>
            ),
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
    </>
  );
}
