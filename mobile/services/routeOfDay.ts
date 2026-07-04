import { distanceMeters, type PlaceTimelineEvent } from "./locationIntelligence";

export type RouteActivity = "walking" | "running" | "cycling" | "driving" | "still" | "unknown";

export type RouteVisit = {
  id: string;
  placeId: string;
  placeName: string;
  latitude: number;
  longitude: number;
  arrivalAt: string;
  departureAt?: string;
  durationMinutes: number;
  activity: RouteActivity;
  address?: string;
};

export type RouteSegment = {
  id: string;
  fromVisitId: string;
  toVisitId: string;
  activity: RouteActivity;
  distanceMeters: number;
  durationMinutes: number;
  coordinates: Array<{ latitude: number; longitude: number }>;
};

export type RouteStats = {
  averageSpeedKmh: number;
  drivingMinutes: number;
  longestStay?: RouteVisit;
  movingMinutes: number;
  placesVisited: number;
  stationaryMinutes: number;
  totalDistanceMeters: number;
  totalMinutes: number;
  travelMinutes: number;
  walkingMinutes: number;
};

export type RouteOfDay = {
  dateKey: string;
  visits: RouteVisit[];
  segments: RouteSegment[];
  coordinates: Array<{ latitude: number; longitude: number }>;
  stats: RouteStats;
  insights: string[];
};

const VISIT_RADIUS_METERS = 80;
const MIN_MOVE_METERS = 50;
const MIN_VISIT_MINUTES = 5;

const getDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;

const minutesBetween = (start: string, end?: string) => {
  if (!end) {
    return 0;
  }

  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
};

const chooseActivity = (activity?: RouteActivity): RouteActivity =>
  activity === "running" ? "walking" : activity || "unknown";

const formatDistance = (meters: number) => {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(meters >= 10000 ? 0 : 1)} km`;
  }

  return `${Math.round(meters)} m`;
};

export const formatRouteDistance = formatDistance;

export const formatRouteDuration = (minutes: number) => {
  const rounded = Math.max(0, Math.round(minutes));
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;

  if (hours && mins) {
    return `${hours}h ${mins}m`;
  }

  if (hours) {
    return `${hours}h`;
  }

  return `${mins}m`;
};

const filterMeaningfulEvents = (events: PlaceTimelineEvent[]) => {
  const sorted = [...events]
    .filter((event) => Number.isFinite(event.latitude) && Number.isFinite(event.longitude))
    .filter((event) => !("accuracy" in event) || Number((event as { accuracy?: number }).accuracy) <= 40)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const result: PlaceTimelineEvent[] = [];

  sorted.forEach((event) => {
    const last = result[result.length - 1];

    if (!last) {
      result.push(event);
      return;
    }

    const distance = distanceMeters(event, last);
    const elapsedMinutes = minutesBetween(last.timestamp, event.timestamp);

    if (
      event.placeId === last.placeId &&
      distance < VISIT_RADIUS_METERS &&
      elapsedMinutes < MIN_VISIT_MINUTES
    ) {
      return;
    }

    if (distance < MIN_MOVE_METERS && elapsedMinutes < MIN_VISIT_MINUTES) {
      return;
    }

    result.push(event);
  });

  return result;
};

const buildVisits = (events: PlaceTimelineEvent[]): RouteVisit[] => {
  const visits: RouteVisit[] = [];

  events.forEach((event) => {
    const previous = visits[visits.length - 1];
    const samePlace =
      previous &&
      (previous.placeId === event.placeId ||
        distanceMeters(previous, event) <= VISIT_RADIUS_METERS);

    if (samePlace) {
      previous.departureAt = event.timestamp;
      previous.durationMinutes = Math.max(
        previous.durationMinutes,
        event.durationMinutes || minutesBetween(previous.arrivalAt, event.timestamp),
      );
      previous.activity = chooseActivity(event.activity || previous.activity);
      return;
    }

    if (previous && !previous.departureAt) {
      previous.departureAt = event.timestamp;
      previous.durationMinutes = Math.max(
        previous.durationMinutes,
        minutesBetween(previous.arrivalAt, event.timestamp),
      );
    }

    visits.push({
      activity: chooseActivity(event.activity),
      address: event.address,
      arrivalAt: event.timestamp,
      departureAt: event.eventType === "exit" ? event.timestamp : undefined,
      durationMinutes: event.durationMinutes || 0,
      id: event.id,
      latitude: event.latitude,
      longitude: event.longitude,
      placeId: event.placeId,
      placeName: event.placeName,
    });
  });

  return visits.map((visit, index) => {
    const next = visits[index + 1];
    const duration = visit.durationMinutes || minutesBetween(visit.arrivalAt, visit.departureAt || next?.arrivalAt);

    return {
      ...visit,
      durationMinutes: duration >= MIN_VISIT_MINUTES ? duration : 0,
    };
  });
};

const buildSegments = (visits: RouteVisit[]) =>
  visits.slice(1).map((visit, index) => {
    const previous = visits[index];
    const distance = distanceMeters(previous, visit);
    const duration = minutesBetween(previous.departureAt || previous.arrivalAt, visit.arrivalAt);
    const activity = chooseActivity(visit.activity === "still" ? previous.activity : visit.activity);

    return {
      activity: activity === "unknown" ? (distance > 1000 ? "driving" : "walking") : activity,
      coordinates: [
        { latitude: previous.latitude, longitude: previous.longitude },
        { latitude: visit.latitude, longitude: visit.longitude },
      ],
      distanceMeters: distance,
      durationMinutes: duration,
      fromVisitId: previous.id,
      id: `${previous.id}-${visit.id}`,
      toVisitId: visit.id,
    };
  });

const getInsights = (route: Omit<RouteOfDay, "insights">) => {
  const insights: string[] = [];
  const longestStay = route.stats.longestStay;
  const first = route.visits[0];

  if (longestStay) {
    insights.push(`You spent most of your day at ${longestStay.placeName}.`);
  }

  if (route.stats.placesVisited) {
    insights.push(`You visited ${route.stats.placesVisited} places today.`);
  }

  if (route.stats.totalDistanceMeters > 0) {
    insights.push(`You travelled ${formatDistance(route.stats.totalDistanceMeters)}.`);
  }

  if (first) {
    insights.push(`You left ${first.placeName} around ${new Date(first.arrivalAt).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    })}.`);
  }

  if (route.stats.drivingMinutes > route.stats.walkingMinutes) {
    insights.push("Most of your moving time was spent driving.");
  }

  return insights;
};

export const buildRouteOfDay = (events: PlaceTimelineEvent[], date = new Date()): RouteOfDay => {
  const dateKey = getDateKey(date);
  const filtered = filterMeaningfulEvents(events);
  const visits = buildVisits(filtered);
  const segments = buildSegments(visits);
  const totalDistanceMeters = segments.reduce((total, segment) => total + segment.distanceMeters, 0);
  const travelMinutes = segments.reduce((total, segment) => total + segment.durationMinutes, 0);
  const drivingMinutes = segments
    .filter((segment) => segment.activity === "driving")
    .reduce((total, segment) => total + segment.durationMinutes, 0);
  const walkingMinutes = segments
    .filter((segment) => segment.activity === "walking" || segment.activity === "running")
    .reduce((total, segment) => total + segment.durationMinutes, 0);
  const stationaryMinutes = visits.reduce((total, visit) => total + visit.durationMinutes, 0);
  const longestStay = [...visits].sort((a, b) => b.durationMinutes - a.durationMinutes)[0];
  const totalMinutes = visits.length
    ? minutesBetween(visits[0].arrivalAt, visits[visits.length - 1].departureAt || visits[visits.length - 1].arrivalAt)
    : 0;
  const stats: RouteStats = {
    averageSpeedKmh: travelMinutes ? (totalDistanceMeters / 1000) / (travelMinutes / 60) : 0,
    drivingMinutes,
    longestStay,
    movingMinutes: travelMinutes,
    placesVisited: new Set(visits.map((visit) => visit.placeId || visit.placeName)).size,
    stationaryMinutes,
    totalDistanceMeters,
    totalMinutes,
    travelMinutes,
    walkingMinutes,
  };
  const route = {
    coordinates: visits.map((visit) => ({
      latitude: visit.latitude,
      longitude: visit.longitude,
    })),
    dateKey,
    segments,
    stats,
    visits,
  };

  return {
    ...route,
    insights: getInsights(route),
  };
};
