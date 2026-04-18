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
        return new Promise((resolve) => {
          Alert.prompt(
            'Paste Authorization',
            'After signing in, the browser may show an error page. Copy the full URL from the address bar and paste it here.',
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
      <Text style={styles.sectionTitle}>PROVIDERS</Text>

      {providers.map((p) => {
        const connected = connectedIds.has(p.id);
        return (
          <View key={p.id} style={styles.providerRow}>
            <View style={styles.providerHeader}>
              <View style={styles.providerInfo}>
                <Text style={styles.providerName}>{p.name}</Text>
                <View style={styles.statusRow}>
                  <View style={[styles.statusDot, connected && styles.statusDotActive]} />
                  <Text style={[styles.statusText, connected && styles.statusTextActive]}>
                    {connected ? 'Connected' : 'Not connected'}
                  </Text>
                </View>
              </View>
              <View style={styles.actions}>
                {connected ? (
                  <TouchableOpacity
                    style={styles.disconnectButton}
                    onPress={() => handleLogout(p.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.disconnectText}>Disconnect</Text>
                  </TouchableOpacity>
                ) : (
                  <>
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => handleLogin(p.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.actionText}>Sign In</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionButtonSecondary}
                      onPress={() => setShowKeyInput(showKeyInput === p.id ? null : p.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.actionTextSecondary}>API Key</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
            {showKeyInput === p.id && (
              <View style={styles.keyRow}>
                <TextInput
                  style={styles.keyInput}
                  value={apiKeyInputs[p.id] ?? ''}
                  onChangeText={(t) => setApiKeyInputs((prev) => ({ ...prev, [p.id]: t }))}
                  placeholder="Paste API key..."
                  placeholderTextColor="#A09882"
                  secureTextEntry
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  style={styles.saveButton}
                  onPress={() => handleSaveKey(p.id)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.saveText}>Save</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        );
      })}

      <Text style={[styles.sectionTitle, { marginTop: 36 }]}>CUSTOM PROVIDER</Text>
      <Text style={styles.hint}>For providers not listed above</Text>
      <View style={styles.customRow}>
        <TextInput
          style={styles.keyInput}
          value={apiKeyInputs['custom'] ?? ''}
          onChangeText={(t) => setApiKeyInputs((prev) => ({ ...prev, custom: t }))}
          placeholder="Provider ID (e.g. groq)"
          placeholderTextColor="#A09882"
          autoCapitalize="none"
        />
      </View>
      <View style={styles.keyRow}>
        <TextInput
          style={styles.keyInput}
          value={apiKeyInputs['custom-key'] ?? ''}
          onChangeText={(t) => setApiKeyInputs((prev) => ({ ...prev, 'custom-key': t }))}
          placeholder="API key..."
          placeholderTextColor="#A09882"
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
          activeOpacity={0.7}
        >
          <Text style={styles.saveText}>Save</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAF7' },
  content: { padding: 20, paddingBottom: 40 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#A09882',
    letterSpacing: 1,
    marginBottom: 12,
  },
  hint: {
    fontSize: 14,
    color: '#A09882',
    marginBottom: 12,
    letterSpacing: -0.2,
  },
  providerRow: {
    backgroundColor: '#F0EDE8',
    borderRadius: 14,
    borderCurve: 'continuous',
    padding: 16,
    marginBottom: 8,
  },
  providerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  providerInfo: {
    flex: 1,
  },
  providerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    letterSpacing: -0.3,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#C8C2B6',
    marginRight: 6,
  },
  statusDotActive: {
    backgroundColor: '#5C9E5C',
  },
  statusText: {
    fontSize: 13,
    color: '#A09882',
    letterSpacing: -0.2,
  },
  statusTextActive: {
    color: '#5C9E5C',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: '#2C2C2E',
    borderRadius: 10,
    borderCurve: 'continuous',
  },
  actionText: {
    fontSize: 13,
    color: '#FAFAF7',
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  actionButtonSecondary: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: '#E4E0D9',
    borderRadius: 10,
    borderCurve: 'continuous',
  },
  actionTextSecondary: {
    fontSize: 13,
    color: '#4A4640',
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  disconnectButton: {
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  disconnectText: {
    fontSize: 13,
    color: '#C0564E',
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  keyRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  customRow: {
    marginBottom: 8,
  },
  keyInput: {
    flex: 1,
    fontSize: 14,
    letterSpacing: -0.2,
    color: '#1A1A1A',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#F0EDE8',
    borderRadius: 10,
    borderCurve: 'continuous',
  },
  saveButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#2C2C2E',
    borderRadius: 10,
    borderCurve: 'continuous',
  },
  saveText: {
    fontSize: 14,
    color: '#FAFAF7',
    fontWeight: '600',
    letterSpacing: -0.2,
  },
});
