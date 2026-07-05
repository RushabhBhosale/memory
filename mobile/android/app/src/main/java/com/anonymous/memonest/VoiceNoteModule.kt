package com.anonymous.memonest

import android.Manifest
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener

class VoiceNoteModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext), RecognitionListener, PermissionListener {
  private val mainHandler = Handler(Looper.getMainLooper())
  private val activityEventListener =
    object : BaseActivityEventListener() {
      override fun onActivityResult(
        activity: Activity,
        requestCode: Int,
        resultCode: Int,
        data: Intent?
      ) {
        if (requestCode != VOICE_PROMPT_REQUEST_CODE) {
          return
        }

        val promise = voicePromptPromise ?: return
        voicePromptPromise = null

        if (resultCode != Activity.RESULT_OK) {
          promise.reject("VOICE_PROMPT_CANCELLED", "Voice note was cancelled.")
          return
        }

        val transcript =
          data
            ?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
            ?.firstOrNull()
            ?.trim()
            .orEmpty()

        if (transcript.isBlank()) {
          promise.reject("VOICE_NO_TRANSCRIPT", "No speech was detected. Try speaking a little closer to the phone.")
          return
        }

        transcriptDraft = transcript
        emitTranscript(transcript)
        promise.resolve(toResultMap(transcript))
      }
    }
  private var recognizer: SpeechRecognizer? = null
  private var permissionPromise: Promise? = null
  private var stopPromise: Promise? = null
  private var voicePromptPromise: Promise? = null
  private var lastErrorMessage: String? = null
  private var transcriptDraft = ""
  private var isListening = false

  init {
    reactContext.addActivityEventListener(activityEventListener)
  }

  override fun getName(): String = "VoiceNoteModule"

  @ReactMethod
  fun hasRecognitionSupport(promise: Promise) {
    promise.resolve(hasSpeechRecognition())
  }

  @ReactMethod
  fun hasAudioPermission(promise: Promise) {
    promise.resolve(hasAudioPermission())
  }

  @ReactMethod
  fun requestAudioPermission(promise: Promise) {
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
    activity.requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 4631, this)
  }

  @ReactMethod
  fun startTranscription(languageTag: String?, promise: Promise) {
    if (!hasAudioPermission()) {
      promise.reject("VOICE_PERMISSION_MISSING", "Microphone permission is required for voice notes.")
      return
    }

    if (!hasSpeechRecognition()) {
      promise.reject(
        "VOICE_RECOGNITION_UNAVAILABLE",
        "Speech recognition is not available on this phone."
      )
      return
    }

    if (isListening) {
      promise.resolve(true)
      return
    }

    mainHandler.post {
      try {
        cleanupRecognizer()
        lastErrorMessage = null
        transcriptDraft = ""
        recognizer = createRecognizer().apply {
          setRecognitionListener(this@VoiceNoteModule)
        }
        val intent =
          Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1800L)
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 1200L)
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 3500L)

            if (!languageTag.isNullOrBlank()) {
              putExtra(RecognizerIntent.EXTRA_LANGUAGE, languageTag)
            }
          }

        isListening = true
        recognizer?.startListening(intent)
        promise.resolve(true)
      } catch (error: Exception) {
        isListening = false
        cleanupRecognizer()
        promise.reject("VOICE_START_FAILED", error.message, error)
      }
    }
  }

  @ReactMethod
  fun captureWithSystemPrompt(languageTag: String?, promise: Promise) {
    if (!hasAudioPermission()) {
      promise.reject("VOICE_PERMISSION_MISSING", "Microphone permission is required for voice notes.")
      return
    }

    if (!SpeechRecognizer.isRecognitionAvailable(reactContext)) {
      promise.reject(
        "VOICE_RECOGNITION_UNAVAILABLE",
        "Speech recognition is not available on this phone."
      )
      return
    }

    val activity = reactContext.currentActivity

    if (activity == null) {
      promise.reject("VOICE_ACTIVITY_MISSING", "Voice capture needs the app to be in the foreground.")
      return
    }

    if (voicePromptPromise != null) {
      promise.reject("VOICE_PROMPT_PENDING", "Voice capture is already running.")
      return
    }

    val intent =
      Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
        putExtra(RecognizerIntent.EXTRA_PROMPT, "Voice note")

        if (!languageTag.isNullOrBlank()) {
          putExtra(RecognizerIntent.EXTRA_LANGUAGE, languageTag)
        }
      }

    try {
      voicePromptPromise = promise
      activity.startActivityForResult(intent, VOICE_PROMPT_REQUEST_CODE)
    } catch (error: ActivityNotFoundException) {
      voicePromptPromise = null
      promise.reject("VOICE_PROMPT_UNAVAILABLE", "Speech recognition is not available on this phone.", error)
    } catch (error: Exception) {
      voicePromptPromise = null
      promise.reject("VOICE_PROMPT_FAILED", error.message ?: "Unable to start voice capture.", error)
    }
  }

  @ReactMethod
  fun stopTranscription(promise: Promise) {
    if (!isListening || recognizer == null) {
      if (transcriptDraft.isNotBlank()) {
        promise.resolve(toResultMap(transcriptDraft))
        return
      }

      val message = lastErrorMessage

      if (!message.isNullOrBlank()) {
        promise.reject("VOICE_TRANSCRIPTION_FAILED", message)
        return
      }

      promise.reject("VOICE_NO_TRANSCRIPT", "No speech was detected. Try speaking a little closer to the phone.")
      return
    }

    if (stopPromise != null) {
      promise.reject("VOICE_STOP_PENDING", "Voice transcription is already stopping.")
      return
    }

    stopPromise = promise
    mainHandler.post {
      try {
        recognizer?.stopListening()
      } catch (error: Exception) {
        rejectStop("VOICE_STOP_FAILED", error.message ?: "Unable to stop voice note.", error)
      }
    }
  }

  @ReactMethod
  fun cancelTranscription(promise: Promise) {
    mainHandler.post {
      try {
        recognizer?.cancel()
      } catch (_: Exception) {
        // The recognizer may already be gone; cancel should still be idempotent.
      } finally {
        isListening = false
        stopPromise = null
        cleanupRecognizer()
        promise.resolve(true)
      }
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

  override fun onReadyForSpeech(params: Bundle?) = Unit

  override fun onBeginningOfSpeech() = Unit

  override fun onRmsChanged(rmsdB: Float) = Unit

  override fun onBufferReceived(buffer: ByteArray?) = Unit

  override fun onEndOfSpeech() = Unit

  override fun onError(error: Int) {
    val message = speechErrorMessage(error)
    lastErrorMessage = message

    if (transcriptDraft.isNotBlank()) {
      emitTranscript(transcriptDraft)
      resolveStop(transcriptDraft)
      return
    }

    val promise = stopPromise
    stopPromise = null
    isListening = false
    cleanupRecognizer()

    if (promise != null) {
      promise.reject("VOICE_TRANSCRIPTION_FAILED", message)
    }
  }

  override fun onResults(results: Bundle?) {
    transcriptDraft = extractTranscript(results).ifBlank { transcriptDraft }
    emitTranscript(transcriptDraft)
    resolveStop(transcriptDraft)
  }

  override fun onPartialResults(partialResults: Bundle?) {
    val partialTranscript = extractTranscript(partialResults)

    if (partialTranscript.isNotBlank()) {
      transcriptDraft = partialTranscript
      emitTranscript(transcriptDraft)
    }
  }

  override fun onEvent(eventType: Int, params: Bundle?) = Unit

  override fun onRequestPermissionsResult(
    requestCode: Int,
    permissions: Array<String>,
    grantResults: IntArray
  ): Boolean {
    if (requestCode != 4631) {
      return false
    }

    permissionPromise?.resolve(hasAudioPermission())
    permissionPromise = null
    return true
  }

  private fun hasAudioPermission(): Boolean =
    reactContext.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

  private fun hasSpeechRecognition(): Boolean =
    SpeechRecognizer.isRecognitionAvailable(reactContext) || hasOnDeviceRecognition()

  private fun hasOnDeviceRecognition(): Boolean =
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
      SpeechRecognizer.isOnDeviceRecognitionAvailable(reactContext)

  private fun createRecognizer(): SpeechRecognizer {
    if (SpeechRecognizer.isRecognitionAvailable(reactContext)) {
      return SpeechRecognizer.createSpeechRecognizer(reactContext)
    }

    if (hasOnDeviceRecognition() && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      return SpeechRecognizer.createOnDeviceSpeechRecognizer(reactContext)
    }

    throw IllegalStateException("Speech recognition is not available on this phone.")
  }

  private fun extractTranscript(results: Bundle?): String =
    results
      ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
      ?.firstOrNull()
      ?.trim()
      .orEmpty()

  private fun resolveStop(transcript: String) {
    val promise = stopPromise
    stopPromise = null
    isListening = false
    lastErrorMessage = null
    cleanupRecognizer()
    promise?.resolve(toResultMap(transcript))
  }

  private fun rejectStop(code: String, message: String, error: Throwable?) {
    val promise = stopPromise
    stopPromise = null
    isListening = false
    lastErrorMessage = message
    cleanupRecognizer()

    if (promise != null) {
      promise.reject(code, message, error)
    }
  }

  private fun cleanupRecognizer() {
    recognizer?.destroy()
    recognizer = null
  }

  private fun toResultMap(transcript: String) =
    Arguments.createMap().apply {
      putString("transcript", transcript.trim())
      putString("source", "on_device_speech")
      putNull("audioUri")
      putBoolean("audioFileDeleted", true)
    }

  private fun emitTranscript(transcript: String) {
    if (transcript.isBlank()) {
      return
    }

    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(
        "MemonestVoiceTranscript",
        Arguments.createMap().apply {
          putString("transcript", transcript.trim())
        }
      )
  }

  private fun speechErrorMessage(error: Int): String =
    when (error) {
      SpeechRecognizer.ERROR_AUDIO -> "The microphone could not capture audio."
      SpeechRecognizer.ERROR_CLIENT -> "Voice note capture was interrupted."
      SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Microphone permission is required for voice notes."
      SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Speech recognition could not finish. Try again with a better connection or offline speech pack."
      SpeechRecognizer.ERROR_NO_MATCH -> "No speech was detected. Try speaking a little closer to the phone."
      SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "The speech recognizer is busy. Try again in a moment."
      SpeechRecognizer.ERROR_SERVER -> "Speech recognition is not available right now."
      SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "No speech was detected. Try again when you are ready."
      else -> "Voice transcription failed. Try again."
    }

  companion object {
    private const val VOICE_PROMPT_REQUEST_CODE = 4632
  }
}
