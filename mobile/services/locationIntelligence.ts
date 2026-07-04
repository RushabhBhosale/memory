import AsyncStorage from "@react-native-async-storage/async-storage";
import { Linking, NativeEventEmitter, NativeModules, Platform } from "react-native";

import { getApiConfig, listMemories, request, updateMemory } from "./api";
import { scheduleLocationReminderNotification } from "./notifications";

export type PlaceType = "home" | "office" | "gym" | "mall" | "custom";
export type LocationTriggerType = "enter" | "exit";
export type LocationTimelineEventType = LocationTriggerType | "dwell" | "visit";
export type LocationReminderStatus = "pending" | "triggered" | "completed";

export type SavedPlace = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  type: PlaceType;
  createdAt: string;
  updatedAt: string;
};

export type LocationReminder = {
  id: string;
  memoryId?: string;
  type: "location";
  title: string;
  description: string;
  triggerType: LocationTriggerType;
  placeId: string;
  placeName: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  status: LocationReminderStatus;
  triggeredAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type PlaceTimelineEvent = {
  id: string;
  placeId: string;
  placeName: string;
  eventType: LocationTimelineEventType;
  latitude: number;
  longitude: number;
  timestamp: string;
  durationMinutes?: number;
  activity?: "walking" | "running" | "cycling" | "driving" | "still" | "unknown";
  address?: string;
  locality?: string;
  city?: string;
  country?: string;
};

export type SuggestedPlace = {
  id: string;
  address?: string;
  city?: string;
  country?: string;
  durationMinutes: number;
  eventCount: number;
  lastSeenAt: string;
  latitude: number;
  locality?: string;
  longitude: number;
  name: string;
  radiusMeters: number;
};

export type LocationSettings = {
  locationReminders: boolean;
  placeTimeline: boolean;
  frequentPlaceSuggestions: boolean;
  homeArrivalSummary: boolean;
  workHoursTracking: boolean;
};

export type LocationDebugState = {
  foregroundPermission: string;
  backgroundPermission: string;
  activityPermission?: string;
  currentLocation: { latitude: number; longitude: number } | null;
  registeredGeofences: string[];
  lastGeofenceTrigger: string;
  lastTimelineEvent: PlaceTimelineEvent | null;
  lastActivity?: string;
  trackingEnabled?: boolean;
};

export type WorkHoursSummary = {
  todayMinutes: number;
  weekMinutes: number;
  arrivedAt: string | null;
  leftAt: string | null;
};

const DEFAULT_RADIUS_METERS = 50;
const SAME_EVENT_COOLDOWN_MS = 10 * 60 * 1000;
const TRANSITION_COOLDOWN_MS = 90 * 1000;
const SETTINGS_KEY = "location:settings";
const DEBUG_KEY = "location:debug";
const GEOFENCE_STATE_KEY = "location:geofenceState";
const SUGGESTED_PLACE_IGNORES_KEY = "location:suggestedPlaceIgnores";
const LEGACY_LOCAL_DATA_KEYS = ["location:places", "location:reminders", "location:timeline"];
const SUGGESTED_PLACE_MIN_DURATION_MINUTES = 20;
const SUGGESTED_PLACE_RADIUS_METERS = 75;

type NativeLocationPayload = {
  id?: string;
  placeId?: string;
  placeName?: string;
  eventType?: LocationTimelineEventType;
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp: number | string;
  durationMinutes?: number;
  activity?: PlaceTimelineEvent["activity"];
  address?: string;
  locality?: string;
  city?: string;
  country?: string;
};

type NativeMemoryLocationModule = {
  configurePlaces: (places: SavedPlace[]) => Promise<boolean>;
  drainPendingEvents: () => Promise<NativeLocationPayload[]>;
  getCurrentLocation: () => Promise<NativeLocationPayload | null>;
  getLastKnownLocation: () => Promise<NativeLocationPayload | null>;
  getNearbySavedPlace: (
    coords: { latitude: number; longitude: number },
  ) => Promise<(SavedPlace & { distanceMeters: number }) | null>;
  getPermissionStatus: () => Promise<{
    foreground: string;
    background: string;
    activity: string;
  }>;
  getTimeline: () => Promise<NativeLocationPayload[]>;
  isTrackingEnabled: () => Promise<boolean>;
  openBatteryOptimizationSettings: () => void;
  requestPermissions: () => Promise<boolean>;
  startTracking: () => Promise<boolean>;
  stopTracking: () => Promise<boolean>;
};

const nativeLocationModule = NativeModules.MemoryLocationModule as
  | NativeMemoryLocationModule
  | undefined;

const ensureNativeLocationModule = () => {
  if (Platform.OS !== "android") {
    return null;
  }

  if (!nativeLocationModule) {
    throw new Error("Memory location native module is unavailable. Rebuild the Android app.");
  }

  return nativeLocationModule;
};

type GeofencePlaceState = {
  inside: boolean;
  lastEnterAt?: string;
  lastEventAt?: string;
  lastEventType?: LocationTriggerType;
};

type GeofenceState = Record<string, GeofencePlaceState>;

export const defaultLocationSettings: LocationSettings = {
  frequentPlaceSuggestions: false,
  homeArrivalSummary: false,
  locationReminders: false,
  placeTimeline: false,
  workHoursTracking: false,
};

const nowIso = () => new Date().toISOString();

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Unknown location error";

const createId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const readJson = async <T>(key: string, fallback: T): Promise<T> => {
  const value = await AsyncStorage.getItem(key);

  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const writeJson = async <T>(key: string, value: T) => {
  await AsyncStorage.setItem(key, JSON.stringify(value));
};

const clearLegacyLocalLocationData = async () => {
  for (const key of LEGACY_LOCAL_DATA_KEYS) {
    await AsyncStorage.setItem(key, "[]").catch(() => undefined);
  }
};

const getDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const getWeekStart = (date: Date) => {
  const next = new Date(date);
  const day = next.getDay() || 7;
  next.setDate(next.getDate() - day + 1);
  next.setHours(0, 0, 0, 0);
  return next;
};

const getDistanceMeters = (
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) => {
  const earthRadius = 6371000;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const deltaLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const deltaLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;

  return 2 * earthRadius * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

export const distanceMeters = getDistanceMeters;

const getSuggestedPlaceClusterId = (event: {
  latitude: number;
  longitude: number;
}) => `suggested:${event.latitude.toFixed(3)},${event.longitude.toFixed(3)}`;

const getSuggestedPlaceName = (event: PlaceTimelineEvent) => {
  const rawName =
    event.locality ||
    event.address ||
    event.city ||
    event.placeName ||
    "this place";
  const cleanName = rawName.replace(/^current location$/i, "this place").trim();

  return cleanName.toLowerCase() === "this place"
    ? "Place you visited"
    : `Near ${cleanName}`;
};

type ListPlacesResponse = {
  count: number;
  data: Array<SavedPlace & { _id?: string }>;
};

type SinglePlaceResponse = {
  data: SavedPlace & { _id?: string };
};

type ListTimelineResponse = {
  count: number;
  data: Array<PlaceTimelineEvent & { _id?: string }>;
};

type SingleTimelineResponse = {
  data: PlaceTimelineEvent & { _id?: string };
};

type DeleteTimelineResponse = {
  deletedCount: number;
};

const normalizePlace = (place: SavedPlace & { _id?: string }): SavedPlace => ({
  ...place,
  id: place.id || place._id || "",
});

const normalizeTimelineEvent = (
  event: PlaceTimelineEvent & { _id?: string },
): PlaceTimelineEvent => ({
  ...event,
  id: event.id || event._id || "",
});

const getLocationUrls = () => {
  const { locationPlacesUrl, locationTimelineUrl } = getApiConfig();
  return { locationPlacesUrl, locationTimelineUrl };
};

export const listPlaces = async () => {
  const { locationPlacesUrl } = getLocationUrls();
  const response = await request<ListPlacesResponse>(locationPlacesUrl, "");
  return response.data.map(normalizePlace);
};

export const savePlace = async (
  input: Omit<SavedPlace, "id" | "createdAt" | "updatedAt"> & { id?: string },
) => {
  const { locationPlacesUrl } = getLocationUrls();
  const payload = {
    latitude: input.latitude,
    longitude: input.longitude,
    name: input.name.trim(),
    radiusMeters: input.radiusMeters || DEFAULT_RADIUS_METERS,
    type: input.type,
  };
  const response = input.id
    ? await request<SinglePlaceResponse>(locationPlacesUrl, `/${encodeURIComponent(input.id)}`, {
        body: JSON.stringify(payload),
        method: "PATCH",
      })
    : await request<SinglePlaceResponse>(locationPlacesUrl, "", {
        body: JSON.stringify(payload),
        method: "POST",
      });
  const place = normalizePlace(response.data);

  await syncLocationGeofences();

  return place;
};

export const deletePlace = async (id: string) => {
  const { locationPlacesUrl } = getLocationUrls();
  await request<{ message: string }>(locationPlacesUrl, `/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  await syncLocationGeofences();
};

const memoryToLocationReminder = (memory: Awaited<ReturnType<typeof listMemories>>[number]) => {
  if (
    memory.reminderType !== "location" ||
    !memory.placeId ||
    !memory.placeName ||
    !memory.triggerType ||
    typeof memory.latitude !== "number" ||
    typeof memory.longitude !== "number"
  ) {
    return null;
  }

  return {
    createdAt: memory.createdAt,
    description: memory.content,
    id: memory._id,
    latitude: memory.latitude,
    longitude: memory.longitude,
    memoryId: memory._id,
    placeId: memory.placeId,
    placeName: memory.placeName,
    radiusMeters: memory.radiusMeters || DEFAULT_RADIUS_METERS,
    status: memory.status || "pending",
    title: memory.title,
    triggerType: memory.triggerType,
    type: "location" as const,
    triggeredAt: memory.triggeredAt,
    updatedAt: memory.updatedAt,
  };
};

export const listLocationReminders = async () => {
  const memories = await listMemories();
  return memories.map(memoryToLocationReminder).filter(Boolean) as LocationReminder[];
};

export const createLocationReminder = async (input: {
  description: string;
  memoryId?: string;
  place: SavedPlace;
  title: string;
  triggerType: LocationTriggerType;
}) => {
  const timestamp = nowIso();
  const reminder: LocationReminder = {
    createdAt: timestamp,
    description: input.description,
    id: input.memoryId || createId("loc-reminder"),
    latitude: input.place.latitude,
    longitude: input.place.longitude,
    memoryId: input.memoryId,
    placeId: input.place.id,
    placeName: input.place.name,
    radiusMeters: input.place.radiusMeters,
    status: "pending",
    title: input.title,
    triggerType: input.triggerType,
    type: "location",
    updatedAt: timestamp,
  };

  await syncLocationGeofences();

  return reminder;
};

export const completeLocationReminder = async (id: string) => {
  const timestamp = nowIso();

  await updateMemory(id, {
    status: "completed",
    triggeredAt: timestamp,
  });
  await syncLocationGeofences();
};

export const listTimelineEvents = async () => {
  const { locationTimelineUrl } = getLocationUrls();
  const response = await request<ListTimelineResponse>(locationTimelineUrl, "");
  return response.data.map(normalizeTimelineEvent);
};

export const clearTimelineEvents = async () => {
  const { locationTimelineUrl } = getLocationUrls();
  await request<DeleteTimelineResponse>(locationTimelineUrl, "", {
    method: "DELETE",
  });
  await writeJson(GEOFENCE_STATE_KEY, {});
  await updateDebugState({ lastTimelineEvent: null });
};

export const clearRecentTimelineNoise = async (minutes = 60) => {
  const { locationTimelineUrl } = getLocationUrls();
  const response = await request<DeleteTimelineResponse>(
    locationTimelineUrl,
    `?recentMinutes=${encodeURIComponent(String(minutes))}`,
    {
      method: "DELETE",
    },
  );

  await writeJson(GEOFENCE_STATE_KEY, {});
  await updateDebugState({
    lastGeofenceTrigger: `Cleared ${response.deletedCount} recent timeline events`,
    lastTimelineEvent: null,
  });

  return response.deletedCount;
};

export const readLocationSettings = async () => ({
  ...defaultLocationSettings,
  ...(await readJson<Partial<LocationSettings>>(SETTINGS_KEY, {})),
});

export const saveLocationSettings = async (settings: LocationSettings) => {
  await writeJson(SETTINGS_KEY, settings);
  await syncLocationGeofences();
};

const readDebugState = () =>
  readJson<LocationDebugState>(DEBUG_KEY, {
    backgroundPermission: "unknown",
    currentLocation: null,
    foregroundPermission: "unknown",
    lastGeofenceTrigger: "",
    lastTimelineEvent: null,
    registeredGeofences: [],
  });

const updateDebugState = async (updates: Partial<LocationDebugState>) => {
  const current = await readDebugState();
  await writeJson(DEBUG_KEY, { ...current, ...updates });
};

export const getLocationDebugState = readDebugState;

const readGeofenceState = () => readJson<GeofenceState>(GEOFENCE_STATE_KEY, {});

const writeGeofenceState = (state: GeofenceState) => writeJson(GEOFENCE_STATE_KEY, state);

export const getCurrentCoordinates = async () => {
  const nativeModule = ensureNativeLocationModule();
  const location = await nativeModule?.getCurrentLocation();

  if (!location) {
    throw new Error("Unable to read current location.");
  }

  const currentLocation = {
    latitude: location.latitude,
    longitude: location.longitude,
  };

  await updateDebugState({ currentLocation });

  return currentLocation;
};

export const requestLocationPermissionFlow = async () => {
  const nativeModule = ensureNativeLocationModule();

  if (!nativeModule) {
    const unavailable = { status: "unavailable" };
    return { activity: unavailable, background: unavailable, foreground: unavailable };
  }

  await nativeModule.requestPermissions();
  const status = await nativeModule.getPermissionStatus();
  const foreground = { status: status.foreground };
  const background = { status: status.background };
  const activity = { status: status.activity };

  await updateDebugState({
    activityPermission: status.activity,
    backgroundPermission: status.background,
    foregroundPermission: status.foreground,
  });

  if (foreground.status !== "granted") {
    return { activity, background: null, foreground };
  }

  return { activity, background, foreground };
};

export const getLocationPermissionStatus = async () => {
  const nativeModule = ensureNativeLocationModule();

  if (!nativeModule) {
    return {
      activity: "unavailable",
      background: "unavailable",
      foreground: "unavailable",
    };
  }

  return nativeModule.getPermissionStatus();
};

export const openLocationSettings = () => {
  void Linking.openSettings();
};

const getPlaceGeofenceRegions = async () => {
  const [places, settings, reminders] = await Promise.all([
    listPlaces(),
    readLocationSettings(),
    listLocationReminders(),
  ]);

  if (!settings.locationReminders && !settings.placeTimeline && !settings.workHoursTracking) {
    return [];
  }

  const pendingPlaceIds = new Set(
    reminders
      .filter((reminder) => reminder.status === "pending")
      .map((reminder) => reminder.placeId),
  );

  return places
    .filter(
      (place) =>
        settings.placeTimeline ||
        settings.workHoursTracking ||
        pendingPlaceIds.has(place.id) ||
        (settings.homeArrivalSummary && place.type === "home"),
    )
    .map((place) => ({
      identifier: `place:${place.id}`,
      latitude: place.latitude,
      longitude: place.longitude,
      notifyOnEnter: true,
      notifyOnExit: true,
      radius: Math.max(50, place.radiusMeters || DEFAULT_RADIUS_METERS),
    }));
};

export const syncLocationGeofences = async () => {
  if (Platform.OS !== "android") {
    return [];
  }

  const regions = await getPlaceGeofenceRegions();
  const nativeModule = ensureNativeLocationModule();
  const places = await listPlaces();

  if (!regions.length) {
    await nativeModule?.stopTracking().catch(() => undefined);
    await updateDebugState({ registeredGeofences: [] });
    return [];
  }

  await nativeModule?.configurePlaces(places).catch((error) =>
    updateDebugState({
      lastGeofenceTrigger: `Native place sync failed: ${getErrorMessage(error)}`,
    }),
  );
  await drainNativeLocationEvents();

  const permissions = await nativeModule?.getPermissionStatus();
  const trackingEnabled = (await nativeModule?.isTrackingEnabled().catch(() => false)) ?? false;

  await updateDebugState({
    activityPermission: permissions?.activity || "unknown",
    backgroundPermission: permissions?.background || "unknown",
    foregroundPermission: permissions?.foreground || "unknown",
    registeredGeofences: regions.map((region) => region.identifier),
    trackingEnabled,
  });

  if (permissions?.foreground !== "granted") {
    await updateDebugState({ registeredGeofences: [] });
    return [];
  }

  await nativeModule?.startTracking();
  await updateDebugState({ trackingEnabled: true });

  return regions;
};

const addTimelineEvent = async (
  place: SavedPlace,
  eventType: LocationTriggerType,
  timestamp = nowIso(),
  durationMinutes?: number,
) => {
  const events = await listTimelineEvents();
  const lastEvent = events.find((event) => event.placeId === place.id);

  if (
    lastEvent?.eventType === eventType &&
    new Date(timestamp).getTime() - new Date(lastEvent.timestamp).getTime() < SAME_EVENT_COOLDOWN_MS
  ) {
    return lastEvent;
  }

  const previousEnter = events.find(
    (event) =>
      event.placeId === place.id &&
      event.eventType === "enter" &&
      (!lastEvent || lastEvent.eventType !== "exit" || event.timestamp > lastEvent.timestamp),
  );
  const resolvedDurationMinutes =
    durationMinutes ??
    (eventType === "exit" && previousEnter
      ? Math.max(
          1,
          Math.round(
            (new Date(timestamp).getTime() - new Date(previousEnter.timestamp).getTime()) /
              60000,
          ),
        )
      : undefined);
  const nextEvent: PlaceTimelineEvent = {
    durationMinutes: resolvedDurationMinutes,
    eventType,
    id: createId("place-event"),
    latitude: place.latitude,
    longitude: place.longitude,
    placeId: place.id,
    placeName: place.name,
    timestamp,
  };
  const { locationTimelineUrl } = getLocationUrls();
  const response = await request<SingleTimelineResponse>(locationTimelineUrl, "", {
    body: JSON.stringify(nextEvent),
    method: "POST",
  });
  const savedEvent = normalizeTimelineEvent(response.data);

  await updateDebugState({ lastTimelineEvent: savedEvent });

  return savedEvent;
};

const normalizeNativeTimestamp = (value: NativeLocationPayload["timestamp"]) => {
  if (typeof value === "number") {
    return new Date(value).toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? nowIso() : parsed.toISOString();
};

const getNativePlaceId = (event: NativeLocationPayload) => {
  if (event.placeId) {
    return event.placeId;
  }

  return `native:${event.latitude.toFixed(4)},${event.longitude.toFixed(4)}`;
};

const persistNativeTimelineEvent = async (event: NativeLocationPayload) => {
  if (!Number.isFinite(event.latitude) || !Number.isFinite(event.longitude)) {
    return null;
  }

  const timestamp = normalizeNativeTimestamp(event.timestamp);
  const nextEvent: PlaceTimelineEvent = {
    activity: event.activity || "unknown",
    address: event.address,
    city: event.city,
    country: event.country,
    durationMinutes: event.durationMinutes,
    eventType: event.eventType || "visit",
    id: event.id || createId("native-place-event"),
    latitude: event.latitude,
    locality: event.locality,
    longitude: event.longitude,
    placeId: getNativePlaceId(event),
    placeName:
      event.placeName ||
      event.locality ||
      event.city ||
      event.address ||
      "Current location",
    timestamp,
  };
  const { locationTimelineUrl } = getLocationUrls();
  const response = await request<SingleTimelineResponse>(locationTimelineUrl, "", {
    body: JSON.stringify(nextEvent),
    method: "POST",
  });
  const savedEvent = normalizeTimelineEvent(response.data);

  await updateDebugState({
    currentLocation: {
      latitude: savedEvent.latitude,
      longitude: savedEvent.longitude,
    },
    lastActivity: savedEvent.activity,
    lastTimelineEvent: savedEvent,
  });

  return savedEvent;
};

const drainNativeLocationEvents = async () => {
  const nativeModule = ensureNativeLocationModule();
  const events = (await nativeModule?.drainPendingEvents().catch(() => [])) ?? [];

  for (const event of events) {
    if (event.eventType === "enter" || event.eventType === "exit") {
      await handleGeofenceEvent({
        eventType: event.eventType,
        region: { identifier: `place:${event.placeId || ""}` },
      }).catch(() => persistNativeTimelineEvent(event));
      continue;
    }

    await persistNativeTimelineEvent(event).catch((error) =>
      updateDebugState({
        lastGeofenceTrigger: `Native timeline sync failed: ${getErrorMessage(error)}`,
      }),
    );
  }
};

const resolveAcceptedTransition = async (
  placeId: string,
  eventType: LocationTriggerType,
  timestamp: string,
) => {
  const state = await readGeofenceState();
  const placeState = state[placeId] || { inside: false };
  const eventTime = new Date(timestamp).getTime();
  const lastEventTime = placeState.lastEventAt ? new Date(placeState.lastEventAt).getTime() : 0;
  const isSameEvent = placeState.lastEventType === eventType;
  const elapsed = lastEventTime ? eventTime - lastEventTime : Number.POSITIVE_INFINITY;

  if (isSameEvent && elapsed < SAME_EVENT_COOLDOWN_MS) {
    return {
      accepted: false as const,
      reason: `Ignored duplicate ${eventType} within cooldown`,
      state,
    };
  }

  if (!isSameEvent && elapsed < TRANSITION_COOLDOWN_MS) {
    return {
      accepted: false as const,
      reason: `Ignored rapid ${placeState.lastEventType}->${eventType} transition`,
      state,
    };
  }

  if (eventType === "enter" && placeState.inside) {
    return {
      accepted: false as const,
      reason: "Ignored enter while already inside",
      state,
    };
  }

  if (eventType === "exit" && !placeState.inside) {
    return {
      accepted: false as const,
      reason: "Ignored exit without a prior enter",
      state,
    };
  }

  const nextPlaceState: GeofencePlaceState = {
    inside: eventType === "enter",
    lastEnterAt: eventType === "enter" ? timestamp : placeState.lastEnterAt,
    lastEventAt: timestamp,
    lastEventType: eventType,
  };
  const durationMinutes =
    eventType === "exit" && placeState.lastEnterAt
      ? Math.max(
          1,
          Math.round((eventTime - new Date(placeState.lastEnterAt).getTime()) / 60000),
        )
      : undefined;
  const nextState = {
    ...state,
    [placeId]: nextPlaceState,
  };

  await writeGeofenceState(nextState);

  return {
    accepted: true as const,
    durationMinutes,
    state: nextState,
  };
};

export const getTimelineByRange = async (
  range: "today" | "yesterday" | "week" | "month",
) => {
  const { locationTimelineUrl } = getLocationUrls();
  const response = await request<ListTimelineResponse>(
    locationTimelineUrl,
    `?range=${encodeURIComponent(range)}`,
  );
  return response.data.map(normalizeTimelineEvent);
};

export const getTimelineByDate = async (dateKey: string) => {
  const { locationTimelineUrl } = getLocationUrls();
  const response = await request<ListTimelineResponse>(
    locationTimelineUrl,
    `?date=${encodeURIComponent(dateKey)}`,
  );
  return response.data.map(normalizeTimelineEvent);
};

export const getWorkHoursSummary = async (): Promise<WorkHoursSummary> => {
  const [places, events] = await Promise.all([listPlaces(), listTimelineEvents()]);
  const office = places.find((place) => place.type === "office");

  if (!office) {
    return { arrivedAt: null, leftAt: null, todayMinutes: 0, weekMinutes: 0 };
  }

  const now = new Date();
  const todayKey = getDateKey(now);
  const weekStart = getWeekStart(now).getTime();
  let todayMinutes = 0;
  let weekMinutes = 0;
  let arrivedAt: string | null = null;
  let leftAt: string | null = null;
  const sorted = [...events]
    .filter((event) => event.placeId === office.id)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  let openEnter: PlaceTimelineEvent | null = null;

  sorted.forEach((event) => {
    const eventTime = new Date(event.timestamp).getTime();

    if (event.eventType === "enter") {
      openEnter = event;

      if (getDateKey(new Date(event.timestamp)) === todayKey) {
        arrivedAt = event.timestamp;
      }
      return;
    }

    if (!openEnter || event.eventType !== "exit") {
      return;
    }

    const minutes =
      event.durationMinutes ||
      Math.max(1, Math.round((eventTime - new Date(openEnter.timestamp).getTime()) / 60000));

    if (getDateKey(new Date(event.timestamp)) === todayKey) {
      todayMinutes += minutes;
      leftAt = event.timestamp;
    }

    if (eventTime >= weekStart) {
      weekMinutes += minutes;
    }

    openEnter = null;
  });

  return { arrivedAt, leftAt, todayMinutes, weekMinutes };
};

export const getFrequentPlaceSuggestions = async () => {
  const [places, events] = await Promise.all([listPlaces(), listTimelineEvents()]);

  return places
    .map((place) => {
      const placeEvents = events.filter((event) => event.placeId === place.id);
      const enterEvents = placeEvents.filter((event) => event.eventType === "enter");
      const overnightVisits = enterEvents.filter((event) => {
        const hour = new Date(event.timestamp).getHours();
        return hour >= 21 || hour <= 6;
      }).length;
      const weekdayDayVisits = enterEvents.filter((event) => {
        const date = new Date(event.timestamp);
        const day = date.getDay();
        const hour = date.getHours();
        return day >= 1 && day <= 5 && hour >= 9 && hour <= 18;
      }).length;
      const eveningGymVisits = placeEvents.filter(
        (event) =>
          event.eventType === "exit" &&
          (event.durationMinutes || 0) >= 30 &&
          (event.durationMinutes || 0) <= 90 &&
          new Date(event.timestamp).getHours() >= 17,
      ).length;

      if (place.type !== "custom") {
        return null;
      }

      if (overnightVisits >= 2) {
        return `You stayed near ${place.name} overnight multiple times. Save it as Home?`;
      }

      if (weekdayDayVisits >= 3) {
        return `You visit ${place.name} often on weekdays. Save it as Office?`;
      }

      if (eveningGymVisits >= 3) {
        return `You often spend 30-90 minutes at ${place.name} in the evening. Save it as Gym?`;
      }

      return null;
    })
    .filter(Boolean) as string[];
};

export const listSuggestedPlaces = async (): Promise<SuggestedPlace[]> => {
  const [places, events, ignoredIds] = await Promise.all([
    listPlaces(),
    listTimelineEvents(),
    readJson<string[]>(SUGGESTED_PLACE_IGNORES_KEY, []),
  ]);
  const ignored = new Set(ignoredIds);
  const clusters = new Map<
    string,
    {
      events: PlaceTimelineEvent[];
      totalDuration: number;
    }
  >();

  events.forEach((event) => {
    if (!Number.isFinite(event.latitude) || !Number.isFinite(event.longitude)) {
      return;
    }

    const durationMinutes = event.durationMinutes || 0;
    const isUnknownVisit =
      event.eventType === "visit" ||
      event.eventType === "dwell" ||
      event.placeId.startsWith("native:");
    const isMovingActivity =
      event.activity === "walking" ||
      event.activity === "running" ||
      event.activity === "cycling" ||
      event.activity === "driving";
    const nearestSavedPlace = places
      .map((place) => ({
        distance: getDistanceMeters(event, place),
        place,
      }))
      .sort((a, b) => a.distance - b.distance)[0];
    const isNearSavedPlace =
      nearestSavedPlace &&
      nearestSavedPlace.distance <=
        Math.max(nearestSavedPlace.place.radiusMeters + 50, SUGGESTED_PLACE_RADIUS_METERS);

    if (
      !isUnknownVisit ||
      isMovingActivity ||
      durationMinutes < SUGGESTED_PLACE_MIN_DURATION_MINUTES ||
      isNearSavedPlace
    ) {
      return;
    }

    const id = getSuggestedPlaceClusterId(event);

    if (ignored.has(id)) {
      return;
    }

    const current = clusters.get(id) || { events: [], totalDuration: 0 };

    current.events.push(event);
    current.totalDuration += durationMinutes;
    clusters.set(id, current);
  });

  return [...clusters.entries()]
    .map(([id, cluster]) => {
      const sorted = [...cluster.events].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );
      const latest = sorted[0];

      return {
        address: latest.address,
        city: latest.city,
        country: latest.country,
        durationMinutes: Math.max(1, Math.round(cluster.totalDuration)),
        eventCount: cluster.events.length,
        id,
        lastSeenAt: latest.timestamp,
        latitude: latest.latitude,
        locality: latest.locality,
        longitude: latest.longitude,
        name: getSuggestedPlaceName(latest),
        radiusMeters: SUGGESTED_PLACE_RADIUS_METERS,
      };
    })
    .sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime())
    .slice(0, 8);
};

export const ignoreSuggestedPlace = async (id: string) => {
  const ignoredIds = await readJson<string[]>(SUGGESTED_PLACE_IGNORES_KEY, []);

  if (ignoredIds.includes(id)) {
    return;
  }

  await writeJson(SUGGESTED_PLACE_IGNORES_KEY, [...ignoredIds, id]);
};

export const findNearestPlace = async (coords: { latitude: number; longitude: number }) => {
  const places = await listPlaces();
  const withDistance = places
    .map((place) => ({
      distance: getDistanceMeters(coords, place),
      place,
    }))
    .sort((a, b) => a.distance - b.distance);

  return withDistance[0] || null;
};

export const parseLocationReminderRequest = async (input: string) => {
  const normalized = input.toLowerCase();
  const hasAtLocationCue = /\bat\s+(?!\d{1,2}(?::[0-5]\d)?\s*(?:am|pm)?\b)[a-z0-9][a-z0-9 -]*/i.test(input);
  const triggerType: LocationTriggerType | null =
    /\b(?:leave|leaving|left|exit|go out of)\b/.test(normalized)
      ? "exit"
      : /\b(?:reach|reaching|arrive|arriving|go to|get to|near)\b/.test(normalized) || hasAtLocationCue
        ? "enter"
        : null;

  if (!triggerType) {
    return null;
  }

  const places = await listPlaces();
  const place = places.find((item) => {
    const name = item.name.toLowerCase();
    return normalized.includes(name) || normalized.includes(item.type);
  });

  if (!place) {
    return {
      missingPlace: true as const,
      placeName:
        normalized.match(/\b(?:home|office|gym|mall)\b/)?.[0] ||
        normalized.match(/\b(?:reach|go to|leave|near)\s+([a-z0-9 -]+)/)?.[1]?.trim() ||
        normalized.match(/\bat\s+(?!\d{1,2}(?::[0-5]\d)?\s*(?:am|pm)?\b)([a-z0-9 -]+)/)?.[1]?.trim() ||
        "",
      triggerType,
    };
  }

  return {
    description: input
      .replace(/\b(?:when i|when)\b/i, "")
      .replace(/\b(?:reach|go to|get to|arrive at|leave|near)\b\s+[a-z0-9 -]+,?/i, "")
      .replace(/\bat\s+(?!\d{1,2}(?::[0-5]\d)?\s*(?:am|pm)?\b)[a-z0-9 -]+,?/i, "")
      .replace(/\bremind me to\b/i, "")
      .trim()
      .replace(/^[,.\s]+/, "") || input.trim(),
    missingPlace: false as const,
    place,
    triggerType,
  };
};

const handleGeofenceEvent = async (data: {
  eventType?: LocationTriggerType | "dwell";
  region?: { identifier?: string };
  testMode?: boolean;
}) => {
  const placeId = data.region?.identifier?.replace(/^place:/, "");

  if (!placeId) {
    return;
  }

  const eventType: LocationTriggerType = data.eventType === "exit" ? "exit" : "enter";
  const [places, reminders, settings] = await Promise.all([
    listPlaces(),
    listLocationReminders(),
    readLocationSettings(),
  ]);
  const place = places.find((item) => item.id === placeId);

  if (!place) {
    return;
  }

  const timestamp = nowIso();
  const transition = data.testMode
    ? { accepted: true as const, durationMinutes: undefined }
    : await resolveAcceptedTransition(place.id, eventType, timestamp);

  await updateDebugState({
    lastGeofenceTrigger: transition.accepted
      ? `${timestamp} ${data.testMode ? "test " : ""}${eventType} ${place.name}`
      : `${timestamp} ignored ${eventType} ${place.name}: ${transition.reason}`,
  });

  if (!transition.accepted) {
    return;
  }

  if (settings.placeTimeline || settings.workHoursTracking) {
    try {
      await addTimelineEvent(place, eventType, timestamp, transition.durationMinutes);
    } catch (error) {
      await updateDebugState({
        lastGeofenceTrigger: `${timestamp} ${eventType} ${place.name}: timeline sync failed (${getErrorMessage(error)})`,
      });
    }
  }

  const matchingReminders = reminders.filter(
    (reminder) =>
      reminder.status === "pending" &&
      reminder.placeId === place.id &&
      reminder.triggerType === eventType,
  );

  if (matchingReminders.length) {
    const nextReminders = reminders.map((reminder) => {
      if (!matchingReminders.some((item) => item.id === reminder.id)) {
        return reminder;
      }

      return {
        ...reminder,
        status: "triggered" as const,
        triggeredAt: timestamp,
        updatedAt: timestamp,
      };
    });

    await Promise.all(
      nextReminders
        .filter((reminder) => matchingReminders.some((item) => item.id === reminder.id))
        .map((reminder) =>
          updateMemory(reminder.memoryId || reminder.id, {
            status: "triggered",
            triggeredAt: timestamp,
          }).catch((error) =>
            updateDebugState({
              lastGeofenceTrigger: `${timestamp} ${eventType} ${place.name}: reminder sync failed (${getErrorMessage(error)})`,
            }),
          ),
        ),
    );
    await Promise.all(
      matchingReminders.map((reminder) =>
        scheduleLocationReminderNotification({
          body:
            eventType === "exit"
              ? `You left ${place.name}. ${reminder.description}`
              : `You're near ${place.name}. ${reminder.description}`,
          reminderId: reminder.id,
        }),
      ),
    );
  }

  if (settings.homeArrivalSummary && eventType === "enter" && place.type === "home") {
    const pendingCount = reminders.filter((reminder) => reminder.status === "pending").length;
    await scheduleLocationReminderNotification({
      body: `Welcome back. Today: ${pendingCount} reminder${
        pendingCount === 1 ? "" : "s"
      } pending.`,
      reminderId: "home-arrival-summary",
      title: "Welcome back",
    });
  }

  await syncLocationGeofences().catch((error) =>
    updateDebugState({
      lastGeofenceTrigger: `${timestamp} ${eventType} ${place.name}: geofence refresh failed (${getErrorMessage(error)})`,
    }),
  );
};

export const triggerLocationReminderTest = async (
  placeId: string,
  eventType: LocationTriggerType = "enter",
) => {
  await handleGeofenceEvent({
    eventType,
    region: {
      identifier: `place:${placeId}`,
    },
    testMode: true,
  });
};

const registerNativeLocationListeners = () => {
  if (Platform.OS !== "android" || !nativeLocationModule) {
    return;
  }

  const emitter = new NativeEventEmitter(nativeLocationModule as never);
  emitter.addListener("locationChanged", (event: NativeLocationPayload) => {
    void persistNativeTimelineEvent(event).catch((error) =>
      updateDebugState({
        lastGeofenceTrigger: `Native location event skipped: ${getErrorMessage(error)}`,
      }),
    );
  });
  emitter.addListener("enteredPlace", (event: NativeLocationPayload) => {
    void handleGeofenceEvent({
      eventType: event.eventType === "dwell" ? "enter" : "enter",
      region: { identifier: `place:${event.placeId || ""}` },
    });
  });
  emitter.addListener("leftPlace", (event: NativeLocationPayload) => {
    void handleGeofenceEvent({
      eventType: "exit",
      region: { identifier: `place:${event.placeId || ""}` },
    });
  });
  emitter.addListener("activityChanged", (event: { activity?: string }) => {
    void updateDebugState({ lastActivity: event.activity || "unknown" });
  });
};

export const startTracking = async () => {
  const places = await listPlaces();
  const nativeModule = ensureNativeLocationModule();
  await nativeModule?.configurePlaces(places);
  return (await nativeModule?.startTracking()) ?? false;
};

export const stopTracking = async () => {
  const nativeModule = ensureNativeLocationModule();
  return (await nativeModule?.stopTracking()) ?? false;
};

export const isTrackingEnabled = async () => {
  const nativeModule = ensureNativeLocationModule();
  return (await nativeModule?.isTrackingEnabled()) ?? false;
};

export const getLastKnownLocation = async () => {
  const nativeModule = ensureNativeLocationModule();
  return nativeModule?.getLastKnownLocation() ?? null;
};

export const getTimeline = async () => {
  const nativeModule = ensureNativeLocationModule();
  return nativeModule?.getTimeline() ?? [];
};

export const getNearbySavedPlace = async (coords: { latitude: number; longitude: number }) => {
  const nativeModule = ensureNativeLocationModule();
  return nativeModule?.getNearbySavedPlace(coords) ?? null;
};

registerNativeLocationListeners();
void clearLegacyLocalLocationData();
