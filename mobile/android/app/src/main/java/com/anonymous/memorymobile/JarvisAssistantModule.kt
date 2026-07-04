package com.anonymous.memorymobile

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.PowerManager
import android.speech.SpeechRecognizer
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener

class JarvisAssistantModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext), PermissionListener {
  private var permissionPromise: Promise? = null

  init {
    JarvisAssistantEventBus.attach(reactContext)
  }

  override fun getName(): String = "JarvisAssistantModule"

  override fun invalidate() {
    JarvisAssistantEventBus.detach(reactContext)
    super.invalidate()
  }

  @ReactMethod
  fun getSettings(promise: Promise) {
    promise.resolve(settingsToMap(JarvisAssistantPrefs.readSettings(reactContext)))
  }

  @ReactMethod
  fun updateSettings(values: ReadableMap, promise: Promise) {
    val current = JarvisAssistantPrefs.readSettings(reactContext)
    val next = current.copy(
      enabled = if (values.hasKey("enabled")) values.getBoolean("enabled") else current.enabled,
      wakeWordDetectionEnabled = if (values.hasKey("wakeWordDetectionEnabled")) {
        values.getBoolean("wakeWordDetectionEnabled")
      } else {
        current.wakeWordDetectionEnabled
      },
      manualModeEnabled = if (values.hasKey("manualModeEnabled")) {
        values.getBoolean("manualModeEnabled")
      } else {
        current.manualModeEnabled
      },
      speakAnswers = if (values.hasKey("speakAnswers")) values.getBoolean("speakAnswers") else current.speakAnswers,
      openAppOnAnswer = if (values.hasKey("openAppOnAnswer")) values.getBoolean("openAppOnAnswer") else current.openAppOnAnswer,
      apiRoot = if (values.hasKey("apiRoot")) values.getString("apiRoot").orEmpty() else current.apiRoot,
      apiKey = if (values.hasKey("apiKey")) values.getString("apiKey").orEmpty() else current.apiKey,
      wakePhrase = if (values.hasKey("wakePhrase")) values.getString("wakePhrase").orEmpty() else current.wakePhrase,
      wakeKeyword = if (values.hasKey("wakeKeyword")) {
        values.getString("wakeKeyword").orEmpty()
      } else {
        current.wakeKeyword
      },
      wakeSensitivity = if (values.hasKey("wakeSensitivity")) {
        values.getDouble("wakeSensitivity")
      } else {
        current.wakeSensitivity
      }
    )

    JarvisAssistantPrefs.saveSettings(reactContext, next)

    if (next.enabled) {
      JarvisAssistantService.start(reactContext)
    } else {
      JarvisAssistantService.sendAction(reactContext, JarvisAssistantService.ACTION_STOP)
    }

    promise.resolve(settingsToMap(next))
  }

  @ReactMethod
  fun getStatus(promise: Promise) {
    promise.resolve(statusToMap(JarvisAssistantPrefs.readStatus(reactContext)))
  }

  @ReactMethod
  fun start(promise: Promise) {
    JarvisAssistantPrefs.setEnabled(reactContext, true)
    JarvisAssistantService.start(reactContext)
    promise.resolve(statusToMap(JarvisAssistantPrefs.readStatus(reactContext)))
  }

  @ReactMethod
  fun pause(promise: Promise) {
    JarvisAssistantService.sendAction(reactContext, JarvisAssistantService.ACTION_PAUSE)
    promise.resolve(true)
  }

  @ReactMethod
  fun resume(promise: Promise) {
    JarvisAssistantPrefs.setEnabled(reactContext, true)
    JarvisAssistantService.sendAction(reactContext, JarvisAssistantService.ACTION_RESUME)
    promise.resolve(true)
  }

  @ReactMethod
  fun stop(promise: Promise) {
    JarvisAssistantService.sendAction(reactContext, JarvisAssistantService.ACTION_STOP)
    promise.resolve(true)
  }

  @ReactMethod
  fun ask(promise: Promise) {
    JarvisAssistantService.sendAction(reactContext, JarvisAssistantService.ACTION_ASK)
    promise.resolve(true)
  }

  @ReactMethod
  fun testWakeWord(promise: Promise) {
    JarvisAssistantService.sendAction(reactContext, JarvisAssistantService.ACTION_TEST_WAKE)
    promise.resolve(true)
  }

  @ReactMethod
  fun getLastResult(promise: Promise) {
    val status = JarvisAssistantPrefs.readStatus(reactContext)
    promise.resolve(
      Arguments.createMap().apply {
        putString("transcript", status.lastTranscript)
        putString("answer", status.lastAnswer)
        putString("error", status.lastError)
      }
    )
  }

  @ReactMethod
  fun hasRequiredPermissions(promise: Promise) {
    val wakeWordAvailable = PocketSphinxAssetStore.hasRequiredAssets(reactContext)

    promise.resolve(
      Arguments.createMap().apply {
        putBoolean("microphone", hasAudioPermission())
        putBoolean("notifications", hasNotificationPermission())
        putBoolean("speechRecognition", hasSpeechRecognition())
        putBoolean("batteryOptimized", !isIgnoringBatteryOptimizations())
        putBoolean("wakeWordReady", wakeWordAvailable)
        putBoolean("wakeWordAvailable", wakeWordAvailable)
        putString("wakeWordEngine", PocketSphinxWakeEngine.ENGINE_NAME)
        putString(
          "wakeWordError",
          if (wakeWordAvailable) "" else JarvisAssistantPrefs.WAKE_ENGINE_UNAVAILABLE_MESSAGE
        )
      }
    )
  }

  @ReactMethod
  fun requestMicrophonePermission(promise: Promise) {
    if (hasAudioPermission()) {
      promise.resolve(true)
      return
    }

    val activity = reactContext.currentActivity

    if (activity !is PermissionAwareActivity) {
      promise.resolve(false)
      return
    }

    permissionPromise = promise
    activity.requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), REQUEST_RECORD_AUDIO, this)
  }

  @ReactMethod
  fun openBatteryOptimizationSettings(promise: Promise) {
    try {
      JarvisAssistantService.openBatteryOptimizationSettings(reactContext)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("JARVIS_BATTERY_SETTINGS_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun requestIgnoreBatteryOptimization(promise: Promise) {
    try {
      JarvisAssistantService.requestIgnoreBatteryOptimization(reactContext)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("JARVIS_BATTERY_REQUEST_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun addListener(eventName: String) {
    // Required by React Native NativeEventEmitter.
  }

  @ReactMethod
  fun removeListeners(count: Double) {
    // Required by React Native NativeEventEmitter.
  }

  override fun onRequestPermissionsResult(
    requestCode: Int,
    permissions: Array<String>,
    grantResults: IntArray
  ): Boolean {
    if (requestCode != REQUEST_RECORD_AUDIO) {
      return false
    }

    permissionPromise?.resolve(hasAudioPermission())
    permissionPromise = null
    return true
  }

  private fun settingsToMap(settings: JarvisAssistantSettings) =
    Arguments.createMap().apply {
      putBoolean("enabled", settings.enabled)
      putBoolean("wakeWordDetectionEnabled", settings.wakeWordDetectionEnabled)
      putBoolean("manualModeEnabled", settings.manualModeEnabled)
      putBoolean("speakAnswers", settings.speakAnswers)
      putBoolean("openAppOnAnswer", settings.openAppOnAnswer)
      putString("apiRoot", settings.apiRoot)
      putString("apiKey", settings.apiKey)
      putString("wakePhrase", settings.wakePhrase)
      putString("wakeKeyword", settings.wakeKeyword)
      putDouble("wakeSensitivity", settings.wakeSensitivity)
      putBoolean("wakeWordAvailable", PocketSphinxAssetStore.hasRequiredAssets(reactContext))
    }

  private fun statusToMap(status: JarvisAssistantStatus) =
    Arguments.createMap().apply {
      putBoolean("enabled", status.enabled)
      putString("state", status.state)
      putString("message", status.message)
      putBoolean("wakeWordReady", status.wakeWordReady)
      putBoolean("wakeWordAvailable", status.wakeWordAvailable)
      putString("wakeWordEngine", status.wakeWordEngine)
      putString("lastTranscript", status.lastTranscript)
      putString("lastAnswer", status.lastAnswer)
      putString("lastError", status.lastError)
    }

  private fun hasAudioPermission(): Boolean =
    reactContext.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

  private fun hasNotificationPermission(): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
      reactContext.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

  private fun hasSpeechRecognition(): Boolean =
    SpeechRecognizer.isRecognitionAvailable(reactContext) ||
      (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && SpeechRecognizer.isOnDeviceRecognitionAvailable(reactContext))

  private fun isIgnoringBatteryOptimizations(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
      return true
    }

    val powerManager = reactContext.getSystemService(Context.POWER_SERVICE) as PowerManager
    return powerManager.isIgnoringBatteryOptimizations(reactContext.packageName)
  }

  companion object {
    private const val REQUEST_RECORD_AUDIO = 4717
  }
}
