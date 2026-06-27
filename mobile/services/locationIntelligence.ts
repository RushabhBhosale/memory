import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { Linking, Platform } from "react-native";

import { getApiConfig, listMemories, request, updateMemory } from "./api";
import { scheduleLocationReminderNotification } from "./notifications";

export type PlaceType = "home" | "office" | "gym" | "mall" | "custom";
export type LocationTriggerType = "enter" | "exit";
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
  eventType: LocationTriggerType;
  latitude: number;
  longitude: number;
  timestamp: string;
  durationMinutes?: number;
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
  currentLocation: { latitude: number; longitude: number } | null;
  registeredGeofences: string[];
  lastGeofenceTrigger: string;
  lastTimelineEvent: PlaceTimelineEvent | null;
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
const LOCATION_GEOFENCE_TASK = "memoryos-location-geofence";
const SETTINGS_KEY = "location:settings";
const DEBUG_KEY = "location:debug";
const GEOFENCE_STATE_KEY = "location:geofenceState";
const LEGACY_LOCAL_DATA_KEYS = ["location:places", "location:reminders", "location:timeline"];

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
  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  const currentLocation = {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
  };

  await updateDebugState({ currentLocation });

  return currentLocation;
};

export const requestLocationPermissionFlow = async () => {
  const foreground = await Location.requestForegroundPermissionsAsync();
  await updateDebugState({ foregroundPermission: foreground.status });

  if (foreground.status !== Location.PermissionStatus.GRANTED) {
    return { background: null, foreground };
  }

  const background = await Location.requestBackgroundPermissionsAsync();
  await updateDebugState({ backgroundPermission: background.status });

  return { background, foreground };
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

  if (!regions.length) {
    await Location.stopGeofencingAsync(LOCATION_GEOFENCE_TASK).catch(() => undefined);
    await updateDebugState({ registeredGeofences: [] });
    return [];
  }

  const backgroundPermission = await Location.getBackgroundPermissionsAsync();
  await updateDebugState({ backgroundPermission: backgroundPermission.status });

  if (backgroundPermission.status !== Location.PermissionStatus.GRANTED) {
    await updateDebugState({ registeredGeofences: [] });
    return [];
  }

  await Location.startGeofencingAsync(LOCATION_GEOFENCE_TASK, regions);
  await updateDebugState({ registeredGeofences: regions.map((region) => region.identifier) });

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
  eventType?: Location.GeofencingEventType;
  region?: { identifier?: string };
  testMode?: boolean;
}) => {
  const placeId = data.region?.identifier?.replace(/^place:/, "");

  if (!placeId) {
    return;
  }

  const eventType =
    data.eventType === Location.GeofencingEventType.Exit ? "exit" : "enter";
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
    eventType:
      eventType === "exit"
        ? Location.GeofencingEventType.Exit
        : Location.GeofencingEventType.Enter,
    region: {
      identifier: `place:${placeId}`,
    },
    testMode: true,
  });
};

export const registerLocationGeofenceTask = () => {
  if (TaskManager.isTaskDefined(LOCATION_GEOFENCE_TASK)) {
    return;
  }

  TaskManager.defineTask(LOCATION_GEOFENCE_TASK, async ({ data, error }) => {
    if (error) {
      await updateDebugState({ lastGeofenceTrigger: error.message });
      return;
    }

    try {
      await handleGeofenceEvent(
        data as {
          eventType?: Location.GeofencingEventType;
          region?: { identifier?: string };
        },
      );
    } catch (eventError) {
      await updateDebugState({
        lastGeofenceTrigger: `Geofence task skipped: ${getErrorMessage(eventError)}`,
      });
    }
  });
};

registerLocationGeofenceTask();
void clearLegacyLocalLocationData();
