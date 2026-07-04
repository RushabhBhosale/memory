package com.anonymous.memorymobile

import android.content.Context
import com.google.android.gms.location.DetectedActivity
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

object MemoryLocationStore {
  private const val PREFS = "memory_location"
  private const val KEY_TRACKING = "tracking"
  private const val KEY_PLACES = "places"
  private const val KEY_TIMELINE = "timeline"
  private const val KEY_PENDING = "pending_events"
  private const val KEY_LAST_LOCATION = "last_location"
  private const val KEY_LAST_SAVED_LOCATION = "last_saved_location"
  private const val KEY_LAST_ACTIVITY = "last_activity"
  const val MIN_DISTANCE_METERS = 50.0
  const val MIN_DWELL_MS = 5 * 60 * 1000L
  const val MAX_ACCURACY_METERS = 40f
  private const val GPS_JUMP_SPEED_MPS = 90.0

  fun isTracking(context: Context): Boolean =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_TRACKING, false)

  fun setTracking(context: Context, enabled: Boolean) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY_TRACKING, enabled).apply()
  }

  fun savePlaces(context: Context, places: JSONArray) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_PLACES, places.toString()).apply()
  }

  fun getPlaces(context: Context): JSONArray =
    JSONArray(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_PLACES, "[]") ?: "[]")

  fun saveActivity(context: Context, activity: String) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_LAST_ACTIVITY, activity).apply()
  }

  fun getActivity(context: Context): String =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_LAST_ACTIVITY, "unknown") ?: "unknown"

  fun getLastLocation(context: Context): JSONObject? {
    val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_LAST_LOCATION, null)
    return raw?.let { JSONObject(it) }
  }

  fun getLastSavedLocation(context: Context): JSONObject? {
    val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_LAST_SAVED_LOCATION, null)
    return raw?.let { JSONObject(it) }
  }

  fun saveLastLocation(context: Context, location: JSONObject) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_LAST_LOCATION, location.toString()).apply()
  }

  fun appendTimeline(context: Context, event: JSONObject) {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val events = JSONArray(prefs.getString(KEY_TIMELINE, "[]") ?: "[]")
    events.put(event)
    while (events.length() > 300) {
      events.remove(0)
    }
    prefs.edit()
      .putString(KEY_TIMELINE, events.toString())
      .putString(KEY_LAST_SAVED_LOCATION, event.toString())
      .apply()
    appendPending(context, event)
  }

  fun getTimeline(context: Context): JSONArray =
    JSONArray(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_TIMELINE, "[]") ?: "[]")

  fun drainPendingEvents(context: Context): JSONArray {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val events = JSONArray(prefs.getString(KEY_PENDING, "[]") ?: "[]")
    prefs.edit().putString(KEY_PENDING, "[]").apply()
    return events
  }

  private fun appendPending(context: Context, event: JSONObject) {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val events = JSONArray(prefs.getString(KEY_PENDING, "[]") ?: "[]")
    events.put(event)
    prefs.edit().putString(KEY_PENDING, events.toString()).apply()
  }

  fun shouldSaveLocation(context: Context, next: JSONObject): Boolean {
    val accuracy = next.optDouble("accuracy", 999.0)
    if (accuracy > MAX_ACCURACY_METERS) return false

    val last = getLastSavedLocation(context) ?: return true
    val distance = distanceMeters(
      last.optDouble("latitude"),
      last.optDouble("longitude"),
      next.optDouble("latitude"),
      next.optDouble("longitude")
    )
    val elapsed = next.optLong("timestamp") - last.optLong("timestamp")

    if (elapsed > 0) {
      val speed = distance / (elapsed / 1000.0)
      if (distance > 500 && speed > GPS_JUMP_SPEED_MPS) return false
    }

    if (distance >= MIN_DISTANCE_METERS) return true
    return elapsed >= MIN_DWELL_MS
  }

  fun nearbyPlace(context: Context, latitude: Double, longitude: Double): JSONObject? {
    val places = getPlaces(context)
    var nearest: JSONObject? = null
    var nearestDistance = Double.MAX_VALUE

    for (index in 0 until places.length()) {
      val place = places.optJSONObject(index) ?: continue
      val distance = distanceMeters(latitude, longitude, place.optDouble("latitude"), place.optDouble("longitude"))
      if (distance < nearestDistance) {
        nearest = place
        nearestDistance = distance
      }
    }

    return nearest?.let {
      JSONObject(it.toString()).put("distanceMeters", nearestDistance)
    }
  }

  fun activityName(type: Int): String =
    when (type) {
      DetectedActivity.WALKING, DetectedActivity.ON_FOOT -> "walking"
      DetectedActivity.RUNNING -> "running"
      DetectedActivity.ON_BICYCLE -> "cycling"
      DetectedActivity.IN_VEHICLE -> "driving"
      DetectedActivity.STILL -> "still"
      else -> "unknown"
    }

  fun distanceMeters(aLat: Double, aLon: Double, bLat: Double, bLon: Double): Double {
    val earthRadius = 6371000.0
    val lat1 = Math.toRadians(aLat)
    val lat2 = Math.toRadians(bLat)
    val deltaLat = Math.toRadians(bLat - aLat)
    val deltaLon = Math.toRadians(bLon - aLon)
    val h = sin(deltaLat / 2).pow(2.0) + cos(lat1) * cos(lat2) * sin(deltaLon / 2).pow(2.0)
    return 2 * earthRadius * atan2(sqrt(h), sqrt(1 - h))
  }
}
