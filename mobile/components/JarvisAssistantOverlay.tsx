import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  addJarvisAssistantListener,
  type JarvisAssistantEvent,
} from "../services/jarvisAssistant";
import { colors, subtleShadow } from "../styles/theme";

export function JarvisAssistantOverlay() {
  const [event, setEvent] = useState<JarvisAssistantEvent | null>(null);

  useEffect(() => {
    const subscription = addJarvisAssistantListener((nextEvent) => {
      if (nextEvent.type === "result" || nextEvent.type === "error") {
        setEvent(nextEvent);
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!event) {
      return;
    }

    const timeout = setTimeout(() => setEvent(null), 14000);

    return () => clearTimeout(timeout);
  }, [event]);

  if (!event) {
    return null;
  }

  const isError = event.type === "error";
  const body = isError ? event.error : event.answer;

  if (!body) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <View style={[styles.card, isError && styles.errorCard]}>
        <View style={[styles.icon, isError && styles.errorIcon]}>
          <Ionicons
            color={isError ? colors.danger : colors.primary}
            name={isError ? "alert-circle-outline" : "sparkles-outline"}
            size={18}
          />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>{isError ? "Jarvis needs attention" : "Jarvis"}</Text>
          {event.transcript ? (
            <Text numberOfLines={1} style={styles.transcript}>
              {event.transcript}
            </Text>
          ) : null}
          <Text numberOfLines={4} style={styles.answer}>
            {body}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Dismiss Jarvis result"
          accessibilityRole="button"
          hitSlop={10}
          style={styles.closeButton}
          onPress={() => setEvent(null)}
        >
          <Ionicons color={colors.textMuted} name="close" size={18} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  answer: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
    marginTop: 4,
  },
  card: {
    ...subtleShadow,
    alignItems: "flex-start",
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 12,
  },
  closeButton: {
    alignItems: "center",
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  copy: {
    flex: 1,
  },
  errorCard: {
    borderColor: colors.danger,
  },
  errorIcon: {
    backgroundColor: colors.dangerSurface,
  },
  icon: {
    alignItems: "center",
    backgroundColor: colors.backgroundSoft,
    borderRadius: 8,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  title: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900",
  },
  transcript: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    marginTop: 2,
  },
  wrap: {
    bottom: 22,
    left: 14,
    position: "absolute",
    right: 14,
    zIndex: 30,
  },
});
