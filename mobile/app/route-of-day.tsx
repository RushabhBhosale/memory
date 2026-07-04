import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MapView, { Marker, Polyline, type Region } from "react-native-maps";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { StateView } from "../components/StateView";
import { getTimelineByDate } from "../services/locationIntelligence";
import {
  buildRouteOfDay,
  formatRouteDistance,
  formatRouteDuration,
  type RouteActivity,
  type RouteOfDay,
  type RouteSegment,
  type RouteVisit,
} from "../services/routeOfDay";
import { colors, subtleShadow } from "../styles/theme";

const DEFAULT_REGION: Region = {
  latitude: 19.076,
  latitudeDelta: 0.12,
  longitude: 72.8777,
  longitudeDelta: 0.12,
};

const dateTitleFormatter = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "long",
  year: "numeric",
});
const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

const routeColorByActivity: Record<RouteActivity, string> = {
  cycling: "#16A34A",
  driving: "#F97316",
  running: "#3B82F6",
  still: "#A3AAB6",
  unknown: colors.primary,
  walking: "#3B82F6",
};

const toDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;

const parseDateKey = (value?: string | string[]) => {
  const raw = Array.isArray(value) ? value[0] : value;

  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date();
  }

  const [year, month, day] = raw.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const formatTime = (value?: string) => (value ? timeFormatter.format(new Date(value)) : "--");

const getTransportVerb = (activity: RouteActivity) => {
  if (activity === "cycling") {
    return "Cycled";
  }

  if (activity === "driving") {
    return "Drove";
  }

  return "Walked";
};

const getPlaceIcon = (name: string) => {
  const normalized = name.toLowerCase();

  if (normalized.includes("home")) {
    return "home-outline";
  }

  if (normalized.includes("office") || normalized.includes("work")) {
    return "briefcase-outline";
  }

  if (normalized.includes("mall") || normalized.includes("store")) {
    return "bag-outline";
  }

  if (normalized.includes("station")) {
    return "train-outline";
  }

  return "location-outline";
};

const createEmptyRoute = (date: Date): RouteOfDay => buildRouteOfDay([], date);

export default function RouteOfDayScreen() {
  const params = useLocalSearchParams<{ date?: string }>();
  const [selectedDate, setSelectedDate] = useState(() => parseDateKey(params.date));
  const [route, setRoute] = useState<RouteOfDay>(() => createEmptyRoute(selectedDate));
  const [loading, setLoading] = useState(true);
  const [revealCount, setRevealCount] = useState(1);
  const [replayIndex, setReplayIndex] = useState<number | null>(null);
  const [replaySpeed, setReplaySpeed] = useState(1);
  const mapRef = useRef<MapView | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);
  const heroProgress = useSharedValue(0);

  const dateKey = useMemo(() => toDateKey(selectedDate), [selectedDate]);
  const replayVisit = replayIndex === null ? null : route.visits[replayIndex];

  const heroStyle = useAnimatedStyle(() => ({
    opacity: heroProgress.value,
    transform: [{ translateY: (1 - heroProgress.value) * 18 }],
  }));

  const loadRoute = useCallback(async () => {
    try {
      setLoading(true);
      const events = await getTimelineByDate(dateKey);
      const nextRoute = buildRouteOfDay(events, selectedDate);

      setRoute(nextRoute);
      setRevealCount(1);
      setReplayIndex(null);
      heroProgress.value = 0;
      heroProgress.value = withTiming(1, { duration: 480 });
    } finally {
      setLoading(false);
    }
  }, [dateKey, heroProgress, selectedDate]);

  useEffect(() => {
    void loadRoute();
  }, [loadRoute]);

  useEffect(() => {
    if (!route.coordinates.length) {
      return;
    }

    const timer = setInterval(() => {
      setRevealCount((current) => {
        if (current >= route.coordinates.length) {
          clearInterval(timer);
          return current;
        }

        return current + 1;
      });
    }, 120);

    return () => clearInterval(timer);
  }, [route.coordinates]);

  useEffect(() => {
    if (route.coordinates.length < 2) {
      return;
    }

    requestAnimationFrame(() => {
      mapRef.current?.fitToCoordinates(route.coordinates, {
        animated: true,
        edgePadding: {
          bottom: 80,
          left: 52,
          right: 52,
          top: 80,
        },
      });
    });
  }, [route.coordinates]);

  useEffect(() => {
    if (replayIndex === null || replayIndex >= route.visits.length) {
      return;
    }

    const visit = route.visits[replayIndex];
    mapRef.current?.animateCamera(
      {
        center: {
          latitude: visit.latitude,
          longitude: visit.longitude,
        },
        zoom: 14,
      },
      { duration: 520 },
    );
    scrollRef.current?.scrollTo({ animated: true, y: 560 + replayIndex * 110 });

    const timer = setTimeout(() => {
      setReplayIndex((current) => {
        if (current === null || current >= route.visits.length - 1) {
          return null;
        }

        return current + 1;
      });
    }, Math.max(450, 1300 / replaySpeed));

    return () => clearTimeout(timer);
  }, [replayIndex, replaySpeed, route.visits]);

  const shiftDay = (days: number) => {
    setSelectedDate((current) => addDays(current, days));
  };

  const shareRoute = async () => {
    const summary = [
      `Route of the Day - ${dateTitleFormatter.format(selectedDate)}`,
      `${route.stats.placesVisited} places`,
      `${formatRouteDistance(route.stats.totalDistanceMeters)} travelled`,
      `${formatRouteDuration(route.stats.totalMinutes)} total time`,
      ...route.visits.map((visit, index) => `${index + 1}. ${visit.placeName} ${formatTime(visit.arrivalAt)}`),
    ].join("\n");

    await Share.share({ message: summary, title: "Route of the Day" });
  };

  if (loading) {
    return (
      <SafeAreaView edges={["top"]} style={styles.screen}>
        <StateView title="Building your route" detail="Finding today's visits and movement." loading />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable style={styles.headerButton} onPress={() => router.back()}>
            <Ionicons color={colors.text} name="chevron-back" size={22} />
            <Text style={styles.backText}>Back</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Route of the Day</Text>
          <Pressable
            style={styles.headerIconButton}
            onPress={() => Alert.alert("Calendar", "Use the day controls below to browse routes.")}
          >
            <Ionicons color={colors.text} name="calendar-outline" size={20} />
          </Pressable>
        </View>

        <View style={styles.dateSwitcher}>
          <Pressable style={styles.dateButton} onPress={() => shiftDay(-1)}>
            <Ionicons color={colors.textMuted} name="chevron-back" size={17} />
          </Pressable>
          <Text style={styles.dateTitle}>{dateTitleFormatter.format(selectedDate)}</Text>
          <Pressable style={styles.dateButton} onPress={() => shiftDay(1)}>
            <Ionicons color={colors.textMuted} name="chevron-forward" size={17} />
          </Pressable>
        </View>

        <Animated.View style={[styles.summaryCard, heroStyle]}>
          <View style={styles.summaryMain}>
            <Text style={styles.summaryLabel}>Total Distance</Text>
            <Text style={styles.summaryDistance}>{formatRouteDistance(route.stats.totalDistanceMeters)}</Text>
          </View>
          <View style={styles.summaryGrid}>
            <SummaryMetric label="Total Time" value={formatRouteDuration(route.stats.totalMinutes)} />
            <SummaryMetric label="Driving" value={formatRouteDuration(route.stats.drivingMinutes)} />
            <SummaryMetric label="Walking" value={formatRouteDuration(route.stats.walkingMinutes)} />
            <SummaryMetric label="Places" value={`${route.stats.placesVisited} Places`} />
            <SummaryMetric label="Steps" value="--" />
          </View>
        </Animated.View>

        <View style={styles.mapCard}>
          {route.coordinates.length ? (
            <MapView
              ref={mapRef}
              initialRegion={
                route.coordinates[0]
                  ? {
                      latitude: route.coordinates[0].latitude,
                      latitudeDelta: 0.08,
                      longitude: route.coordinates[0].longitude,
                      longitudeDelta: 0.08,
                    }
                  : DEFAULT_REGION
              }
              style={styles.map}
            >
              {route.segments.slice(0, Math.max(0, revealCount - 1)).map((segment) => (
                <Polyline
                  key={segment.id}
                  coordinates={segment.coordinates}
                  strokeColor={routeColorByActivity[segment.activity]}
                  strokeWidth={6}
                />
              ))}
              {route.visits.map((visit, index) => (
                <Marker
                  key={visit.id}
                  coordinate={{ latitude: visit.latitude, longitude: visit.longitude }}
                  tracksViewChanges={false}
                >
                  <VisitMarker index={index} total={route.visits.length} active={replayIndex === index} />
                </Marker>
              ))}
              {replayVisit ? (
                <Marker
                  coordinate={{ latitude: replayVisit.latitude, longitude: replayVisit.longitude }}
                  tracksViewChanges
                >
                  <View style={styles.replayMarker}>
                    <Ionicons color={colors.white} name="navigate" size={15} />
                  </View>
                </Marker>
              ) : null}
            </MapView>
          ) : (
            <View style={styles.emptyMap}>
              <Ionicons color={colors.textSoft} name="map-outline" size={32} />
              <Text style={styles.emptyTitle}>No route for this day</Text>
              <Text style={styles.emptyCopy}>Meaningful visits will appear here after tracking records them.</Text>
            </View>
          )}
          <View style={styles.mapGlass}>
            <LegendItem color="#3B82F6" label="Walking" />
            <LegendItem color="#F97316" label="Driving" />
            <LegendItem color="#16A34A" label="Cycling" />
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Timeline</Text>
          <Text style={styles.sectionMeta}>{route.visits.length} stops</Text>
        </View>
        <View style={styles.timelineCard}>
          {route.visits.length ? (
            route.visits.map((visit, index) => (
              <View key={visit.id}>
                <VisitRow active={replayIndex === index} index={index} visit={visit} />
                {route.segments[index] ? <SegmentRow segment={route.segments[index]} /> : null}
              </View>
            ))
          ) : (
            <Text style={styles.emptyInline}>No stops detected for {dateTitleFormatter.format(selectedDate)}.</Text>
          )}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Statistics</Text>
          <Text style={styles.sectionMeta}>Movement and stays</Text>
        </View>
        <View style={styles.statsGrid}>
          <StatCard label="Longest stay" value={route.stats.longestStay?.placeName || "--"} detail={formatRouteDuration(route.stats.longestStay?.durationMinutes || 0)} />
          <StatCard label="Most visited" value={route.stats.longestStay?.placeName || "--"} detail="Today" />
          <StatCard label="Average speed" value={`${route.stats.averageSpeedKmh.toFixed(1)} km/h`} detail="Moving" />
          <StatCard label="Travel time" value={formatRouteDuration(route.stats.travelMinutes)} detail="Between places" />
          <StatCard label="Moving" value={formatRouteDuration(route.stats.movingMinutes)} detail="Estimated" />
          <StatCard label="Stationary" value={formatRouteDuration(route.stats.stationaryMinutes)} detail="Visits" />
        </View>

        <View style={styles.insightsCard}>
          <View style={styles.insightsHeader}>
            <View style={styles.insightsIcon}>
              <Ionicons color={colors.primary} name="sparkles-outline" size={18} />
            </View>
            <Text style={styles.sectionTitle}>Day Insights</Text>
          </View>
          {route.insights.length ? (
            route.insights.map((insight) => (
              <Text key={insight} style={styles.insightText}>
                {insight}
              </Text>
            ))
          ) : (
            <Text style={styles.emptyInline}>A richer route will unlock daily insights.</Text>
          )}
        </View>

        <View style={styles.shareCard}>
          <Pressable style={styles.shareButton} onPress={shareRoute}>
            <Ionicons color={colors.white} name="share-outline" size={18} />
            <Text style={styles.shareButtonText}>Share route</Text>
          </Pressable>
          <Pressable
            style={styles.exportButton}
            onPress={() => Alert.alert("Export image", "Image export is ready for the next native capture pass.")}
          >
            <Ionicons color={colors.primary} name="image-outline" size={18} />
            <Text style={styles.exportButtonText}>Image</Text>
          </Pressable>
          <Pressable
            style={styles.exportButton}
            onPress={() => Alert.alert("PDF summary", "PDF export can use this route summary layout next.")}
          >
            <Ionicons color={colors.primary} name="document-text-outline" size={18} />
            <Text style={styles.exportButtonText}>PDF</Text>
          </Pressable>
        </View>
      </ScrollView>

      <View style={styles.replayDock}>
        <Pressable
          disabled={!route.visits.length}
          style={[styles.replayButton, !route.visits.length && styles.disabledButton]}
          onPress={() => setReplayIndex(0)}
        >
          {replayIndex === null ? (
            <Ionicons color={colors.white} name="play" size={16} />
          ) : (
            <ActivityIndicator color={colors.white} size="small" />
          )}
          <Text style={styles.replayButtonText}>Replay My Day</Text>
        </Pressable>
        <View style={styles.speedControl}>
          {[1, 2, 4].map((speed) => (
            <Pressable
              key={speed}
              style={[styles.speedChip, replaySpeed === speed && styles.speedChipActive]}
              onPress={() => setReplaySpeed(speed)}
            >
              <Text style={[styles.speedText, replaySpeed === speed && styles.speedTextActive]}>{speed}x</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryMetric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function VisitMarker({ active, index, total }: { active: boolean; index: number; total: number }) {
  const isStart = index === 0;
  const isEnd = index === total - 1;

  return (
    <View
      style={[
        styles.marker,
        isStart && styles.startMarker,
        isEnd && styles.endMarker,
        active && styles.activeMarker,
      ]}
    >
      <Text style={styles.markerText}>{index + 1}</Text>
    </View>
  );
}

function VisitRow({ active, index, visit }: { active: boolean; index: number; visit: RouteVisit }) {
  return (
    <View style={[styles.visitRow, active && styles.activeVisitRow]}>
      <View style={styles.visitIndex}>
        <Text style={styles.visitIndexText}>{index + 1}</Text>
      </View>
      <View style={styles.visitIcon}>
        <Ionicons color={colors.primary} name={getPlaceIcon(visit.placeName)} size={18} />
      </View>
      <View style={styles.visitCopy}>
        <Text style={styles.visitName}>{visit.placeName}</Text>
        <Text style={styles.visitMeta}>
          {formatTime(visit.arrivalAt)}
          {visit.departureAt ? ` - ${formatTime(visit.departureAt)}` : ""}
          {visit.durationMinutes ? ` · Stayed ${formatRouteDuration(visit.durationMinutes)}` : ""}
        </Text>
        {visit.address ? <Text numberOfLines={1} style={styles.visitAddress}>{visit.address}</Text> : null}
      </View>
    </View>
  );
}

function SegmentRow({ segment }: { segment: RouteSegment }) {
  return (
    <View style={styles.segmentRow}>
      <View style={[styles.segmentLine, { backgroundColor: routeColorByActivity[segment.activity] }]} />
      <View style={styles.segmentPill}>
        <Text style={styles.segmentText}>{getTransportVerb(segment.activity)}</Text>
        <Text style={styles.segmentMeta}>
          {formatRouteDistance(segment.distanceMeters)} · {formatRouteDuration(segment.durationMinutes)}
        </Text>
      </View>
    </View>
  );
}

function StatCard({ detail, label, value }: { detail: string; label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.statValue}>{value}</Text>
      <Text style={styles.statDetail}>{detail}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  activeMarker: {
    transform: [{ scale: 1.18 }],
  },
  activeVisitRow: {
    backgroundColor: "#F8F5FF",
  },
  backText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  content: {
    paddingBottom: 118,
    paddingHorizontal: 18,
  },
  dateButton: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    width: 36,
    ...subtleShadow,
  },
  dateSwitcher: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 18,
    marginTop: 8,
  },
  dateTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "800",
    marginHorizontal: 14,
    minWidth: 170,
    textAlign: "center",
  },
  disabledButton: {
    opacity: 0.55,
  },
  emptyCopy: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
    textAlign: "center",
  },
  emptyInline: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  emptyMap: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 30,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "800",
    marginTop: 10,
  },
  endMarker: {
    backgroundColor: colors.danger,
  },
  exportButton: {
    alignItems: "center",
    backgroundColor: colors.accentSurface,
    borderRadius: 18,
    flexDirection: "row",
    gap: 7,
    minHeight: 44,
    paddingHorizontal: 15,
  },
  exportButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "800",
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 8,
    paddingTop: 6,
  },
  headerButton: {
    alignItems: "center",
    flexDirection: "row",
    height: 42,
    minWidth: 78,
  },
  headerIconButton: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: 21,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42,
    ...subtleShadow,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 19,
    fontWeight: "900",
  },
  insightText: {
    backgroundColor: "rgba(255,255,255,0.78)",
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
    padding: 13,
  },
  insightsCard: {
    backgroundColor: "#FAF8FF",
    borderColor: colors.border,
    borderRadius: 28,
    borderWidth: 1,
    marginTop: 18,
    padding: 16,
    ...subtleShadow,
  },
  insightsHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 9,
  },
  insightsIcon: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  legendDot: {
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  legendItem: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  legendText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "800",
  },
  map: {
    flex: 1,
  },
  mapCard: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 30,
    borderWidth: 1,
    height: 430,
    overflow: "hidden",
    ...subtleShadow,
  },
  mapGlass: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.86)",
    borderColor: "rgba(255,255,255,0.9)",
    borderRadius: 22,
    borderWidth: 1,
    bottom: 14,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    position: "absolute",
  },
  marker: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderColor: colors.white,
    borderRadius: 16,
    borderWidth: 3,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  markerText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: "900",
  },
  metricLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 3,
  },
  metricValue: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "900",
  },
  replayButton: {
    alignItems: "center",
    backgroundColor: colors.black,
    borderRadius: 24,
    flexDirection: "row",
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 18,
  },
  replayButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: "900",
  },
  replayDock: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.92)",
    borderColor: colors.border,
    borderRadius: 30,
    borderWidth: 1,
    bottom: 20,
    flexDirection: "row",
    gap: 10,
    padding: 8,
    position: "absolute",
    ...subtleShadow,
  },
  replayMarker: {
    alignItems: "center",
    backgroundColor: colors.black,
    borderColor: colors.white,
    borderRadius: 18,
    borderWidth: 3,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  sectionHeader: {
    alignItems: "flex-end",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
    marginTop: 24,
  },
  sectionMeta: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "800",
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "900",
  },
  segmentLine: {
    borderRadius: 2,
    height: 34,
    marginLeft: 14,
    width: 4,
  },
  segmentMeta: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 2,
  },
  segmentPill: {
    backgroundColor: colors.backgroundSoft,
    borderRadius: 18,
    marginLeft: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  segmentRow: {
    alignItems: "center",
    flexDirection: "row",
    paddingBottom: 6,
  },
  segmentText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900",
  },
  shareButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 18,
    flexDirection: "row",
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 16,
  },
  shareButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: "900",
  },
  shareCard: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
  },
  speedChip: {
    alignItems: "center",
    borderRadius: 15,
    height: 30,
    justifyContent: "center",
    width: 34,
  },
  speedChipActive: {
    backgroundColor: colors.black,
  },
  speedControl: {
    alignItems: "center",
    backgroundColor: colors.backgroundSoft,
    borderRadius: 20,
    flexDirection: "row",
    padding: 4,
  },
  speedText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "900",
  },
  speedTextActive: {
    color: colors.white,
  },
  startMarker: {
    backgroundColor: colors.success,
  },
  statCard: {
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    padding: 14,
    width: "48%",
    ...subtleShadow,
  },
  statDetail: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 5,
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "800",
  },
  statValue: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "900",
    marginTop: 5,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  summaryCard: {
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: 30,
    borderWidth: 1,
    marginBottom: 18,
    padding: 18,
    ...subtleShadow,
  },
  summaryDistance: {
    color: colors.text,
    fontSize: 42,
    fontWeight: "900",
    marginTop: 2,
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 16,
  },
  summaryLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "800",
  },
  summaryMain: {
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    paddingBottom: 14,
  },
  summaryMetric: {
    backgroundColor: colors.backgroundSoft,
    borderRadius: 20,
    minHeight: 74,
    padding: 12,
    width: "48%",
  },
  timelineCard: {
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: 26,
    borderWidth: 1,
    padding: 12,
    ...subtleShadow,
  },
  visitAddress: {
    color: colors.textSoft,
    fontSize: 12,
    marginTop: 3,
  },
  visitCopy: {
    flex: 1,
  },
  visitIcon: {
    alignItems: "center",
    backgroundColor: colors.accentSurface,
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    marginRight: 10,
    width: 36,
  },
  visitIndex: {
    alignItems: "center",
    backgroundColor: colors.black,
    borderRadius: 15,
    height: 30,
    justifyContent: "center",
    marginRight: 10,
    width: 30,
  },
  visitIndexText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: "900",
  },
  visitMeta: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 3,
  },
  visitName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
  },
  visitRow: {
    alignItems: "center",
    borderRadius: 20,
    flexDirection: "row",
    padding: 10,
  },
});
