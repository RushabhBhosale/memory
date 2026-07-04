package com.anonymous.memorymobile

import android.Manifest
import android.app.Activity
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Looper
import android.provider.Settings
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener
import com.google.android.gms.location.ActivityRecognition
import com.google.android.gms.location.ActivityRecognitionClient
import com.google.android.gms.location.ActivityTransition
import com.google.android.gms.location.ActivityTransitionRequest
import com.google.android.gms.location.DetectedActivity
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingClient
import com.google.android.gms.location.GeofencingRequest
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import org.json.JSONArray
import org.json.JSONObject
import java.lang.ref.WeakReference

class MemoryLocationModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext), PermissionListener {
  private val fusedClient = LocationServices.getFusedLocationProviderClient(reactContext)
  private val geofencingClient: GeofencingClient = LocationServices.getGeofencingClient(reactContext)
  private val activityClient: ActivityRecognitionClient = ActivityRecognition.getClient(reactContext)
  private var permissionPromise: Promise? = null

  override fun getName(): String = "MemoryLocationModule"

  init {
    activeModule = WeakReference(this)
  }

  @ReactMethod
  fun configurePlaces(places: ReadableArray, promise: Promise) {
    val json = JSONArray()
    for (index in 0 until places.size()) {
      val place = places.getMap(index) ?: continue
      json.put(JSONObject()
        .put("id", place.getString("id") ?: "")
        .put("name", place.getString("name") ?: "")
        .put("latitude", place.getDouble("latitude"))
        .put("longitude", place.getDouble("longitude"))
        .put("radiusMeters", if (place.hasKey("radiusMeters")) place.getDouble("radiusMeters") else 50.0)
        .put("type", place.getString("type") ?: "custom"))
    }
    MemoryLocationStore.savePlaces(reactContext, json)
    registerGeofences()
    promise.resolve(true)
  }

  @ReactMethod
  fun startTracking(promise: Promise) {
    if (!hasFineLocation()) {
      promise.reject("permission_missing", "Fine location permission is required.")
      return
    }

    MemoryLocationStore.setTracking(reactContext, true)
    requestLocationUpdates(MemoryLocationStore.getActivity(reactContext))
    registerGeofences()
    registerActivityUpdates()
    promise.resolve(true)
  }

  @ReactMethod
  fun stopTracking(promise: Promise) {
    MemoryLocationStore.setTracking(reactContext, false)
    fusedClient.removeLocationUpdates(locationPendingIntent())
    geofencingClient.removeGeofences(geofencePendingIntent())
    activityClient.removeActivityUpdates(activityPendingIntent())
    activityClient.removeActivityTransitionUpdates(activityPendingIntent())
    promise.resolve(true)
  }

  @ReactMethod
  fun isTrackingEnabled(promise: Promise) {
    promise.resolve(MemoryLocationStore.isTracking(reactContext))
  }

  @ReactMethod
  fun getLastKnownLocation(promise: Promise) {
    val item = MemoryLocationStore.getLastLocation(reactContext)
    promise.resolve(item?.toWritableMap())
  }

  @ReactMethod
  fun getCurrentLocation(promise: Promise) {
    if (!hasFineLocation()) {
      promise.reject("permission_missing", "Fine location permission is required.")
      return
    }

    fusedClient.getCurrentLocation(Priority.PRIORITY_BALANCED_POWER_ACCURACY, null)
      .addOnSuccessListener { location ->
        if (location == null) {
          promise.resolve(null)
          return@addOnSuccessListener
        }

        val payload = JSONObject()
          .put("latitude", location.latitude)
          .put("longitude", location.longitude)
          .put("accuracy", location.accuracy.toDouble())
          .put("timestamp", if (location.time > 0) location.time else System.currentTimeMillis())
          .put("activity", MemoryLocationStore.getActivity(reactContext))
        MemoryLocationStore.saveLastLocation(reactContext, payload)
        promise.resolve(payload.toWritableMap())
      }
      .addOnFailureListener { promise.reject("location_failed", it.message, it) }
  }

  @ReactMethod
  fun getTimeline(promise: Promise) {
    promise.resolve(MemoryLocationStore.getTimeline(reactContext).toWritableArray())
  }

  @ReactMethod
  fun drainPendingEvents(promise: Promise) {
    promise.resolve(MemoryLocationStore.drainPendingEvents(reactContext).toWritableArray())
  }

  @ReactMethod
  fun getNearbySavedPlace(location: ReadableMap, promise: Promise) {
    val place = MemoryLocationStore.nearbyPlace(
      reactContext,
      location.getDouble("latitude"),
      location.getDouble("longitude")
    )
    promise.resolve(place?.toWritableMap())
  }

  @ReactMethod
  fun getPermissionStatus(promise: Promise) {
    val payload = Arguments.createMap()
    payload.putString("foreground", if (hasFineLocation()) "granted" else "denied")
    payload.putString("background", if (hasBackgroundLocation()) "granted" else "denied")
    payload.putString("activity", if (hasActivityRecognition()) "granted" else "denied")
    promise.resolve(payload)
  }

  @ReactMethod
  fun requestPermissions(promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity !is PermissionAwareActivity) {
      promise.resolve(false)
      return
    }

    val permissions = mutableListOf(Manifest.permission.ACCESS_FINE_LOCATION)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      permissions.add(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      permissions.add(Manifest.permission.ACTIVITY_RECOGNITION)
    }

    permissionPromise = promise
    activity.requestPermissions(permissions.toTypedArray(), 4628, this)
  }

  @ReactMethod
  fun openBatteryOptimizationSettings() {
    val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
      data = Uri.parse("package:${reactContext.packageName}")
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    try {
      reactContext.startActivity(intent)
    } catch (_: Exception) {
      reactContext.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
  }

  @ReactMethod
  fun addListener(eventName: String) {
  }

  @ReactMethod
  fun removeListeners(count: Double) {
  }

  override fun onRequestPermissionsResult(
    requestCode: Int,
    permissions: Array<String>,
    grantResults: IntArray,
  ): Boolean {
    if (requestCode != 4628) return false
    permissionPromise?.resolve(grantResults.all { it == PackageManager.PERMISSION_GRANTED })
    permissionPromise = null
    return true
  }

  private fun requestLocationUpdates(activity: String) {
    if (!hasFineLocation() || !MemoryLocationStore.isTracking(reactContext)) return

    val moving = activity in setOf("walking", "running", "cycling", "driving", "unknown")
    val request = LocationRequest.Builder(
      if (moving) Priority.PRIORITY_HIGH_ACCURACY else Priority.PRIORITY_BALANCED_POWER_ACCURACY,
      if (moving) 2 * 60 * 1000L else 15 * 60 * 1000L
    )
      .setMinUpdateDistanceMeters(if (moving) 50f else 150f)
      .setMinUpdateIntervalMillis(if (moving) 60 * 1000L else 10 * 60 * 1000L)
      .setMaxUpdateDelayMillis(if (moving) 10 * 60 * 1000L else 60 * 60 * 1000L)
      .build()

    fusedClient.requestLocationUpdates(request, locationPendingIntent())
  }

  private fun registerActivityUpdates() {
    if (!hasActivityRecognition()) return
    activityClient.requestActivityUpdates(2 * 60 * 1000L, activityPendingIntent())
    activityClient.requestActivityTransitionUpdates(
      ActivityTransitionRequest(
        listOf(
          activityTransition(DetectedActivity.STILL, ActivityTransition.ACTIVITY_TRANSITION_EXIT),
          activityTransition(DetectedActivity.STILL, ActivityTransition.ACTIVITY_TRANSITION_ENTER),
          activityTransition(DetectedActivity.WALKING, ActivityTransition.ACTIVITY_TRANSITION_ENTER),
          activityTransition(DetectedActivity.RUNNING, ActivityTransition.ACTIVITY_TRANSITION_ENTER),
          activityTransition(DetectedActivity.ON_BICYCLE, ActivityTransition.ACTIVITY_TRANSITION_ENTER),
          activityTransition(DetectedActivity.IN_VEHICLE, ActivityTransition.ACTIVITY_TRANSITION_ENTER)
        )
      ),
      activityPendingIntent()
    )
  }

  private fun activityTransition(activityType: Int, transitionType: Int): ActivityTransition =
    ActivityTransition.Builder()
      .setActivityType(activityType)
      .setActivityTransition(transitionType)
      .build()

  private fun registerGeofences() {
    if (!hasFineLocation()) return
    val places = MemoryLocationStore.getPlaces(reactContext)
    if (places.length() == 0) return

    val geofences = mutableListOf<Geofence>()
    for (index in 0 until minOf(places.length(), 100)) {
      val place = places.optJSONObject(index) ?: continue
      val radius = place.optDouble("radiusMeters", 50.0).coerceAtLeast(50.0).toFloat()
      geofences.add(
        Geofence.Builder()
          .setRequestId("place:${place.optString("id")}")
          .setCircularRegion(place.optDouble("latitude"), place.optDouble("longitude"), radius)
          .setTransitionTypes(
            Geofence.GEOFENCE_TRANSITION_ENTER or
              Geofence.GEOFENCE_TRANSITION_EXIT or
              Geofence.GEOFENCE_TRANSITION_DWELL
          )
          .setLoiteringDelay(5 * 60 * 1000)
          .setExpirationDuration(Geofence.NEVER_EXPIRE)
          .build()
      )
    }

    val request = GeofencingRequest.Builder()
      .setInitialTrigger(GeofencingRequest.INITIAL_TRIGGER_ENTER or GeofencingRequest.INITIAL_TRIGGER_DWELL)
      .addGeofences(geofences)
      .build()

    geofencingClient.removeGeofences(geofencePendingIntent())
      .addOnCompleteListener { geofencingClient.addGeofences(request, geofencePendingIntent()) }
  }

  private fun hasFineLocation() =
    ContextCompat.checkSelfPermission(reactContext, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

  private fun hasBackgroundLocation() =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.Q ||
      ContextCompat.checkSelfPermission(reactContext, Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED

  private fun hasActivityRecognition() =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.Q ||
      ContextCompat.checkSelfPermission(reactContext, Manifest.permission.ACTIVITY_RECOGNITION) == PackageManager.PERMISSION_GRANTED

  private fun locationPendingIntent(): PendingIntent =
    PendingIntent.getBroadcast(
      reactContext,
      7001,
      Intent(reactContext, MemoryLocationReceiver::class.java).setAction(MemoryLocationReceiver.ACTION_LOCATION),
      pendingIntentFlags()
    )

  private fun geofencePendingIntent(): PendingIntent =
    PendingIntent.getBroadcast(
      reactContext,
      7002,
      Intent(reactContext, MemoryLocationReceiver::class.java).setAction(MemoryLocationReceiver.ACTION_GEOFENCE),
      pendingIntentFlags()
    )

  private fun activityPendingIntent(): PendingIntent =
    PendingIntent.getBroadcast(
      reactContext,
      7003,
      Intent(reactContext, MemoryLocationReceiver::class.java).setAction(MemoryLocationReceiver.ACTION_ACTIVITY),
      pendingIntentFlags()
    )

  private fun pendingIntentFlags(): Int =
    PendingIntent.FLAG_UPDATE_CURRENT or
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_MUTABLE else 0

  private fun emit(eventName: String, payload: JSONObject) {
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(eventName, payload.toWritableMap())
  }

  companion object {
    private var activeModule: WeakReference<MemoryLocationModule>? = null

    fun emitFromAnyContext(context: Context, eventName: String, payload: JSONObject) {
      activeModule?.get()?.emit(eventName, payload)
    }

    fun refreshTrackingMode(context: Context, activity: String) {
      val module = activeModule?.get() ?: return
      if (module.reactApplicationContext.packageName == context.packageName) {
        module.fusedClient.removeLocationUpdates(module.locationPendingIntent())
        module.requestLocationUpdates(activity)
      }
    }
  }
}

private fun JSONObject.toWritableMap(): WritableMap {
  val map = Arguments.createMap()
  val keys = keys()
  while (keys.hasNext()) {
    val key = keys.next()
    when (val value = opt(key)) {
      is Boolean -> map.putBoolean(key, value)
      is Int -> map.putInt(key, value)
      is Long -> map.putDouble(key, value.toDouble())
      is Double -> map.putDouble(key, value)
      is Float -> map.putDouble(key, value.toDouble())
      is JSONObject -> map.putMap(key, value.toWritableMap())
      is JSONArray -> map.putArray(key, value.toWritableArray())
      null, JSONObject.NULL -> map.putNull(key)
      else -> map.putString(key, value.toString())
    }
  }
  return map
}

private fun JSONArray.toWritableArray(): com.facebook.react.bridge.WritableArray =
  Arguments.createArray().also { array ->
    for (index in 0 until length()) {
      when (val value = opt(index)) {
        is Boolean -> array.pushBoolean(value)
        is Int -> array.pushInt(value)
        is Long -> array.pushDouble(value.toDouble())
        is Double -> array.pushDouble(value)
        is Float -> array.pushDouble(value.toDouble())
        is JSONObject -> array.pushMap(value.toWritableMap())
        is JSONArray -> array.pushArray(value.toWritableArray())
        null, JSONObject.NULL -> array.pushNull()
        else -> array.pushString(value.toString())
      }
    }
  }
