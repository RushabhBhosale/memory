import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "../context/AuthContext";
import { colors, subtleShadow } from "../styles/theme";

export default function LoginScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!username.trim() || !password) {
      setError("Enter your username and password.");
      return;
    }

    if (mode === "register" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      if (mode === "register") {
        await signUp(username, password);
      } else {
        await signIn(username, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to log in.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior="padding" style={styles.keyboard}>
        <View style={styles.card}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>₹</Text>
          </View>
          <Text style={styles.kicker}>Private finance</Text>
          <Text style={styles.title}>{mode === "login" ? "Welcome back" : "Create account"}</Text>
          <Text style={styles.subtitle}>
            {mode === "login"
              ? "Sign in to open your transactions and portfolio."
              : "Create a private account for your own transactions and investments."}
          </Text>

          <Text style={styles.label}>Username</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setUsername}
            placeholder="Username"
            placeholderTextColor={colors.textSoft}
            style={styles.input}
            value={username}
          />
          <Text style={styles.label}>Password</Text>
          <TextInput
            autoCapitalize="none"
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor={colors.textSoft}
            secureTextEntry
            style={styles.input}
            value={password}
          />

          {mode === "register" ? (
            <>
              <Text style={styles.label}>Confirm password</Text>
              <TextInput
                autoCapitalize="none"
                onChangeText={setConfirmPassword}
                placeholder="Confirm password"
                placeholderTextColor={colors.textSoft}
                secureTextEntry
                style={styles.input}
                value={confirmPassword}
              />
            </>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable disabled={loading} onPress={() => void submit()} style={styles.button}>
            {loading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.buttonText}>{mode === "login" ? "Log in" : "Create account"}</Text>
            )}
          </Pressable>
          <Pressable
            disabled={loading}
            onPress={() => {
              setError("");
              setConfirmPassword("");
              setMode((current) => current === "login" ? "register" : "login");
            }}
            style={styles.modeButton}
          >
            <Text style={styles.modeButtonText}>
              {mode === "login" ? "New here? Create an account" : "Already registered? Log in"}
            </Text>
          </Pressable>
          <Text style={styles.footnote}>Your session stays on this device until you log out.</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 10, justifyContent: "center", minHeight: 52, marginTop: 12 },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: "900" },
  card: { ...subtleShadow, backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 14, borderWidth: 1, padding: 24 },
  error: { color: colors.danger, fontSize: 13, fontWeight: "700", marginTop: 12 },
  footnote: { color: colors.textSoft, fontSize: 12, fontWeight: "600", marginTop: 16, textAlign: "center" },
  input: { backgroundColor: colors.backgroundSoft, borderColor: colors.border, borderRadius: 14, borderWidth: 1, color: colors.text, fontSize: 16, minHeight: 50, paddingHorizontal: 15 },
  keyboard: { flex: 1, justifyContent: "center", padding: 18 },
  label: { color: colors.text, fontSize: 13, fontWeight: "900", marginBottom: 7, marginTop: 16 },
  logo: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 16, height: 52, justifyContent: "center", marginBottom: 18, width: 52 },
  logoText: { color: colors.white, fontSize: 27, fontWeight: "900" },
  modeButton: { alignItems: "center", marginTop: 17, paddingVertical: 7 },
  modeButtonText: { color: colors.primary, fontSize: 13, fontWeight: "800" },
  screen: { backgroundColor: colors.background, flex: 1 },
  subtitle: { color: colors.textMuted, fontSize: 14, fontWeight: "600", lineHeight: 21, marginTop: 8 },
  title: { color: colors.text, fontSize: 31, fontWeight: "900", marginTop: 6 },
  kicker: { color: colors.primary, fontSize: 12, fontWeight: "900", letterSpacing: 0.8, textTransform: "uppercase" },
});
