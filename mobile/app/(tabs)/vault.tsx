import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { listMemories, type Memory } from '../../services/api';
import { colors, subtleShadow } from '../../styles/theme';
import { isVaultMemory, maskPassword, parseCredentialContent } from '../../utils/credentialVault';
import {
  authenticateWithBiometrics,
  canUseBiometrics,
  getVaultPin,
  isBiometricEnabled,
} from '../../utils/vaultSecurity';

const formatDate = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric'
  }).format(new Date(value));

export default function VaultScreen() {
  const [entries, setEntries] = useState<Memory[]>([]);
  const [revealedIds, setRevealedIds] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [biometricEnabled, setBiometricEnabledState] = useState(false);
  const [pinEnabled, setPinEnabled] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [unlockPin, setUnlockPin] = useState('');
  const [showUnlockPin, setShowUnlockPin] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [biometricAttemptFailed, setBiometricAttemptFailed] = useState(false);

  const loadEntries = useCallback(async (options?: { refreshing?: boolean }) => {
    try {
      if (options?.refreshing) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError('');

      const memories = await listMemories();
      setEntries(memories.filter(isVaultMemory));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load vault');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadLockState = useCallback(async () => {
    const [storedPin, biometricPref, biometricSupport] = await Promise.all([
      getVaultPin(),
      isBiometricEnabled(),
      canUseBiometrics()
    ]);

    const hasPin = Boolean(storedPin);
    setPinEnabled(hasPin);
    setBiometricEnabledState(hasPin && biometricPref && biometricSupport);
    setIsLocked(hasPin || (biometricPref && biometricSupport));
    return {
      hasPin,
      biometricEnabled: hasPin && biometricPref && biometricSupport
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        const [, lockState] = await Promise.all([loadEntries(), loadLockState()]);
        setBiometricAttemptFailed(false);
        setShowUnlockPin(false);

        if (lockState.biometricEnabled) {
          await unlockWithBiometrics(true);
        }
      })();
    }, [loadEntries, loadLockState])
  );

  useEffect(() => {
    if (!isLocked) {
      setBiometricAttemptFailed(false);
      setShowUnlockPin(false);
    }
  }, [isLocked]);

  const sortedEntries = useMemo(
    () =>
      [...entries].sort(
        (left, right) =>
          new Date(right.updatedAt || right.createdAt).getTime() -
          new Date(left.updatedAt || left.createdAt).getTime()
      ),
    [entries]
  );

  const toggleReveal = (id: string) => {
    setRevealedIds((current) => ({
      ...current,
      [id]: !current[id]
    }));
  };

  const unlockWithPin = async () => {
    const storedPin = await getVaultPin();

    if (!storedPin || unlockPin.trim() !== storedPin) {
      setError('Incorrect vault PIN');
      return;
    }

    setError('');
    setUnlockPin('');
    setIsLocked(false);
  };

  const unlockWithBiometrics = async (automatic = false) => {
    try {
      setAuthBusy(true);
      const result = await authenticateWithBiometrics();

      if (result.success) {
        setError('');
        setIsLocked(false);
        setBiometricAttemptFailed(false);
      } else {
        if (!automatic && result.error !== 'user_cancel') {
          setError('Biometric unlock failed');
        }

        setBiometricAttemptFailed(true);
      }
    } finally {
      setAuthBusy(false);
    }
  };

  const renderVaultList = () => (
    <>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Vault</Text>
          <Text style={styles.subtitle}>Passwords, PINs, and private codes.</Text>
        </View>
        <Pressable style={styles.addButton} onPress={() => router.push('/vault-add')}>
          <Ionicons color={colors.white} name="add" size={20} />
        </Pressable>
      </View>

      <Pressable style={styles.settingsLinkRow} onPress={() => router.push('/vault-settings')}>
        <Text style={styles.settingsLinkText}>Change vault settings</Text>
        <Ionicons color={colors.textSoft} name="chevron-forward" size={16} />
      </Pressable>

      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>Saved passwords</Text>
        <Text style={styles.sectionCount}>{sortedEntries.length}</Text>
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.centerText}>Loading vault...</Text>
        </View>
      ) : sortedEntries.length ? (
        sortedEntries.map((entry) => {
          const parsed = parseCredentialContent(entry.content || '');
          const isRevealed = Boolean(revealedIds[entry._id]);

          return (
              <View key={entry._id} style={styles.entryCard}>
                <View style={styles.entryTopRow}>
                  <View>
                    <Text style={styles.entryTitle}>{entry.title}</Text>
                    <Text style={styles.entryDate}>Updated {formatDate(entry.updatedAt)}</Text>
                </View>

                <Pressable style={styles.eyeButton} onPress={() => toggleReveal(entry._id)}>
                  <Ionicons
                    color={colors.textMuted}
                    name={isRevealed ? 'eye-off-outline' : 'eye-outline'}
                    size={18}
                  />
                </Pressable>
              </View>

              {parsed.usernameOrEmail ? (
                <View style={styles.entryField}>
                  <Text style={styles.entryLabel}>Username / Email</Text>
                  <Text style={styles.entryValue}>{parsed.usernameOrEmail}</Text>
                </View>
              ) : null}

              {parsed.password ? (
                <View style={styles.entryField}>
                  <Text style={styles.entryLabel}>Password / PIN</Text>
                  <Text style={styles.entryValue}>
                    {isRevealed ? parsed.password : maskPassword(parsed.password)}
                  </Text>
                </View>
              ) : null}
            </View>
          );
        })
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No passwords saved yet</Text>
          <Text style={styles.emptyText}>Tap the + button to add your first vault entry.</Text>
        </View>
      )}
    </>
  );

  const renderLockedView = () => (
    <View style={styles.lockedPanel}>
      <View style={styles.lockedIcon}>
        <Ionicons color={colors.primary} name="lock-closed" size={22} />
      </View>
      <Text style={styles.lockedTitle}>Vault Locked</Text>
      <Text style={styles.lockedText}>
        {authBusy
          ? 'Trying biometric unlock...'
          : biometricAttemptFailed
            ? 'Biometric unlock did not go through. Use PIN or try again.'
            : 'Unlock your vault to view saved passwords.'}
      </Text>

      {biometricEnabled && biometricAttemptFailed ? (
        <Pressable
          disabled={authBusy}
          style={[styles.primaryWideButton, authBusy && styles.disabledButton]}
          onPress={() => void unlockWithBiometrics(false)}
        >
          {authBusy ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <>
              <Ionicons color={colors.white} name="scan-outline" size={18} />
              <Text style={styles.primaryWideButtonText}>Try biometrics again</Text>
            </>
          )}
        </Pressable>
      ) : null}

      {(pinEnabled || biometricAttemptFailed) ? (
        <Pressable style={styles.secondaryWideButton} onPress={() => setShowUnlockPin((value) => !value)}>
        <Text style={styles.secondaryWideButtonText}>{showUnlockPin ? 'Hide PIN' : 'Use PIN'}</Text>
        </Pressable>
      ) : null}

      {showUnlockPin ? (
        <View style={styles.unlockBox}>
          <TextInput
            value={unlockPin}
            onChangeText={setUnlockPin}
            keyboardType="number-pad"
            placeholder="Enter vault PIN"
            placeholderTextColor={colors.textSoft}
            secureTextEntry
            style={styles.input}
          />
          <Pressable style={styles.primaryAction} onPress={() => void unlockWithPin()}>
            <Text style={styles.primaryActionText}>Unlock Vault</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.primary}
            colors={[colors.primary]}
            onRefresh={() => loadEntries({ refreshing: true })}
          />
        }
      >
        {isLocked ? renderLockedView() : renderVaultList()}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
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
    paddingBottom: 118
  },
  headerRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 22
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '600',
    lineHeight: 36
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
    marginTop: 4
  },
  addButton: {
    alignItems: 'center',
    backgroundColor: colors.black,
    borderRadius: 999,
    height: 42,
    justifyContent: 'center',
    width: 42
  },
  settingsLinkRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20
  },
  settingsLinkText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700'
  },
  primaryAction: {
    alignItems: 'center',
    backgroundColor: colors.black,
    borderRadius: 10,
    justifyContent: 'center',
    paddingVertical: 12
  },
  primaryActionText: {
    color: colors.white,
    fontWeight: '800'
  },
  sectionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800'
  },
  sectionCount: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '800'
  },
  centerState: {
    alignItems: 'center',
    gap: 10,
    justifyContent: 'center',
    minHeight: 180
  },
  centerText: {
    color: colors.textMuted
  },
  entryCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
    padding: 16,
    ...subtleShadow
  },
  entryTopRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16
  },
  entryTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 4
  },
  entryDate: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: '700'
  },
  eyeButton: {
    alignItems: 'center',
    backgroundColor: colors.backgroundSoft,
    borderRadius: 999,
    height: 34,
    justifyContent: 'center',
    width: 34
  },
  entryField: {
    marginBottom: 12
  },
  entryLabel: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 5
  },
  entryValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    padding: 18,
    ...subtleShadow
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20
  },
  lockedPanel: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 24,
    padding: 22,
    ...subtleShadow
  },
  lockedIcon: {
    alignItems: 'center',
    backgroundColor: colors.accentSurface,
    borderRadius: 999,
    height: 48,
    justifyContent: 'center',
    marginBottom: 16,
    width: 48
  },
  lockedTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 8
  },
  lockedText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 18,
    textAlign: 'center'
  },
  primaryWideButton: {
    alignItems: 'center',
    backgroundColor: colors.black,
    borderRadius: 12,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginBottom: 12,
    paddingVertical: 14,
    width: '100%'
  },
  primaryWideButtonText: {
    color: colors.white,
    fontWeight: '800'
  },
  secondaryWideButton: {
    alignItems: 'center',
    backgroundColor: colors.backgroundSoft,
    borderRadius: 12,
    justifyContent: 'center',
    marginBottom: 14,
    paddingVertical: 14,
    width: '100%'
  },
  secondaryWideButtonText: {
    color: colors.text,
    fontWeight: '700'
  },
  unlockBox: {
    marginTop: 4,
    width: '100%'
  },
  input: {
    backgroundColor: colors.backgroundSoft,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    color: colors.text,
    fontSize: 15,
    marginBottom: 14,
    paddingHorizontal: 14,
    paddingVertical: 13
  },
  errorText: {
    color: colors.danger,
    marginTop: 10,
    textAlign: 'center'
  },
  disabledButton: {
    opacity: 0.7
  }
});
