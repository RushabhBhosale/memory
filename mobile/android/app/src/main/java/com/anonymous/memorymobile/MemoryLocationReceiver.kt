package com.anonymous.memorymobile

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.location.Geocoder
import com.google.android.gms.location.ActivityRecognitionResult
import com.google.android.gms.location.ActivityTransition
import com.google.android.gms.location.ActivityTransitionResult
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingEvent
import com.google.android.gms.location.LocationResult
import org.json.JSONObject
import java.util.Locale

class MemoryLocationReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      ACTION_LOCATION -> handleLocation(context, intent)
      ACTION_GEOFENCE -> handleGeofence(context, intent)
      ACTION_ACTIVITY -> handleActivity(context, intent)
    }
  }

  private fun handleLocation(context: Context, intent: Intent) {
    val location = LocationResult.extractResult(intent)?.lastLocation ?: return
    val now = System.currentTimeMillis()
    val locationJson = JSONObject()
      .put("latitude", location.latitude)
      .put("longitude", location.longitude)
      .put("accuracy", location.accuracy.toDouble())
      .put("timestamp", if (location.time > 0) location.time else now)
      .put("activity", MemoryLocationStore.getActivity(context))

    MemoryLocationStore.saveLastLocation(context, locationJson)

    if (!MemoryLocationStore.shouldSaveLocation(context, locationJson)) {
      return
    }

    val enriched = enrichLocation(context, locationJson)
    MemoryLocationStore.appendTimeline(context, enriched)
    MemoryLocationModule.emitFromAnyContext(context, "locationChanged", enriched)
    MemoryLocationModule.emitFromAnyContext(context, "timelineUpdated", enriched)
  }

  private fun handleGeofence(context: Context, intent: Intent) {
    val event = GeofencingEvent.fromIntent(intent) ?: return
    if (event.hasError()) return

    val eventType = when (event.geofenceTransition) {
      Geofence.GEOFENCE_TRANSITION_EXIT -> "exit"
      Geofence.GEOFENCE_TRANSITION_DWELL -> "dwell"
      else -> "enter"
    }
    val location = event.triggeringLocation
    val places = MemoryLocationStore.getPlaces(context)

    for (geofence in event.triggeringGeofences ?: emptyList()) {
      val placeId = geofence.requestId.removePrefix("place:")
      var place: JSONObject? = null
      for (index in 0 until places.length()) {
        val candidate = places.optJSONObject(index) ?: continue
        if (candidate.optString("id") == placeId) {
          place = candidate
          break
        }
      }

      val payload = JSONObject()
        .put("id", "native-geofence-${System.currentTimeMillis()}-$placeId")
        .put("placeId", placeId)
        .put("placeName", place?.optString("name") ?: placeId)
        .put("eventType", eventType)
        .put("latitude", location?.latitude ?: place?.optDouble("latitude") ?: 0.0)
        .put("longitude", location?.longitude ?: place?.optDouble("longitude") ?: 0.0)
        .put("timestamp", System.currentTimeMillis())
        .put("activity", MemoryLocationStore.getActivity(context))

      MemoryLocationStore.appendTimeline(context, payload)
      MemoryLocationModule.emitFromAnyContext(context, if (eventType == "exit") "leftPlace" else "enteredPlace", payload)
      MemoryLocationModule.emitFromAnyContext(context, "timelineUpdated", payload)
    }
  }

  private fun handleActivity(context: Context, intent: Intent) {
    if (ActivityTransitionResult.hasResult(intent)) {
      val result = ActivityTransitionResult.extractResult(intent) ?: return
      val latest = result.transitionEvents.lastOrNull() ?: return
      val activity =
        if (latest.activityType == com.google.android.gms.location.DetectedActivity.STILL &&
          latest.transitionType == ActivityTransition.ACTIVITY_TRANSITION_EXIT
        ) {
          "unknown"
        } else {
          MemoryLocationStore.activityName(latest.activityType)
        }
      MemoryLocationStore.saveActivity(context, activity)

      val payload = JSONObject()
        .put("activity", activity)
        .put("confidence", 100)
        .put("timestamp", System.currentTimeMillis())
        .put("transition", if (latest.transitionType == ActivityTransition.ACTIVITY_TRANSITION_EXIT) "exit" else "enter")

      MemoryLocationModule.emitFromAnyContext(context, "activityChanged", payload)
      MemoryLocationModule.refreshTrackingMode(context, activity)
      return
    }

    val result = ActivityRecognitionResult.extractResult(intent) ?: return
    val mostLikely = result.mostProbableActivity ?: return
    val activity = MemoryLocationStore.activityName(mostLikely.type)
    MemoryLocationStore.saveActivity(context, activity)

    val payload = JSONObject()
      .put("activity", activity)
      .put("confidence", mostLikely.confidence)
      .put("timestamp", System.currentTimeMillis())

    MemoryLocationModule.emitFromAnyContext(context, "activityChanged", payload)
    MemoryLocationModule.refreshTrackingMode(context, activity)
  }

  private fun enrichLocation(context: Context, base: JSONObject): JSONObject {
    val latitude = base.optDouble("latitude")
    val longitude = base.optDouble("longitude")
    val place = MemoryLocationStore.nearbyPlace(context, latitude, longitude)
    val address = reverseGeocode(context, latitude, longitude)
    val name = place?.takeIf { it.optDouble("distanceMeters", Double.MAX_VALUE) <= it.optDouble("radiusMeters", 50.0) }
      ?.optString("name")
      ?: address.optString("placeName", "Current location")

    return JSONObject(base.toString())
      .put("id", "native-location-${System.currentTimeMillis()}")
      .put("eventType", if (place != null && place.optDouble("distanceMeters") <= place.optDouble("radiusMeters", 50.0)) "dwell" else "visit")
      .put("placeId", place?.optString("id") ?: "")
      .put("placeName", name)
      .put("locality", address.optString("locality"))
      .put("city", address.optString("city"))
      .put("country", address.optString("country"))
      .put("address", address.optString("address"))
  }

  private fun reverseGeocode(context: Context, latitude: Double, longitude: Double): JSONObject {
    return try {
      val item = Geocoder(context, Locale.getDefault()).getFromLocation(latitude, longitude, 1)?.firstOrNull()
      JSONObject()
        .put("placeName", item?.featureName ?: item?.subLocality ?: item?.locality ?: "")
        .put("locality", item?.subLocality ?: item?.thoroughfare ?: "")
        .put("city", item?.locality ?: item?.subAdminArea ?: "")
        .put("country", item?.countryName ?: "")
        .put("address", item?.getAddressLine(0) ?: "")
    } catch (_: Exception) {
      JSONObject()
    }
  }

  companion object {
    const val ACTION_LOCATION = "com.anonymous.memorymobile.MEMORY_LOCATION"
    const val ACTION_GEOFENCE = "com.anonymous.memorymobile.MEMORY_GEOFENCE"
    const val ACTION_ACTIVITY = "com.anonymous.memorymobile.MEMORY_ACTIVITY"
  }
}
