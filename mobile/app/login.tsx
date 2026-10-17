import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button, Segmented } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { colors, radius, type } from "../styles/theme";

type Mode = "login" | "register";

export default function LoginScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError("");
    setConfirmPassword("");
  };

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
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboard}>
        <View style={styles.brand}>
          <View style={styles.logo}>
            <Ionicons color={colors.white} name="wallet" size={26} />
          </View>
          <Text style={styles.title}>{mode === "login" ? "Welcome back" : "Create your account"}</Text>
          <Text style={styles.subtitle}>Track spending, income and investments in one place.</Text>
        </View>

        <Segmented
          onChange={switchMode}
          options={[
            { label: "Log in", value: "login" },
            { label: "Sign up", value: "register" },
          ]}
          value={mode}
        />

        <View style={styles.group}>
          <View style={[styles.field, styles.divider]}>
            <Ionicons color={colors.textSoft} name="person-outline" size={18} />
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setUsername}
              placeholder="Username"
              placeholderTextColor={colors.textSoft}
              style={styles.input}
              value={username}
            />
          </View>
          <View style={[styles.field, mode === "register" && styles.divider]}>
            <Ionicons color={colors.textSoft} name="lock-closed-outline" size={18} />
            <TextInput
              autoCapitalize="none"
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor={colors.textSoft}
              secureTextEntry={!showPassword}
              style={styles.input}
              value={password}
            />
            <Pressable
              accessibilityLabel={showPassword ? "Hide password" : "Show password"}
              hitSlop={8}
              onPress={() => setShowPassword((current) => !current)}
            >
              <Ionicons color={colors.textSoft} name={showPassword ? "eye-off-outline" : "eye-outline"} size={18} />
            </Pressable>
          </View>
          {mode === "register" ? (
            <View style={styles.field}>
              <Ionicons color={colors.textSoft} name="shield-checkmark-outline" size={18} />
              <TextInput
                autoCapitalize="none"
                onChangeText={setConfirmPassword}
                placeholder="Confirm password"
                placeholderTextColor={colors.textSoft}
                secureTextEntry={!showPassword}
                style={styles.input}
                value={confirmPassword}
              />
            </View>
          ) : null}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button
          label={mode === "login" ? "Log in" : "Create account"}
          loading={loading}
          onPress={() => void submit()}
        />
        <Text style={styles.footnote}>You stay signed in on this device until you log out.</Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  brand: { alignItems: "center", marginBottom: 28 },
  divider: { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  error: { ...type.label, color: colors.danger, textAlign: "center" },
  field: { alignItems: "center", flexDirection: "row", gap: 12, paddingHorizontal: 16 },
  footnote: { ...type.caption, color: colors.textSoft, textAlign: "center" },
  group: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  input: { color: colors.text, flex: 1, fontSize: 16, minHeight: 54 },
  keyboard: { flex: 1, gap: 16, justifyContent: "center", paddingHorizontal: 24 },
  logo: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 18, height: 56, justifyContent: "center", marginBottom: 20, width: 56 },
  screen: { backgroundColor: colors.background, flex: 1 },
  subtitle: { ...type.label, color: colors.textMuted, lineHeight: 20, marginTop: 8, textAlign: "center" },
  title: { ...type.title, color: colors.text, textAlign: "center" },
});
