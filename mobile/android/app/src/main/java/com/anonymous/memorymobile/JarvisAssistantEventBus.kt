package com.anonymous.memorymobile

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule

object JarvisAssistantEventBus {
  const val EVENT_NAME = "MemoryOSJarvisEvent"
  private var reactContext: ReactApplicationContext? = null

  fun attach(context: ReactApplicationContext) {
    reactContext = context
  }

  fun detach(context: ReactApplicationContext) {
    if (reactContext === context) {
      reactContext = null
    }
  }

  fun emit(
    type: String,
    status: JarvisAssistantStatus? = null,
    transcript: String = "",
    answer: String = "",
    error: String = ""
  ) {
    val context = reactContext ?: return

    if (!context.hasActiveReactInstance()) {
      return
    }

    val payload = Arguments.createMap().apply {
      putString("type", type)
      putString("transcript", transcript)
      putString("answer", answer)
      putString("error", error)

      if (status != null) {
        putMap(
          "status",
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
        )
      }
    }

    context
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(EVENT_NAME, payload)
  }
}
