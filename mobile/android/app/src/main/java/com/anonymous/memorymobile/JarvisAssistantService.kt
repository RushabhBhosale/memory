package com.anonymous.memorymobile

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioManager
import android.media.ToneGenerator
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.Settings
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import androidx.core.content.ContextCompat
import java.util.Locale
import kotlin.concurrent.thread

class JarvisAssistantService : Service(), RecognitionListener, TextToSpeech.OnInitListener {
  private val mainHandler = Handler(Looper.getMainLooper())
  private var wakeEngine: WakeWordEngine? = null
  private var recognizer: SpeechRecognizer? = null
  private var textToSpeech: TextToSpeech? = null
  private var ttsReady = false
  private var partialTranscript = ""
  private var currentState = STATE_OFF
  private var wakeLock: PowerManager.WakeLock? = null
  private var foregroundStarted = false
  private var wakeSetupToken = 0

  private val commandTimeoutRunnable = Runnable {
    finishCommandRecognition(partialTranscript, "I did not catch that. Please try again.")
  }

  override fun onCreate() {
    super.onCreate()
    createNotificationChannel()
    textToSpeech = TextToSpeech(this, this)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action ?: ACTION_START) {
      ACTION_START -> {
        startForegroundIfNeeded()
        startAssistantLoop()
      }
      ACTION_ASK -> startManualAsk()
      ACTION_PAUSE -> pauseListening()
      ACTION_RESUME -> {
        JarvisAssistantPrefs.setEnabled(this, true)
        startForegroundIfNeeded()
        startAssistantLoop()
      }
      ACTION_STOP -> stopAssistant()
      ACTION_TEST_WAKE -> testWakeWordFlow()
    }

    return if (JarvisAssistantPrefs.readSettings(this).enabled) START_STICKY else START_NOT_STICKY
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onDestroy() {
    cleanupWakeEngine()
    cleanupRecognizer()
    releaseWakeLock()
    textToSpeech?.stop()
    textToSpeech?.shutdown()
    textToSpeech = null
    foregroundStarted = false
    super.onDestroy()
  }

  override fun onInit(status: Int) {
    ttsReady = status == TextToSpeech.SUCCESS

    if (ttsReady) {
      textToSpeech?.language = Locale.getDefault()
      textToSpeech?.setOnUtteranceProgressListener(
        object : UtteranceProgressListener() {
          override fun onStart(utteranceId: String?) = Unit

          override fun onDone(utteranceId: String?) {
            if (utteranceId == UTTERANCE_REPLY) {
              mainHandler.post { returnToWakeListening() }
            }
          }

          @Deprecated("Required by platform API")
          override fun onError(utteranceId: String?) {
            if (utteranceId == UTTERANCE_REPLY) {
              mainHandler.post { returnToWakeListening() }
            }
          }

          override fun onError(utteranceId: String?, errorCode: Int) {
            if (utteranceId == UTTERANCE_REPLY) {
              mainHandler.post { returnToWakeListening() }
            }
          }
        }
      )
    }
  }

  override fun onReadyForSpeech(params: Bundle?) {
    setState(STATE_RECORDING, "Listening for your command.", wakeWordReady = false)
  }

  override fun onBeginningOfSpeech() = Unit

  override fun onRmsChanged(rmsdB: Float) = Unit

  override fun onBufferReceived(buffer: ByteArray?) = Unit

  override fun onEndOfSpeech() = Unit

  override fun onPartialResults(partialResults: Bundle?) {
    val transcript = extractTranscript(partialResults)

    if (transcript.isNotBlank()) {
      partialTranscript = transcript
      JarvisAssistantEventBus.emit("transcript", JarvisAssistantPrefs.readStatus(this), transcript = transcript)
    }
  }

  override fun onResults(results: Bundle?) {
    finishCommandRecognition(extractTranscript(results).ifBlank { partialTranscript })
  }

  override fun onError(error: Int) {
    val message = speechErrorMessage(error)
    finishCommandRecognition(partialTranscript, message)
  }

  override fun onEvent(eventType: Int, params: Bundle?) = Unit

  private fun startAssistantLoop() {
    val settings = JarvisAssistantPrefs.readSettings(this)

    if (!settings.enabled) {
      setState(STATE_OFF, "Jarvis assistant is off.", wakeWordReady = false)
      stopSelf()
      return
    }

    if (!settings.manualModeEnabled && !settings.wakeWordDetectionEnabled) {
      setState(
        STATE_READY,
        "Jarvis is ready. Enable manual mode or wake-word detection.",
        wakeWordReady = false,
        wakeWordAvailable = isWakeWordAvailable(),
        wakeWordEngine = "manual"
      )
      return
    }

    if (settings.wakeWordDetectionEnabled && !hasAudioPermission()) {
      setError("Microphone permission is required for wake-word detection. Manual Jarvis mode can still be used from the notification.")
      return
    }

    cleanupRecognizer()
    cleanupWakeEngine()

    if (!settings.wakeWordDetectionEnabled) {
      wakeEngine = ManualNotificationWakeEngine {
        mainHandler.post { onWakeWordDetected() }
      }.also { it.start() }
      setState(
        STATE_READY,
        "MemoryOS Jarvis is ready. Tap Ask Jarvis from the notification.",
        wakeWordReady = false,
        wakeWordAvailable = isWakeWordAvailable(),
        wakeWordEngine = "manual"
      )
      return
    }

    val setupToken = ++wakeSetupToken
    setState(
      STATE_READY,
      "Starting PocketSphinx wake-word detection.",
      wakeWordReady = false,
      wakeWordAvailable = isWakeWordAvailable(),
      wakeWordEngine = PocketSphinxWakeEngine.ENGINE_NAME
    )

    thread(name = "MemoryOSJarvisWakeSetup") {
      val setup = PocketSphinxWakeEngine.create(this, settings) {
        mainHandler.post { onWakeWordDetected() }
      }

      mainHandler.post {
        if (setupToken != wakeSetupToken) {
          setup.engine?.release()
          return@post
        }

        applyWakeEngineSetup(settings, setup)
      }
    }
  }

  private fun applyWakeEngineSetup(settings: JarvisAssistantSettings, setup: WakeWordEngineSetup) {
    if (!settings.enabled || !settings.wakeWordDetectionEnabled) {
      setup.engine?.release()
      return
    }

    if (!setup.ready || setup.engine == null) {
      val message = if (settings.manualModeEnabled) {
        setup.message.ifBlank { JarvisAssistantPrefs.WAKE_ENGINE_UNAVAILABLE_MESSAGE }
      } else {
        setup.message.ifBlank { "PocketSphinx wake-word detection could not start." }
      }

      setState(
        if (settings.manualModeEnabled) STATE_READY else STATE_ERROR,
        message,
        wakeWordReady = false,
        wakeWordAvailable = setup.available,
        wakeWordEngine = setup.engineName,
        lastError = if (settings.manualModeEnabled) "" else message
      )
      return
    }

    wakeEngine = setup.engine

    try {
      wakeEngine?.start()
      setState(
        STATE_LISTENING,
        "Say ${settings.wakePhrase}.",
        wakeWordReady = true,
        wakeWordAvailable = setup.available,
        wakeWordEngine = setup.engineName
      )
    } catch (error: Exception) {
      Log.w(TAG, "Wake-word detector could not start", error)
      cleanupWakeEngine()
      val message = error.message ?: "PocketSphinx wake-word detection could not start."
      setState(
        if (settings.manualModeEnabled) STATE_READY else STATE_ERROR,
        if (settings.manualModeEnabled) JarvisAssistantPrefs.WAKE_ENGINE_UNAVAILABLE_MESSAGE else message,
        wakeWordReady = false,
        wakeWordAvailable = setup.available,
        wakeWordEngine = setup.engineName,
        lastError = if (settings.manualModeEnabled) "" else message
      )
    }
  }

  private fun onWakeWordDetected() {
    if (currentState != STATE_LISTENING && currentState != STATE_TESTING && currentState != STATE_READY) {
      return
    }

    cleanupWakeEngine()
    acquireWakeLock()
    playWakeFeedback()
    startCommandRecognition()
  }

  private fun startManualAsk() {
    val settings = JarvisAssistantPrefs.readSettings(this)

    if (!settings.enabled || !settings.manualModeEnabled) {
      setState(
        STATE_READY,
        "Manual Jarvis mode is off.",
        wakeWordReady = false,
        wakeWordAvailable = isWakeWordAvailable(),
        wakeWordEngine = "manual"
      )
      return
    }

    startForegroundIfNeeded()
    val engine = wakeEngine as? ManualNotificationWakeEngine
      ?: ManualNotificationWakeEngine {
        mainHandler.post { onWakeWordDetected() }
      }.also {
        wakeEngine = it
        it.start()
      }
    setState(
      STATE_READY,
      "Manual Jarvis command requested.",
      wakeWordReady = false,
      wakeWordAvailable = isWakeWordAvailable(),
      wakeWordEngine = "manual"
    )
    engine.askNow()
  }

  private fun startCommandRecognition() {
    if (!hasAudioPermission()) {
      setError("Microphone permission is required for Jarvis command capture.")
      returnToWakeListening()
      return
    }

    if (!hasSpeechRecognition()) {
      val message = "Speech recognition is not available on this phone."
      setError(message)
      speakOrReturn(message)
      return
    }

    mainHandler.removeCallbacks(commandTimeoutRunnable)
    cleanupRecognizer()
    partialTranscript = ""

    try {
      recognizer = createSpeechRecognizer().apply {
        setRecognitionListener(this@JarvisAssistantService)
      }

      val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
        putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1600L)
        putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 1000L)
        putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 2500L)
      }

      setState(STATE_RECORDING, "Listening for your command.", wakeWordReady = false)
      recognizer?.startListening(intent)
      mainHandler.postDelayed(commandTimeoutRunnable, COMMAND_TIMEOUT_MS)
    } catch (error: Exception) {
      cleanupRecognizer()
      setError(error.message ?: "Unable to start speech recognition.")
      speakOrReturn("I could not start listening. Please try again.")
    }
  }

  private fun finishCommandRecognition(transcript: String, fallbackError: String = "") {
    mainHandler.removeCallbacks(commandTimeoutRunnable)
    cleanupRecognizer()

    val cleanTranscript = transcript.trim()

    if (cleanTranscript.isBlank()) {
      val message = fallbackError.ifBlank { "I did not catch that. Please try again." }
      JarvisAssistantPrefs.saveLastError(this, message)
      JarvisAssistantEventBus.emit("error", JarvisAssistantPrefs.readStatus(this), error = message)
      speakOrReturn(message)
      return
    }

    processCommand(cleanTranscript)
  }

  private fun processCommand(transcript: String) {
    setState(STATE_PROCESSING, "Asking MemoryOS.", wakeWordReady = false)
    JarvisAssistantEventBus.emit("transcript", JarvisAssistantPrefs.readStatus(this), transcript = transcript)

    thread(name = "MemoryOSJarvisCommand") {
      try {
        val result = JarvisAssistantClient.send(this, transcript)

        mainHandler.post {
          JarvisAssistantPrefs.saveLastResult(this, transcript, result.answer)
          setState(STATE_SPEAKING, "Answer ready.", wakeWordReady = false)
          maybeOpenApp()
          JarvisAssistantEventBus.emit(
            "result",
            JarvisAssistantPrefs.readStatus(this),
            transcript = transcript,
            answer = result.answer
          )
          speakOrReturn(result.answer)
        }
      } catch (error: Exception) {
        val technicalMessage = error.message ?: "MemoryOS API failed."
        val userMessage = "MemoryOS could not answer right now."

        mainHandler.post {
          JarvisAssistantPrefs.saveLastError(this, technicalMessage)
          setState(STATE_ERROR, technicalMessage, wakeWordReady = false, lastError = technicalMessage)
          maybeOpenApp()
          JarvisAssistantEventBus.emit(
            "error",
            JarvisAssistantPrefs.readStatus(this),
            transcript = transcript,
            error = userMessage
          )
          speakOrReturn(userMessage)
        }
      }
    }
  }

  private fun speakOrReturn(text: String) {
    val settings = JarvisAssistantPrefs.readSettings(this)

    if (!settings.speakAnswers || !ttsReady || textToSpeech == null) {
      returnToWakeListening()
      return
    }

    setState(STATE_SPEAKING, "Speaking answer.", wakeWordReady = false)
    val params = Bundle().apply {
      putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, UTTERANCE_REPLY)
    }
    val result = textToSpeech?.speak(text.take(MAX_TTS_CHARS), TextToSpeech.QUEUE_FLUSH, params, UTTERANCE_REPLY)

    if (result == TextToSpeech.ERROR) {
      returnToWakeListening()
    }
  }

  private fun returnToWakeListening() {
    releaseWakeLock()

    if (currentState == STATE_PAUSED || currentState == STATE_OFF) {
      return
    }

    val settings = JarvisAssistantPrefs.readSettings(this)

    if (!settings.enabled) {
      stopAssistant()
      return
    }

    mainHandler.postDelayed({ startAssistantLoop() }, RETURN_TO_WAKE_DELAY_MS)
  }

  private fun pauseListening() {
    cleanupWakeEngine()
    cleanupRecognizer()
    releaseWakeLock()
    setState(STATE_PAUSED, "Jarvis wake word is paused.", wakeWordReady = false)
  }

  private fun stopAssistant() {
    JarvisAssistantPrefs.setEnabled(this, false)
    cleanupWakeEngine()
    cleanupRecognizer()
    releaseWakeLock()
    textToSpeech?.stop()
    setState(STATE_OFF, "Jarvis assistant is off.", wakeWordReady = false)
    stopForegroundCompat()
    stopSelf()
  }

  private fun testWakeWordFlow() {
    JarvisAssistantPrefs.setEnabled(this, true)
    startForegroundIfNeeded()
    cleanupWakeEngine()
    currentState = STATE_TESTING
    setState(
      STATE_TESTING,
      "Testing Jarvis wake-word flow.",
      wakeWordReady = false,
      wakeWordAvailable = isWakeWordAvailable(),
      wakeWordEngine = PocketSphinxWakeEngine.ENGINE_NAME
    )
    onWakeWordDetected()
  }

  private fun setError(message: String) {
    JarvisAssistantPrefs.saveLastError(this, message)
    setState(STATE_ERROR, message, wakeWordReady = false, lastError = message)
    JarvisAssistantEventBus.emit("error", JarvisAssistantPrefs.readStatus(this), error = message)
  }

  private fun setState(
    state: String,
    message: String,
    wakeWordReady: Boolean,
    wakeWordAvailable: Boolean = isWakeWordAvailable(),
    wakeWordEngine: String = "manual",
    lastError: String = ""
  ) {
    currentState = state
    JarvisAssistantPrefs.saveStatus(
      this,
      state,
      message,
      wakeWordReady,
      wakeWordAvailable,
      wakeWordEngine,
      lastError
    )
    JarvisAssistantEventBus.emit("status", JarvisAssistantPrefs.readStatus(this))
    updateNotification()
  }

  private fun cleanupWakeEngine() {
    wakeSetupToken += 1

    try {
      wakeEngine?.stop()
    } catch (_: Exception) {
      // Engine may already be stopped.
    }

    try {
      wakeEngine?.release()
    } catch (_: Exception) {
      // Engine may already be released.
    }

    wakeEngine = null
  }

  private fun cleanupRecognizer() {
    mainHandler.removeCallbacks(commandTimeoutRunnable)

    try {
      recognizer?.cancel()
    } catch (_: Exception) {
      // Recognizer may already be stopped.
    }

    try {
      recognizer?.destroy()
    } catch (_: Exception) {
      // Recognizer may already be released.
    }

    recognizer = null
  }

  private fun extractTranscript(results: Bundle?): String =
    results
      ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
      ?.firstOrNull()
      ?.trim()
      .orEmpty()

  private fun hasAudioPermission(): Boolean =
    ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) ==
      PackageManager.PERMISSION_GRANTED

  private fun hasSpeechRecognition(): Boolean =
    SpeechRecognizer.isRecognitionAvailable(this) ||
      (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && SpeechRecognizer.isOnDeviceRecognitionAvailable(this))

  private fun createSpeechRecognizer(): SpeechRecognizer {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && SpeechRecognizer.isOnDeviceRecognitionAvailable(this)) {
      return SpeechRecognizer.createOnDeviceSpeechRecognizer(this)
    }

    return SpeechRecognizer.createSpeechRecognizer(this)
  }

  private fun isWakeWordAvailable(): Boolean =
    PocketSphinxAssetStore.hasRequiredAssets(this)

  private fun speechErrorMessage(error: Int): String =
    when (error) {
      SpeechRecognizer.ERROR_AUDIO -> "The microphone could not capture audio."
      SpeechRecognizer.ERROR_CLIENT -> "Voice capture was interrupted."
      SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Microphone permission is required."
      SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Speech recognition could not finish. Try again."
      SpeechRecognizer.ERROR_NO_MATCH -> "I did not catch that. Please try again."
      SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "Speech recognition is busy. Try again in a moment."
      SpeechRecognizer.ERROR_SERVER -> "Speech recognition is unavailable right now."
      SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "I did not hear anything. Please try again."
      else -> "Speech recognition failed. Please try again."
    }

  private fun playWakeFeedback() {
    try {
      ToneGenerator(AudioManager.STREAM_NOTIFICATION, 80)
        .startTone(ToneGenerator.TONE_PROP_ACK, 140)
    } catch (_: Exception) {
      // Audio feedback is best effort.
    }

    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val manager = getSystemService(VibratorManager::class.java)
        manager.defaultVibrator.vibrate(VibrationEffect.createOneShot(80, VibrationEffect.DEFAULT_AMPLITUDE))
      } else {
        @Suppress("DEPRECATION")
        (getSystemService(Context.VIBRATOR_SERVICE) as Vibrator).vibrate(80)
      }
    } catch (_: Exception) {
      // Vibration is best effort.
    }
  }

  private fun maybeOpenApp() {
    if (!JarvisAssistantPrefs.readSettings(this).openAppOnAnswer) {
      return
    }

    val launchIntent = packageManager.getLaunchIntentForPackage(packageName) ?: Intent(this, MainActivity::class.java)
    launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    startActivity(launchIntent)
  }

  private fun acquireWakeLock() {
    releaseWakeLock()

    try {
      val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
      wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "MemoryOS:JarvisCommand").apply {
        setReferenceCounted(false)
        acquire(WAKE_LOCK_TIMEOUT_MS)
      }
    } catch (_: Exception) {
      wakeLock = null
    }
  }

  private fun releaseWakeLock() {
    try {
      if (wakeLock?.isHeld == true) {
        wakeLock?.release()
      }
    } catch (_: Exception) {
      // Wake lock release is best effort.
    } finally {
      wakeLock = null
    }
  }

  private fun startForegroundIfNeeded() {
    if (foregroundStarted) {
      updateNotification()
      return
    }

    startForeground(NOTIFICATION_ID, buildNotification())
    foregroundStarted = true
  }

  private fun updateNotification() {
    if (!foregroundStarted) {
      return
    }

    val manager = getSystemService(NotificationManager::class.java)
    manager.notify(NOTIFICATION_ID, buildNotification())
  }

  private fun buildNotification(): Notification {
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName) ?: Intent(this, MainActivity::class.java)
    val contentIntent = PendingIntent.getActivity(
      this,
      100,
      launchIntent,
      pendingIntentFlags()
    )
    val status = JarvisAssistantPrefs.readStatus(this)
    val text = when (status.state) {
      STATE_RECORDING -> "Listening for your command"
      STATE_PROCESSING -> "Asking MemoryOS"
      STATE_SPEAKING -> "Speaking the answer"
      STATE_PAUSED -> "Paused"
      STATE_ERROR -> status.message.ifBlank { "Manual mode available" }
      STATE_LISTENING -> "Wake word: ${JarvisAssistantPrefs.readSettings(this).wakeKeyword}"
      else -> "Tap Ask Jarvis or enable wake-word detection"
    }
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }

    builder
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle("MemoryOS Jarvis is ready")
      .setContentText(text)
      .setContentIntent(contentIntent)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setShowWhen(false)

    addNotificationAction(builder, ACTION_ASK, "Ask Jarvis", 101)
    addNotificationAction(builder, ACTION_PAUSE, "Pause", 102)
    addNotificationAction(builder, ACTION_RESUME, "Resume", 103)
    addNotificationAction(builder, ACTION_STOP, "Stop", 104)

    return builder.build()
  }

  private fun addNotificationAction(
    builder: Notification.Builder,
    action: String,
    label: String,
    requestCode: Int
  ) {
    val pendingIntent = PendingIntent.getService(
      this,
      requestCode,
      Intent(this, JarvisAssistantService::class.java).setAction(action),
      pendingIntentFlags()
    )

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      builder.addAction(
        Notification.Action.Builder(R.mipmap.ic_launcher, label, pendingIntent).build()
      )
    } else {
      @Suppress("DEPRECATION")
      builder.addAction(R.mipmap.ic_launcher, label, pendingIntent)
    }
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return
    }

    val manager = getSystemService(NotificationManager::class.java)
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Jarvis assistant",
      NotificationManager.IMPORTANCE_LOW
    ).apply {
      description = "Persistent wake-word listening status for MemoryOS Jarvis."
      setSound(null, null)
    }

    manager.createNotificationChannel(channel)
  }

  private fun stopForegroundCompat() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }

    foregroundStarted = false
  }

  private fun pendingIntentFlags(): Int =
    PendingIntent.FLAG_UPDATE_CURRENT or
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0

  companion object {
    const val ACTION_START = "com.anonymous.memorymobile.jarvis.START"
    const val ACTION_ASK = "com.anonymous.memorymobile.jarvis.ASK"
    const val ACTION_PAUSE = "com.anonymous.memorymobile.jarvis.PAUSE"
    const val ACTION_RESUME = "com.anonymous.memorymobile.jarvis.RESUME"
    const val ACTION_STOP = "com.anonymous.memorymobile.jarvis.STOP"
    const val ACTION_TEST_WAKE = "com.anonymous.memorymobile.jarvis.TEST_WAKE"
    const val CHANNEL_ID = "memoryos-jarvis-assistant"
    const val NOTIFICATION_ID = 4517
    const val STATE_OFF = "off"
    const val STATE_READY = "ready"
    const val STATE_LISTENING = "listening"
    const val STATE_RECORDING = "recording"
    const val STATE_PROCESSING = "processing"
    const val STATE_SPEAKING = "speaking"
    const val STATE_PAUSED = "paused"
    const val STATE_ERROR = "error"
    const val STATE_TESTING = "testing"
    private const val COMMAND_TIMEOUT_MS = 12_000L
    private const val RETURN_TO_WAKE_DELAY_MS = 350L
    private const val WAKE_LOCK_TIMEOUT_MS = 60_000L
    private const val UTTERANCE_REPLY = "memoryos-jarvis-reply"
    private const val MAX_TTS_CHARS = 900
    private const val TAG = "JarvisWake"

    fun start(context: Context) {
      val intent = Intent(context, JarvisAssistantService::class.java).setAction(ACTION_START)

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    }

    fun sendAction(context: Context, action: String) {
      val intent = Intent(context, JarvisAssistantService::class.java).setAction(action)

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && action != ACTION_STOP) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    }

    fun openBatteryOptimizationSettings(context: Context) {
      val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }

    fun requestIgnoreBatteryOptimization(context: Context) {
      val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
        .setData(Uri.parse("package:${context.packageName}"))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }
  }
}
