import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '../components/ScreenHeader';
import { createMemory } from '../services/api';
import { colors, subtleShadow } from '../styles/theme';
import { buildCredentialContent } from '../utils/credentialVault';

export default function VaultAddScreen() {
  const [name, setName] = useState('');
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showTypedPassword, setShowTypedPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const saveEntry = async () => {
    const trimmedName = name.trim();
    const trimmedUsernameOrEmail = usernameOrEmail.trim();
    const trimmedPassword = password.trim();

    if (!trimmedName || !trimmedPassword) {
      setError('Name and password or PIN are required');
      return;
    }

    try {
      setSaving(true);
      setError('');

      await createMemory({
        title: trimmedName,
        content: buildCredentialContent(trimmedUsernameOrEmail, trimmedPassword),
        category: 'vault',
        tags: ['vault'],
        kind: 'credential',
        importance: 5
      });

      Alert.alert('Saved', 'Password added to your vault.', [
        {
          text: 'OK',
          onPress: () => router.back()
        }
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader mode="back" title="Add Password" />

        <View style={styles.formPanel}>
          <View style={styles.formHeader}>
            <View style={styles.formIcon}>
              <Ionicons color={colors.success} name="key-outline" size={18} />
            </View>
            <View style={styles.formCopy}>
              <Text style={styles.formTitle}>New vault entry</Text>
              <Text style={styles.formMeta}>
                Save passwords, card PINs, and other private codes.
              </Text>
            </View>
          </View>

          <Text style={styles.label}>Name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Netflix, ATM Card, WiFi..."
            placeholderTextColor={colors.textSoft}
            style={styles.input}
          />

          <Text style={styles.label}>Username / Email (optional)</Text>
          <TextInput
            value={usernameOrEmail}
            onChangeText={setUsernameOrEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="name@example.com"
            placeholderTextColor={colors.textSoft}
            style={styles.input}
          />

          <Text style={styles.label}>Password / PIN</Text>
          <View style={styles.passwordField}>
            <TextInput
              value={password}
              onChangeText={setPassword}
              autoCapitalize="none"
              placeholder="Enter password or PIN"
              placeholderTextColor={colors.textSoft}
              secureTextEntry={!showTypedPassword}
              style={styles.passwordInput}
            />
            <Pressable
              accessibilityRole="button"
              style={styles.passwordEyeButton}
              onPress={() => setShowTypedPassword((current) => !current)}
            >
              <Ionicons
                color={colors.textMuted}
                name={showTypedPassword ? 'eye-off-outline' : 'eye-outline'}
                size={18}
              />
            </Pressable>
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Pressable
            disabled={saving}
            onPress={saveEntry}
            style={[styles.primaryButton, saving && styles.disabledButton]}
          >
            {saving ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <>
                <Text style={styles.primaryButtonText}>Save to vault</Text>
                <Ionicons color={colors.white} name="arrow-forward" size={16} />
              </>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background
  },
  content: {
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 36
  },
  formPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    ...subtleShadow
  },
  formHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20
  },
  formIcon: {
    alignItems: 'center',
    backgroundColor: colors.successSurface,
    borderRadius: 999,
    height: 40,
    justifyContent: 'center',
    width: 40
  },
  formCopy: {
    flex: 1
  },
  formTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 2
  },
  formMeta: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18
  },
  label: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8
  },
  input: {
    backgroundColor: colors.backgroundSoft,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    color: colors.text,
    fontSize: 15,
    marginBottom: 16,
    paddingHorizontal: 14,
    paddingVertical: 13
  },
  passwordField: {
    alignItems: 'center',
    backgroundColor: colors.backgroundSoft,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 16,
    paddingLeft: 14,
    paddingRight: 8
  },
  passwordInput: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    paddingVertical: 13
  },
  passwordEyeButton: {
    alignItems: 'center',
    borderRadius: 999,
    height: 36,
    justifyContent: 'center',
    width: 36
  },
  errorText: {
    color: colors.danger,
    marginBottom: 14
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.black,
    borderRadius: 12,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    paddingVertical: 14
  },
  disabledButton: {
    opacity: 0.7
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '800'
  }
});
