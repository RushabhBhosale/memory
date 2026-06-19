import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const VAULT_PIN_KEY = 'vault_pin';
const VAULT_BIOMETRIC_KEY = 'vault_biometric_enabled';

export const getVaultPin = () => SecureStore.getItemAsync(VAULT_PIN_KEY);

export const saveVaultPin = (pin: string) => SecureStore.setItemAsync(VAULT_PIN_KEY, pin);

export const clearVaultPin = async () => {
  await SecureStore.deleteItemAsync(VAULT_PIN_KEY);
  await SecureStore.deleteItemAsync(VAULT_BIOMETRIC_KEY);
};

export const isBiometricEnabled = async () =>
  (await SecureStore.getItemAsync(VAULT_BIOMETRIC_KEY)) === 'true';

export const setBiometricEnabled = (enabled: boolean) =>
  SecureStore.setItemAsync(VAULT_BIOMETRIC_KEY, enabled ? 'true' : 'false');

export const canUseBiometrics = async () => {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const isEnrolled = await LocalAuthentication.isEnrolledAsync();

  return hasHardware && isEnrolled;
};

export const authenticateWithBiometrics = async () =>
  LocalAuthentication.authenticateAsync({
    promptMessage: 'Unlock Vault',
    cancelLabel: 'Cancel',
    fallbackLabel: 'Use PIN'
  });
