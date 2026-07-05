import { router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors } from "../styles/theme";

const getParamValue = (value?: string | string[]) =>
  Array.isArray(value) ? value[0] : value;

const makeAssistantId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export default function AssistantDeepLinkScreen() {
  const params = useLocalSearchParams<{
    action?: string;
    description?: string;
    feature?: string;
    name?: string;
  }>();

  useEffect(() => {
    const action = getParamValue(params.action);
    const feature = getParamValue(params.feature);
    const name = getParamValue(params.name);
    const description = getParamValue(params.description);
    const assistantId = makeAssistantId();

    console.log("[AppActions] Assistant deep link parsed", {
      action,
      feature,
      hasDescription: Boolean(description),
      name,
    });

    if (action === "open") {
      if (feature === "capture") {
        console.log("[AppActions] Navigating Assistant open feature", { feature });
        router.replace({
          pathname: "/(tabs)/create",
          params: {
            assistantAction: "open",
            assistantFeature: "capture",
            assistantId,
          },
        });
        return;
      }

      if (feature === "expenses") {
        console.log("[AppActions] Navigating Assistant open feature", { feature });
        router.replace("/(tabs)/expenses");
        return;
      }

      if (feature === "history") {
        console.log("[AppActions] Navigating Assistant open feature", { feature });
        router.replace("/(tabs)/calendar");
        return;
      }

      console.warn("[AppActions] Assistant open feature failed", { feature });
      router.replace("/(tabs)");
      return;
    }

    if (action === "search") {
      if (!name?.trim()) {
        console.warn("[AppActions] Assistant search failed: missing query");
        router.replace("/(tabs)/search");
        return;
      }

      console.log("[AppActions] Navigating Assistant search", { query: name });
      router.replace({
        pathname: "/(tabs)/search",
        params: {
          assistantId,
          assistantQuery: name,
          assistantRun: "1",
        },
      });
      return;
    }

    if (action === "log") {
      if (!name?.trim() && !description?.trim()) {
        console.warn("[AppActions] Assistant log failed: missing draft text");
        router.replace("/(tabs)/create");
        return;
      }

      console.log("[AppActions] Navigating Assistant log capture", {
        hasDescription: Boolean(description),
        name,
      });
      router.replace({
        pathname: "/(tabs)/create",
        params: {
          assistantAction: "log",
          assistantDescription: description || "",
          assistantId,
          assistantName: name || "",
        },
      });
      return;
    }

    console.warn("[AppActions] Assistant deep link failed: unsupported action", { action });
    router.replace("/(tabs)");
  }, [params.action, params.description, params.feature, params.name]);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.text}>Opening Memonest...</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: "center",
    gap: 12,
  },
  screen: {
    alignItems: "center",
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: "center",
  },
  text: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "700",
  },
});
