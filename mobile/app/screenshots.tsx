import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ScreenHeader } from "../components/ScreenHeader";
import {
  deleteScreenshot,
  hasScreenshotPermissions,
  listScreenshots,
  requestScreenshotPermissions,
  saveScreenshotToMemory,
  startScreenshotWatcher,
  type ScreenshotInboxItem,
} from "../services/screenshotWatcher";
import { colors, subtleShadow } from "../styles/theme";

const formatCapturedAt = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

export default function ScreenshotsScreen() {
  const [screenshots, setScreenshots] = useState<ScreenshotInboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState("");
  const [hasPermission, setHasPermission] = useState(false);
  const [error, setError] = useState("");

  const loadScreenshots = useCallback(async (options?: { refreshing?: boolean }) => {
    try {
      if (options?.refreshing) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");
      const [permission, nextScreenshots] = await Promise.all([
        hasScreenshotPermissions(),
        listScreenshots(),
      ]);

      setHasPermission(permission);
      setScreenshots(nextScreenshots.filter((item) => !item.dismissed));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load screenshots");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadScreenshots();
    }, [loadScreenshots]),
  );

  const enableWatcher = async () => {
    const granted = await requestScreenshotPermissions();
    setHasPermission(granted);

    if (!granted) {
      Alert.alert("Permission needed", "Allow photo and notification access to detect screenshots.");
      return;
    }

    await startScreenshotWatcher();
    await loadScreenshots();
  };

  const saveItem = async (item: ScreenshotInboxItem) => {
    try {
      setProcessingId(item._id);
      await saveScreenshotToMemory(item);
      await loadScreenshots();
      Alert.alert("Saved", "Screenshot saved to Memory.");
    } catch (err) {
      Alert.alert("Unable to save", err instanceof Error ? err.message : "Try again.");
    } finally {
      setProcessingId("");
    }
  };

  const deleteItem = async (item: ScreenshotInboxItem) => {
    try {
      setProcessingId(item._id);
      await deleteScreenshot(item);
      await loadScreenshots();
    } catch (err) {
      Alert.alert("Unable to delete", err instanceof Error ? err.message : "Try again.");
    } finally {
      setProcessingId("");
    }
  };

  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            colors={[colors.primary]}
            refreshing={refreshing}
            tintColor={colors.primary}
            onRefresh={() => void loadScreenshots({ refreshing: true })}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader mode="back" title="Screenshot Inbox" />

        {!hasPermission ? (
          <Pressable style={styles.permissionCard} onPress={() => void enableWatcher()}>
            <View style={styles.permissionIcon}>
              <Ionicons color={colors.primary} name="images-outline" size={22} />
            </View>
            <View style={styles.permissionCopy}>
              <Text style={styles.permissionTitle}>Enable screenshot inbox</Text>
              <Text style={styles.permissionText}>
                Allow image access so MemoryOS can detect new screenshots and ask before saving.
              </Text>
            </View>
          </Pressable>
        ) : null}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {loading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.stateText}>Loading screenshots...</Text>
          </View>
        ) : screenshots.length ? (
          <View style={styles.list}>
            {screenshots.map((item) => {
              const busy = processingId === item._id;

              return (
                <View key={item._id} style={styles.card}>
                  <Image source={{ uri: item.imageUri }} style={styles.preview} resizeMode="cover" />
                  <View style={styles.cardBody}>
                    <Text numberOfLines={2} style={styles.cardTitle}>
                      {item.generatedTitle || "Screenshot captured"}
                    </Text>
                    <Text style={styles.cardMeta}>{formatCapturedAt(item.capturedAt)}</Text>
                    {item.extractedText ? (
                      <Text numberOfLines={2} style={styles.ocrText}>
                        {item.extractedText}
                      </Text>
                    ) : null}
                    <View style={styles.actions}>
                      <Pressable
                        disabled={busy || item.processed}
                        style={[styles.saveButton, (busy || item.processed) && styles.disabledButton]}
                        onPress={() => void saveItem(item)}
                      >
                        {busy ? (
                          <ActivityIndicator color={colors.white} size="small" />
                        ) : (
                          <Text style={styles.saveButtonText}>
                            {item.processed ? "Saved" : "Save To Memory"}
                          </Text>
                        )}
                      </Pressable>
                      <Pressable
                        disabled={busy}
                        style={styles.deleteButton}
                        onPress={() => void deleteItem(item)}
                      >
                        <Text style={styles.deleteButtonText}>Delete</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.stateCard}>
            <Ionicons color={colors.textSoft} name="images-outline" size={28} />
            <Text style={styles.emptyTitle}>No pending screenshots</Text>
            <Text style={styles.stateText}>
              New screenshots will appear here after MemoryOS detects them.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    overflow: "hidden",
    ...subtleShadow,
  },
  cardBody: {
    padding: 14,
  },
  cardMeta: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 5,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "900",
    lineHeight: 22,
  },
  content: {
    paddingBottom: 34,
    paddingHorizontal: 22,
    paddingTop: 12,
  },
  deleteButton: {
    alignItems: "center",
    backgroundColor: colors.backgroundSoft,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 44,
  },
  deleteButtonText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900",
  },
  disabledButton: {
    opacity: 0.62,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "900",
    marginTop: 10,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 12,
  },
  list: {
    gap: 14,
  },
  ocrText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
    marginTop: 10,
  },
  permissionCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
    padding: 16,
    ...subtleShadow,
  },
  permissionCopy: {
    flex: 1,
  },
  permissionIcon: {
    alignItems: "center",
    backgroundColor: colors.accentSurface,
    borderRadius: 999,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  permissionText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
    marginTop: 4,
  },
  permissionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
  },
  preview: {
    backgroundColor: colors.backgroundSoft,
    height: 180,
    width: "100%",
  },
  saveButton: {
    alignItems: "center",
    backgroundColor: colors.black,
    borderRadius: 999,
    flex: 1.25,
    justifyContent: "center",
    minHeight: 44,
  },
  saveButtonText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: "900",
  },
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  stateCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    gap: 8,
    padding: 22,
    ...subtleShadow,
  },
  stateText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 20,
    textAlign: "center",
  },
});
