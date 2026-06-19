import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '../components/ScreenHeader';
import { colors, subtleShadow } from '../styles/theme';
import {
  canUseBiometrics,
  clearVaultPin,
  getVaultPin,
  isBiometricEnabled,
  saveVaultPin,
  setBiometricEnabled
} from '../utils/vaultSecurity';

export default function VaultSettingsScreen() {
  const [pinEnabled, setPinEnabled] = useState(false);
  const [biometricEnabled, setBiometricEnabledState] = useState(false);
  const [biometricsAvailable, setBiometricsAvailable] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');

  const loadSettings = useCallback(async () => {
    const [storedPin, biometricPref, biometricSupport] = await Promise.all([
      getVaultPin(),
      isBiometricEnabled(),
      canUseBiometrics()
    ]);

    const hasPin = Boolean(storedPin);
    setPinEnabled(hasPin);
    setBiometricEnabledState(hasPin && biometricPref && biometricSupport);
    setBiometricsAvailable(biometricSupport);
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const savePin = async () => {
    const normalizedPin = newPin.trim();

    if (!/^\d{4,8}$/.test(normalizedPin)) {
      setError('PIN must be 4 to 8 digits');
      return;
    }

    if (normalizedPin !== confirmPin.trim()) {
      setError('PIN confirmation does not match');
      return;
    }

    await saveVaultPin(normalizedPin);
    setPinEnabled(true);
    setError('');
    setNewPin('');
    setConfirmPin('');
    Alert.alert('Vault lock enabled', 'Your vault PIN has been saved.');
    await loadSettings();
  };

  const removePin = async () => {
    await clearVaultPin();
    setPinEnabled(false);
    setBiometricEnabledState(false);
    setError('');
    setNewPin('');
    setConfirmPin('');
    Alert.alert('Vault lock removed', 'PIN and biometric lock have been turned off.');
    await loadSettings();
  };

  const toggleBiometric = async (nextValue: boolean) => {
    if (!pinEnabled) {
      setError('Set a PIN before enabling biometric unlock');
      return;
    }

    if (!biometricsAvailable) {
      setError('Biometric unlock is not available on this device');
      return;
    }

    setError('');
    await setBiometricEnabled(nextValue);
    setBiometricEnabledState(nextValue);
  };

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader mode="back" title="Vault Settings" />

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Lock settings</Text>
          <Text style={styles.panelMeta}>Manage the PIN and biometric unlock for your vault.</Text>

          <Text style={styles.label}>{pinEnabled ? 'Change PIN' : 'Set PIN'}</Text>
          <TextInput
            value={newPin}
            onChangeText={setNewPin}
            keyboardType="number-pad"
            placeholder="New PIN"
            placeholderTextColor={colors.textSoft}
            secureTextEntry
            style={styles.input}
          />
          <TextInput
            value={confirmPin}
            onChangeText={setConfirmPin}
            keyboardType="number-pad"
            placeholder="Confirm PIN"
            placeholderTextColor={colors.textSoft}
            secureTextEntry
            style={styles.input}
          />

          <View style={styles.actionRow}>
            <Pressable style={styles.primaryButton} onPress={() => void savePin()}>
              <Text style={styles.primaryButtonText}>{pinEnabled ? 'Update PIN' : 'Save PIN'}</Text>
            </Pressable>
            {pinEnabled ? (
              <Pressable style={styles.secondaryButton} onPress={() => void removePin()}>
                <Text style={styles.secondaryButtonText}>Remove</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.toggleRow}>
            <View style={styles.toggleCopy}>
              <Text style={styles.toggleTitle}>Biometric unlock</Text>
              <Text style={styles.toggleMeta}>
                {biometricsAvailable
                  ? 'Automatically try Face ID or fingerprint before showing PIN fallback.'
                  : 'Biometric unlock is not available on this device.'}
              </Text>
            </View>
            <Switch
              onValueChange={(value) => void toggleBiometric(value)}
              value={biometricEnabled}
              trackColor={{ false: colors.borderStrong, true: `${colors.primary}55` }}
              thumbColor={biometricEnabled ? colors.primary : colors.white}
            />
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
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
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    ...subtleShadow
  },
  panelTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4
  },
  panelMeta: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 18
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
    marginBottom: 14,
    paddingHorizontal: 14,
    paddingVertical: 13
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.black,
    borderRadius: 10,
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 12
  },
  primaryButtonText: {
    color: colors.white,
    fontWeight: '800'
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: colors.dangerSurface,
    borderRadius: 10,
    justifyContent: 'center',
    minWidth: 96,
    paddingHorizontal: 12,
    paddingVertical: 12
  },
  secondaryButtonText: {
    color: colors.danger,
    fontWeight: '800'
  },
  toggleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  toggleCopy: {
    flex: 1,
    paddingRight: 16
  },
  toggleTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700'
  },
  toggleMeta: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4
  },
  errorText: {
    color: colors.danger,
    marginTop: 16
  }
});
