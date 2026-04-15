import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert,
} from 'react-native';
import { authManager } from '../lib/auth';

export default function SettingsScreen() {
  const providers = authManager.listProviders();
  const [connectedIds, setConnectedIds] = useState<Set<string>>(new Set());
  const [apiKeyInputs, setApiKeyInputs] = useState<Record<string, string>>({});
  const [showKeyInput, setShowKeyInput] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    const connected = new Set<string>();
    for (const p of providers) {
      const key = await authManager.getApiKey(p.id);
      if (key) connected.add(p.id);
    }
    setConnectedIds(connected);
  }, []);

  useEffect(() => { refreshStatus(); }, [refreshStatus]);

  const handleLogin = async (providerId: string) => {
    try {
      const success = await authManager.login(providerId, () => {
        // Prompt user to paste the redirect URL or authorization code
        return new Promise((resolve) => {
          Alert.prompt(
            'Paste Authorization',
            'After signing in, the browser may show an error page. ' +
            'Copy the full URL from the address bar and paste it here.',
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
              { text: 'Submit', onPress: (text) => resolve(text ?? null) },
            ],
            'plain-text',
          );
        });
      });
      if (success) refreshStatus();
    } catch (e: any) {
      Alert.alert('Login failed', e.message);
    }
  };

  const handleLogout = async (providerId: string) => {
    await authManager.logout(providerId);
    refreshStatus();
  };

  const handleSaveKey = async (providerId: string) => {
    const key = apiKeyInputs[providerId]?.trim();
    if (!key) return;
    await authManager.setApiKey(providerId, key);
    setApiKeyInputs((prev) => ({ ...prev, [providerId]: '' }));
    setShowKeyInput(null);
    refreshStatus();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>AI PROVIDERS</Text>
      <Text style={styles.hint}>Sign in with OAuth or paste an API key.</Text>

      {providers.map((p) => {
        const connected = connectedIds.has(p.id);
        return (
          <View key={p.id} style={styles.providerRow}>
            <View style={styles.providerInfo}>
              <Text style={styles.providerName}>{p.name}</Text>
              <Text style={[styles.status, connected && styles.connected]}>
                {connected ? 'Connected' : 'Not connected'}
              </Text>
            </View>
            <View style={styles.actions}>
              {connected ? (
                <TouchableOpacity onPress={() => handleLogout(p.id)}>
                  <Text style={styles.disconnectText}>Disconnect</Text>
                </TouchableOpacity>
              ) : (
                <>
                  <TouchableOpacity style={styles.button} onPress={() => handleLogin(p.id)}>
                    <Text style={styles.buttonText}>Sign In</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.button} onPress={() => setShowKeyInput(showKeyInput === p.id ? null : p.id)}>
                    <Text style={styles.buttonText}>API Key</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
            {showKeyInput === p.id && (
              <View style={styles.keyRow}>
                <TextInput
                  style={styles.keyInput}
                  value={apiKeyInputs[p.id] ?? ''}
                  onChangeText={(t) => setApiKeyInputs((prev) => ({ ...prev, [p.id]: t }))}
                  placeholder="Paste API key..."
                  secureTextEntry
                  autoCapitalize="none"
                />
                <TouchableOpacity style={styles.saveButton} onPress={() => handleSaveKey(p.id)}>
                  <Text style={styles.saveText}>Save</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        );
      })}

      <Text style={[styles.sectionTitle, { marginTop: 32 }]}>RAW API KEY</Text>
      <Text style={styles.hint}>For providers not listed above (Groq, Together, Ollama, etc.)</Text>
      <View style={styles.keyRow}>
        <TextInput
          style={styles.keyInput}
          value={apiKeyInputs['custom'] ?? ''}
          onChangeText={(t) => setApiKeyInputs((prev) => ({ ...prev, custom: t }))}
          placeholder="Provider ID (e.g. groq)"
          autoCapitalize="none"
        />
      </View>
      <View style={styles.keyRow}>
        <TextInput
          style={styles.keyInput}
          value={apiKeyInputs['custom-key'] ?? ''}
          onChangeText={(t) => setApiKeyInputs((prev) => ({ ...prev, 'custom-key': t }))}
          placeholder="API key..."
          secureTextEntry
          autoCapitalize="none"
        />
        <TouchableOpacity
          style={styles.saveButton}
          onPress={async () => {
            const id = apiKeyInputs['custom']?.trim();
            const key = apiKeyInputs['custom-key']?.trim();
            if (!id || !key) return;
            await authManager.setApiKey(id, key);
            setApiKeyInputs((prev) => ({ ...prev, custom: '', 'custom-key': '' }));
            Alert.alert('Saved', `API key stored for "${id}"`);
          }}
        >
          <Text style={styles.saveText}>Save</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, paddingBottom: 40 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: '#888', letterSpacing: 0.5, marginBottom: 4 },
  hint: { fontSize: 14, color: '#aaa', marginBottom: 16 },
  providerRow: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e0e0e0' },
  providerInfo: { marginBottom: 8 },
  providerName: { fontSize: 16, fontWeight: '500' },
  status: { fontSize: 13, color: '#aaa', marginTop: 2 },
  connected: { color: '#34c759' },
  actions: { flexDirection: 'row', gap: 10 },
  button: { paddingHorizontal: 14, paddingVertical: 6, backgroundColor: '#f0f0f0', borderRadius: 8 },
  buttonText: { fontSize: 14, color: '#007aff', fontWeight: '500' },
  disconnectText: { fontSize: 14, color: '#ff3b30', fontWeight: '500' },
  keyRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  keyInput: { flex: 1, fontSize: 14, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#f5f5f5', borderRadius: 8 },
  saveButton: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#007aff', borderRadius: 8 },
  saveText: { fontSize: 14, color: '#fff', fontWeight: '500' },
});
