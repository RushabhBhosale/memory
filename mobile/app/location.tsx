import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import MapView, {
  Circle,
  Marker,
  type MapPressEvent,
  type Region,
} from "react-native-maps";
import { SafeAreaView } from "react-native-safe-area-context";

import { StateView } from "../components/StateView";
import {
  clearRecentTimelineNoise,
  clearTimelineEvents,
  completeLocationReminder,
  deletePlace,
  distanceMeters,
  getCurrentCoordinates,
  getFrequentPlaceSuggestions,
  getLocationDebugState,
  getTimelineByRange,
  getWorkHoursSummary,
  listLocationReminders,
  listPlaces,
  openLocationSettings,
  readLocationSettings,
  requestLocationPermissionFlow,
  savePlace,
  syncLocationGeofences,
  type LocationDebugState,
  type LocationReminder,
  type LocationSettings,
  type PlaceTimelineEvent,
  type PlaceType,
  type SavedPlace,
  type WorkHoursSummary,
} from "../services/locationIntelligence";
import { colors, subtleShadow } from "../styles/theme";

type TimelineRange = "today" | "yesterday" | "week" | "month";

const placeTypes: PlaceType[] = ["home", "office", "gym", "mall", "custom"];
const rangeLabels: Array<{ label: string; value: TimelineRange }> = [
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "This Week", value: "week" },
  { label: "This Month", value: "month" },
];
const DEFAULT_RADIUS_METERS = 50;
const DEFAULT_MAP_REGION: Region = {
  latitude: 19.076,
  latitudeDelta: 0.01,
  longitude: 72.8777,
  longitudeDelta: 0.01,
};
const radiusOptions = [50, 75, 100, 150];
const hasGoogleMapsApiKey = Boolean(
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
);

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

const formatMinutes = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (!hours) {
    return `${mins}m`;
  }

  return `${hours}h ${mins}m`;
};

const formatEventTime = (value: string) =>
  timeFormatter.format(new Date(value));

const emptyDebug: LocationDebugState = {
  backgroundPermission: "unknown",
  currentLocation: null,
  foregroundPermission: "unknown",
  lastGeofenceTrigger: "",
  lastTimelineEvent: null,
  registeredGeofences: [],
};

export default function LocationScreen() {
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [reminders, setReminders] = useState<LocationReminder[]>([]);
  const [timeline, setTimeline] = useState<PlaceTimelineEvent[]>([]);
  const [settings, setSettings] = useState<LocationSettings | null>(null);
  const [debug, setDebug] = useState<LocationDebugState>(emptyDebug);
  const [workHours, setWorkHours] = useState<WorkHoursSummary | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [range, setRange] = useState<TimelineRange>("today");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [placeName, setPlaceName] = useState("");
  const [placeType, setPlaceType] = useState<PlaceType>("home");
  const [selectedLocation, setSelectedLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [mapRegion, setMapRegion] = useState<Region>(DEFAULT_MAP_REGION);
  const [radiusMeters, setRadiusMeters] = useState(
    String(DEFAULT_RADIUS_METERS),
  );
  const mapRef = useRef<MapView | null>(null);

  const pendingReminders = useMemo(
    () => reminders.filter((reminder) => reminder.status === "pending"),
    [reminders],
  );

  const loadLocationData = useCallback(async () => {
    try {
      setLoading(true);
      const [
        nextPlaces,
        nextReminders,
        nextTimeline,
        nextSettings,
        nextDebug,
        nextWorkHours,
        nextSuggestions,
      ] = await Promise.all([
        listPlaces(),
        listLocationReminders(),
        getTimelineByRange(range),
        readLocationSettings(),
        getLocationDebugState(),
        getWorkHoursSummary(),
        getFrequentPlaceSuggestions(),
      ]);

      setPlaces(nextPlaces);
      setReminders(nextReminders);
      setTimeline(nextTimeline);
      setSettings(nextSettings);
      setDebug(nextDebug);
      setWorkHours(nextWorkHours);
      setSuggestions(nextSuggestions);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useFocusEffect(
    useCallback(() => {
      void loadLocationData();
    }, [loadLocationData]),
  );

  useEffect(() => {
    if (!debug.currentLocation || selectedLocation) {
      return;
    }

    setSelectedLocation(debug.currentLocation);
    setMapRegion((current) => ({
      ...current,
      latitude: debug.currentLocation?.latitude ?? current.latitude,
      longitude: debug.currentLocation?.longitude ?? current.longitude,
    }));
  }, [debug.currentLocation, selectedLocation]);

  const selectLocation = useCallback(
    (
      coords: { latitude: number; longitude: number },
      options?: { animate?: boolean },
    ) => {
      const nextRegion = {
        latitude: coords.latitude,
        latitudeDelta: 0.006,
        longitude: coords.longitude,
        longitudeDelta: 0.006,
      };

      setSelectedLocation(coords);
      setMapRegion(nextRegion);

      if (options?.animate) {
        mapRef.current?.animateToRegion(nextRegion, 350);
      }
    },
    [],
  );

  const selectMapLocation = (event: MapPressEvent) => {
    selectLocation(event.nativeEvent.coordinate);
  };

  const useCurrentLocation = async () => {
    try {
      const permission = await requestLocationPermissionFlow();

      if (permission.foreground.status !== "granted") {
        Alert.alert(
          "Location needed",
          "Allow foreground location first, then try again.",
        );
        return;
      }

      if (permission.background?.status !== "granted") {
        Alert.alert(
          "Background location",
          "For geofences to work while the app is closed, allow background location in Android settings.",
          [
            { text: "Later", style: "cancel" },
            { text: "Open Settings", onPress: openLocationSettings },
          ],
        );
      }

      const coords = await getCurrentCoordinates();
      selectLocation(coords, { animate: true });
      await loadLocationData();
    } catch (error) {
      Alert.alert(
        "Location unavailable",
        error instanceof Error
          ? error.message
          : "Unable to read current location.",
      );
    }
  };

  const addPlace = async () => {
    const parsedRadius = Math.max(
      50,
      Number(radiusMeters) || DEFAULT_RADIUS_METERS,
    );

    if (!placeName.trim()) {
      Alert.alert("Name required", "Give this place a name first.");
      return;
    }

    if (!selectedLocation) {
      Alert.alert(
        "Pick a location",
        "Tap the map or use current location before saving this place.",
      );
      return;
    }

    try {
      setSaving(true);
      await savePlace({
        latitude: selectedLocation.latitude,
        longitude: selectedLocation.longitude,
        name: placeName,
        radiusMeters: parsedRadius,
        type: placeType,
      });
      setPlaceName("");
      setSelectedLocation(null);
      setRadiusMeters(String(DEFAULT_RADIUS_METERS));
      await loadLocationData();
    } finally {
      setSaving(false);
    }
  };

  const refreshGeofences = async () => {
    await syncLocationGeofences();
    await loadLocationData();
  };

  const clearTimeline = () => {
    Alert.alert(
      "Clear place timeline?",
      "This removes place timeline events from the database.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: () => void clearTimelineEvents().then(loadLocationData),
        },
      ],
    );
  };

  const clearRecentNoise = () => {
    Alert.alert(
      "Clear recent noise?",
      "This removes database timeline events from the last 60 minutes and resets this phone's geofence state. Saved places and reminders stay.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear recent",
          style: "destructive",
          onPress: async () => {
            const deletedCount = await clearRecentTimelineNoise(60);
            await loadLocationData();
            Alert.alert(
              "Cleaned up",
              `Removed ${deletedCount} recent timeline events.`,
            );
          },
        },
      ],
    );
  };

  if (Platform.OS !== "android") {
    return (
      <SafeAreaView edges={["top"]} style={styles.screen}>
        <StateView
          title="Android first"
          detail="Location reminders use Android geofencing and are only enabled on Android."
        />
      </SafeAreaView>
    );
  }

  if (loading || !settings) {
    return (
      <SafeAreaView edges={["top"]} style={styles.screen}>
        <StateView
          title="Loading location tools"
          detail="Checking places and geofences."
          loading
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>MemoryOS</Text>
            <Text style={styles.title}>Location</Text>
          </View>
          <Pressable
            style={styles.iconButton}
            onPress={() => void refreshGeofences()}
          >
            <Ionicons color={colors.primary} name="locate-outline" size={20} />
          </Pressable>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Saved Places</Text>
          <View style={styles.typeRow}>
            {placeTypes.map((type) => (
              <Pressable
                key={type}
                style={[
                  styles.typeChip,
                  placeType === type && styles.selectedChip,
                ]}
                onPress={() => setPlaceType(type)}
              >
                <Text
                  style={[
                    styles.typeChipText,
                    placeType === type && styles.selectedChipText,
                  ]}
                >
                  {type}
                </Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            value={placeName}
            onChangeText={setPlaceName}
            placeholder="Home, Office, Gym, D-Mart"
            placeholderTextColor={colors.textSoft}
            style={styles.input}
          />
          {hasGoogleMapsApiKey ? (
            <View style={styles.mapShell}>
              <MapView
                ref={mapRef}
                initialRegion={mapRegion}
                onPress={selectMapLocation}
                onRegionChangeComplete={setMapRegion}
                showsMyLocationButton
                showsUserLocation
                style={styles.map}
              >
                {selectedLocation ? (
                  <>
                    <Marker
                      coordinate={selectedLocation}
                      draggable
                      onDragEnd={(event) =>
                        selectLocation(event.nativeEvent.coordinate)
                      }
                      title={placeName || "Selected place"}
                    />
                    <Circle
                      center={selectedLocation}
                      fillColor="rgba(139, 92, 246, 0.16)"
                      radius={Math.max(
                        50,
                        Number(radiusMeters) || DEFAULT_RADIUS_METERS,
                      )}
                      strokeColor={colors.primary}
                      strokeWidth={2}
                    />
                  </>
                ) : null}
              </MapView>
              <View pointerEvents="none" style={styles.mapHint}>
                <Text style={styles.mapHintText}>
                  Tap map or drag pin to choose the exact place
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.mapSetupCard}>
              <Ionicons color={colors.primary} name="map-outline" size={24} />
              <Text style={styles.mapSetupTitle}>Map setup needed</Text>
              <Text style={styles.mapSetupText}>
                Add EXPO_PUBLIC_GOOGLE_MAPS_API_KEY to mobile/.env, rebuild
                Android, then the map picker will appear here. You can still
                save the current phone location with the button below.
              </Text>
            </View>
          )}
          <View style={styles.radiusHeader}>
            <Text style={styles.radiusLabel}>Geofence radius</Text>
            <Text style={styles.radiusValue}>
              {Math.max(50, Number(radiusMeters) || 50)}m
            </Text>
          </View>
          <View style={styles.typeRow}>
            {radiusOptions.map((radius) => (
              <Pressable
                key={radius}
                style={[
                  styles.typeChip,
                  Number(radiusMeters) === radius && styles.selectedChip,
                ]}
                onPress={() => setRadiusMeters(String(radius))}
              >
                <Text
                  style={[
                    styles.typeChipText,
                    Number(radiusMeters) === radius && styles.selectedChipText,
                  ]}
                >
                  {radius}m
                </Text>
              </Pressable>
            ))}
          </View>
          {selectedLocation ? (
            <Text style={styles.selectedLocationText}>
              Selected {selectedLocation.latitude.toFixed(5)},{" "}
              {selectedLocation.longitude.toFixed(5)}
            </Text>
          ) : (
            <Text style={styles.selectedLocationText}>
              No location selected yet. Use current location or tap the map.
            </Text>
          )}
          <View style={styles.actionRow}>
            <Pressable
              style={styles.secondaryButton}
              onPress={() => void useCurrentLocation()}
            >
              <Text style={styles.secondaryButtonText}>
                Use current location
              </Text>
            </Pressable>
            <Pressable
              disabled={saving}
              style={styles.primaryButton}
              onPress={() => void addPlace()}
            >
              {saving ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.primaryButtonText}>Add place</Text>
              )}
            </Pressable>
          </View>

          <View style={styles.list}>
            {places.map((place) => (
              <View key={place.id} style={styles.placeCard}>
                <View style={styles.placeRow}>
                  <View style={styles.placeIcon}>
                    <Ionicons
                      color={colors.primary}
                      name="location"
                      size={17}
                    />
                  </View>
                  <View style={styles.placeCopy}>
                    <Text style={styles.placeTitle}>{place.name}</Text>
                    <Text style={styles.placeMeta}>
                      {place.type} • {Math.round(place.radiusMeters)}m radius
                      {debug.currentLocation
                        ? ` • ${Math.round(distanceMeters(debug.currentLocation, place))}m away`
                        : ""}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() =>
                      Alert.alert(
                        "Delete place?",
                        `Remove ${place.name} and its reminders?`,
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Delete",
                            style: "destructive",
                            onPress: () =>
                              void deletePlace(place.id).then(loadLocationData),
                          },
                        ],
                      )
                    }
                  >
                    <Ionicons
                      color={colors.danger}
                      name="trash-outline"
                      size={18}
                    />
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Location Reminders</Text>
          {pendingReminders.length ? (
            pendingReminders.map((reminder) => (
              <View key={reminder.id} style={styles.reminderRow}>
                <View>
                  <Text style={styles.placeTitle}>{reminder.description}</Text>
                  <Text style={styles.placeMeta}>
                    {reminder.triggerType === "exit"
                      ? "Leaving"
                      : "Arriving at"}{" "}
                    {reminder.placeName}
                  </Text>
                </View>
                <View style={styles.reminderActions}>
                  <Pressable
                    onPress={() =>
                      void completeLocationReminder(reminder.id).then(
                        loadLocationData,
                      )
                    }
                  >
                    <Text style={styles.doneText}>Done</Text>
                  </Pressable>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>
              Create one from Add Memory → Reminder → Location.
            </Text>
          )}
        </View>

        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelTitle}>Place Timeline</Text>
            <Text style={styles.panelCaption}>{timeline.length} events</Text>
          </View>
          <View style={styles.typeRow}>
            {rangeLabels.map((item) => (
              <Pressable
                key={item.value}
                style={[
                  styles.typeChip,
                  range === item.value && styles.selectedChip,
                ]}
                onPress={() => setRange(item.value)}
              >
                <Text
                  style={[
                    styles.typeChipText,
                    range === item.value && styles.selectedChipText,
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
          {timeline.length ? (
            timeline.map((event) => (
              <View key={event.id} style={styles.timelineRow}>
                <Text style={styles.timelineTime}>
                  {formatEventTime(event.timestamp)}
                </Text>
                <View style={styles.timelineDot} />
                <Text style={styles.timelineText}>
                  {event.eventType === "exit" ? "Left" : "Entered"}{" "}
                  {event.placeName}
                  {event.durationMinutes
                    ? ` • ${formatMinutes(event.durationMinutes)}`
                    : ""}
                </Text>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>
              Timeline events appear after geofence triggers.
            </Text>
          )}
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Work Hours</Text>
          {workHours ? (
            <View style={styles.workGrid}>
              <Metric
                label="Today"
                value={formatMinutes(workHours.todayMinutes)}
              />
              <Metric
                label="This week"
                value={formatMinutes(workHours.weekMinutes)}
              />
              <Metric
                label="Arrived"
                value={
                  workHours.arrivedAt
                    ? formatEventTime(workHours.arrivedAt)
                    : "-"
                }
              />
              <Metric
                label="Left"
                value={
                  workHours.leftAt ? formatEventTime(workHours.leftAt) : "-"
                }
              />
            </View>
          ) : null}
        </View>

        {settings.frequentPlaceSuggestions && suggestions.length ? (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Suggestions</Text>
            {suggestions.map((suggestion) => (
              <Text key={suggestion} style={styles.helpText}>
                {suggestion}
              </Text>
            ))}
          </View>
        ) : null}

        {/* <View style={styles.panel}>
          <Text style={styles.panelTitle}>Developer Debug</Text>
          <DebugLine label="Foreground permission" value={debug.foregroundPermission} />
          <DebugLine label="Background permission" value={debug.backgroundPermission} />
          <DebugLine
            label="Current location"
            value={
              debug.currentLocation
                ? `${debug.currentLocation.latitude.toFixed(5)}, ${debug.currentLocation.longitude.toFixed(5)}`
                : "unknown"
            }
          />
          <DebugLine label="Saved places" value={String(places.length)} />
          <DebugLine label="Registered geofences" value={String(debug.registeredGeofences.length)} />
          <DebugLine label="Pending reminders" value={String(pendingReminders.length)} />
          <DebugLine label="Last trigger" value={debug.lastGeofenceTrigger || "none"} />
          <DebugLine
            label="Last timeline event"
            value={
              debug.lastTimelineEvent
                ? `${debug.lastTimelineEvent.eventType} ${debug.lastTimelineEvent.placeName}`
                : "none"
            }
          />
          <Pressable style={styles.clearButton} onPress={clearRecentNoise}>
            <Text style={styles.clearButtonText}>Clear recent noise</Text>
          </Pressable>
          <Pressable style={styles.clearButton} onPress={clearTimeline}>
            <Text style={styles.clearButtonText}>Clear timeline events</Text>
          </Pressable>
        </View> */}
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function DebugLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.debugRow}>
      <Text style={styles.debugLabel}>{label}</Text>
      <Text style={styles.debugValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  content: {
    padding: 18,
    paddingBottom: 118,
  },
  clearButton: {
    alignItems: "center",
    backgroundColor: colors.dangerSurface,
    borderColor: colors.danger,
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  clearButtonText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "900",
  },
  debugLabel: {
    color: colors.textMuted,
    flex: 1,
    fontSize: 12,
    fontWeight: "800",
  },
  debugRow: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 12,
    paddingVertical: 10,
  },
  debugValue: {
    color: colors.text,
    flex: 1.2,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "right",
  },
  doneText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "900",
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  helpText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
    marginTop: 10,
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: colors.accentSurface,
    borderRadius: 999,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  input: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    color: colors.text,
    fontSize: 15,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  list: {
    gap: 10,
    marginTop: 16,
  },
  map: {
    flex: 1,
  },
  mapHint: {
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 999,
    bottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
    position: "absolute",
  },
  mapHintText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "800",
  },
  mapShell: {
    backgroundColor: colors.backgroundSoft,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    height: 260,
    marginTop: 12,
    overflow: "hidden",
  },
  mapSetupCard: {
    alignItems: "center",
    backgroundColor: colors.accentSurface,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    gap: 8,
    marginTop: 12,
    padding: 16,
  },
  mapSetupText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
    textAlign: "center",
  },
  mapSetupTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
  },
  metricCard: {
    backgroundColor: colors.backgroundSoft,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    padding: 14,
  },
  metricLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 5,
  },
  metricValue: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "900",
  },
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    marginBottom: 16,
    padding: 16,
    ...subtleShadow,
  },
  panelCaption: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: "800",
  },
  panelHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  panelTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
  },
  placeCopy: {
    flex: 1,
  },
  placeCard: {
    backgroundColor: colors.backgroundSoft,
    borderRadius: 16,
    gap: 10,
    padding: 12,
  },
  placeIcon: {
    alignItems: "center",
    backgroundColor: colors.accentSurface,
    borderRadius: 999,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  placeMeta: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 3,
  },
  placeRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  placeTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900",
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.black,
    borderRadius: 999,
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: "900",
  },
  radiusHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 14,
  },
  radiusLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900",
  },
  radiusValue: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "900",
  },
  reminderRow: {
    alignItems: "center",
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  reminderActions: {
    alignItems: "flex-end",
    gap: 10,
  },
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: colors.backgroundSoft,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900",
  },
  selectedLocationText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
    marginTop: 10,
  },
  selectedChip: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  selectedChipText: {
    color: colors.white,
  },
  timelineDot: {
    backgroundColor: colors.primary,
    borderRadius: 999,
    height: 9,
    marginTop: 3,
    width: 9,
  },
  timelineRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    paddingVertical: 9,
  },
  timelineText: {
    color: colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: "800",
  },
  timelineTime: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "800",
    width: 64,
  },
  title: {
    color: colors.text,
    fontSize: 32,
    fontWeight: "900",
  },
  typeChip: {
    backgroundColor: colors.backgroundSoft,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  typeChipText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "capitalize",
  },
  typeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  workGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 12,
  },
});
