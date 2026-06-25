package com.anonymous.memorymobile

import android.Manifest
import android.content.pm.PackageManager
import android.database.ContentObserver
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener
import org.json.JSONArray
import org.json.JSONObject

class ScreenshotWatcherModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext), PermissionListener {
  private var observer: ContentObserver? = null
  private var permissionPromise: Promise? = null

  override fun getName(): String = "ScreenshotWatcherModule"

  @ReactMethod
  fun hasPermissions(promise: Promise) {
    promise.resolve(hasRequiredPermissions())
  }

  @ReactMethod
  fun requestPermissions(promise: Promise) {
    if (hasRequiredPermissions()) {
      promise.resolve(true)
      return
    }

    val activity = reactContext.currentActivity

    if (activity !is PermissionAwareActivity) {
      promise.resolve(false)
      return
    }

    permissionPromise = promise
    activity.requestPermissions(requiredPermissions(), 4517, this)
  }

  @ReactMethod
  fun startWatching(promise: Promise) {
    if (!hasRequiredPermissions()) {
      promise.resolve(false)
      return
    }

    if (observer != null) {
      promise.resolve(true)
      return
    }

    observer =
      object : ContentObserver(Handler(Looper.getMainLooper())) {
        override fun onChange(selfChange: Boolean, uri: Uri?) {
          super.onChange(selfChange, uri)
          scanLatestScreenshot()
        }
      }

    reactContext.contentResolver.registerContentObserver(
      MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
      true,
      observer!!
    )
    scanLatestScreenshot()
    promise.resolve(true)
  }

  @ReactMethod
  fun stopWatching(promise: Promise) {
    observer?.let { reactContext.contentResolver.unregisterContentObserver(it) }
    observer = null
    promise.resolve(true)
  }

  @ReactMethod
  fun listLocalScreenshots(promise: Promise) {
    promise.resolve(toScreenshotWritableArray(ScreenshotInboxStore.listLocal(reactContext)))
  }

  @ReactMethod
  fun markSynced(id: String, promise: Promise) {
    promise.resolve(ScreenshotInboxStore.markSynced(reactContext, id)?.toScreenshotWritableMap())
  }

  @ReactMethod
  fun markIgnored(id: String, promise: Promise) {
    promise.resolve(ScreenshotInboxStore.markIgnored(reactContext, id)?.toScreenshotWritableMap())
  }

  @ReactMethod
  fun addListener(eventName: String) {
    // Required by React Native NativeEventEmitter.
  }

  @ReactMethod
  fun removeListeners(count: Double) {
    // Required by React Native NativeEventEmitter.
  }

  private fun scanLatestScreenshot() {
    if (!hasRequiredPermissions()) {
      return
    }

    val projection =
      arrayOf(
        MediaStore.Images.Media._ID,
        MediaStore.Images.Media.DATE_ADDED,
        MediaStore.Images.Media.DATE_TAKEN,
        MediaStore.Images.Media.RELATIVE_PATH,
        MediaStore.Images.Media.DISPLAY_NAME
      )

    try {
      reactContext.contentResolver.query(
        MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
        projection,
        null,
        null,
        "${MediaStore.Images.Media.DATE_ADDED} DESC"
      )?.use { cursor ->
        val idIndex = cursor.getColumnIndex(MediaStore.Images.Media._ID)
        val addedIndex = cursor.getColumnIndex(MediaStore.Images.Media.DATE_ADDED)
        val takenIndex = cursor.getColumnIndex(MediaStore.Images.Media.DATE_TAKEN)
        val pathIndex = cursor.getColumnIndex(MediaStore.Images.Media.RELATIVE_PATH)
        val nameIndex = cursor.getColumnIndex(MediaStore.Images.Media.DISPLAY_NAME)
        var scanned = 0

        while (cursor.moveToNext() && scanned < 12) {
          scanned += 1
          val relativePath = cursor.getString(pathIndex) ?: ""
          val displayName = cursor.getString(nameIndex) ?: ""

          if (!isScreenshot(relativePath, displayName)) {
            continue
          }

          val id = cursor.getLong(idIndex)
          val addedAt = cursor.getLong(addedIndex) * 1000L
          val takenAt = cursor.getLong(takenIndex).takeIf { it > 0L } ?: addedAt
          val imageUri = Uri.withAppendedPath(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id.toString()).toString()
          val item = ScreenshotInboxStore.addDetected(reactContext, imageUri, takenAt) ?: return

          ScreenshotNotificationHelper.notifyScreenshot(reactContext, item)
          emitDetected(item)
          return
        }
      }
    } catch (_: Exception) {
      return
    }
  }

  private fun isScreenshot(relativePath: String, displayName: String): Boolean {
    val normalizedPath = relativePath.lowercase()
    val normalizedName = displayName.lowercase()
    return normalizedPath.contains("dcim/screenshots") ||
      normalizedPath.contains("pictures/screenshots") ||
      normalizedName.contains("screenshot")
  }

  private fun emitDetected(item: JSONObject) {
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("MemoryOSScreenshotDetected", item.toScreenshotWritableMap())
  }

  override fun onRequestPermissionsResult(
    requestCode: Int,
    permissions: Array<String>,
    grantResults: IntArray
  ): Boolean {
    if (requestCode != 4517) {
      return false
    }

    permissionPromise?.resolve(hasRequiredPermissions())
    permissionPromise = null
    return true
  }

  private fun hasRequiredPermissions(): Boolean =
    requiredPermissions().all { permission ->
      reactContext.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED
    }

  private fun requiredPermissions(): Array<String> {
    val permissions = mutableListOf<String>()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      permissions.add(Manifest.permission.READ_MEDIA_IMAGES)
      permissions.add(Manifest.permission.POST_NOTIFICATIONS)
    } else {
      permissions.add(Manifest.permission.READ_EXTERNAL_STORAGE)
    }

    return permissions.toTypedArray()
  }
}

private fun toScreenshotWritableArray(array: JSONArray) =
  Arguments.createArray().apply {
    for (index in 0 until array.length()) {
      array.optJSONObject(index)?.let { pushMap(it.toScreenshotWritableMap()) }
    }
  }

private fun JSONObject.toScreenshotWritableMap() =
  Arguments.createMap().also { map ->
    val keys = keys()

    while (keys.hasNext()) {
      val key = keys.next()
      val value = opt(key)

      when (value) {
        is Boolean -> map.putBoolean(key, value)
        is Int -> map.putInt(key, value)
        is Long -> map.putDouble(key, value.toDouble())
        is Double -> map.putDouble(key, value)
        is Number -> map.putDouble(key, value.toDouble())
        is String -> map.putString(key, value)
        JSONObject.NULL, null -> map.putNull(key)
        else -> map.putString(key, value.toString())
      }
    }
  }
