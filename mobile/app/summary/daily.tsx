import { Ionicons } from "@expo/vector-icons";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ScreenHeader } from "../../components/ScreenHeader";
import { colors, subtleShadow } from "../../styles/theme";

export default function DailySummaryScreen() {
  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader mode="back" title="Today's Summary" />

        <View style={styles.card}>
          <View style={styles.icon}>
            <Ionicons color={colors.primary} name="sparkles-outline" size={22} />
          </View>
          <Text style={styles.title}>Daily dashboard</Text>
          <Text style={styles.copy}>
            Your high-level daily summary is now shown on Home. A deeper daily
            recap view can build from the same memory, expense, and location data.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    ...subtleShadow,
  },
  content: {
    paddingBottom: 32,
    paddingHorizontal: 22,
    paddingTop: 12,
  },
  copy: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 23,
    marginTop: 10,
  },
  icon: {
    alignItems: "center",
    backgroundColor: colors.accentSurface,
    borderRadius: 999,
    height: 48,
    justifyContent: "center",
    marginBottom: 16,
    width: 48,
  },
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900",
  },
});
