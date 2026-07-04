package com.anonymous.memorymobile

import android.content.Context

data class JarvisAssistantSettings(
  val enabled: Boolean,
  val wakeWordDetectionEnabled: Boolean,
  val manualModeEnabled: Boolean,
  val speakAnswers: Boolean,
  val openAppOnAnswer: Boolean,
  val apiRoot: String,
  val apiKey: String,
  val wakePhrase: String,
  val wakeKeyword: String,
  val wakeSensitivity: Double
)

data class JarvisAssistantStatus(
  val enabled: Boolean,
  val state: String,
  val message: String,
  val wakeWordReady: Boolean,
  val wakeWordAvailable: Boolean,
  val wakeWordEngine: String,
  val lastTranscript: String,
  val lastAnswer: String,
  val lastError: String
)

object JarvisAssistantPrefs {
  const val DEFAULT_WAKE_PHRASE = "Hey Jarvis / Jarvis"
  const val DEFAULT_WAKE_KEYWORD = "jarvis"
  const val DEFAULT_WAKE_SENSITIVITY = 0.7
  const val WAKE_ENGINE_UNAVAILABLE_MESSAGE =
    "PocketSphinx wake-word detection is unavailable. Manual Jarvis mode is ready."
  private const val PREFS_NAME = "memoryos_jarvis_assistant"
  private const val KEY_ENABLED = "enabled"
  private const val KEY_WAKE_WORD_DETECTION_ENABLED = "wake_word_detection_enabled"
  private const val KEY_MANUAL_MODE_ENABLED = "manual_mode_enabled"
  private const val KEY_SPEAK_ANSWERS = "speak_answers"
  private const val KEY_OPEN_APP_ON_ANSWER = "open_app_on_answer"
  private const val KEY_API_ROOT = "api_root"
  private const val KEY_API_KEY = "api_key"
  private const val KEY_WAKE_PHRASE = "wake_phrase"
  private const val KEY_WAKE_KEYWORD = "wake_keyword"
  private const val KEY_WAKE_SENSITIVITY = "wake_sensitivity"
  private const val KEY_STATE = "state"
  private const val KEY_STATUS_MESSAGE = "status_message"
  private const val KEY_WAKE_WORD_READY = "wake_word_ready"
  private const val KEY_WAKE_WORD_AVAILABLE = "wake_word_available"
  private const val KEY_WAKE_WORD_ENGINE = "wake_word_engine"
  private const val KEY_LAST_TRANSCRIPT = "last_transcript"
  private const val KEY_LAST_ANSWER = "last_answer"
  private const val KEY_LAST_ERROR = "last_error"

  fun readSettings(context: Context): JarvisAssistantSettings {
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    return JarvisAssistantSettings(
      enabled = prefs.getBoolean(KEY_ENABLED, false),
      wakeWordDetectionEnabled = prefs.getBoolean(KEY_WAKE_WORD_DETECTION_ENABLED, false),
      manualModeEnabled = prefs.getBoolean(KEY_MANUAL_MODE_ENABLED, true),
      speakAnswers = prefs.getBoolean(KEY_SPEAK_ANSWERS, true),
      openAppOnAnswer = prefs.getBoolean(KEY_OPEN_APP_ON_ANSWER, false),
      apiRoot = normalizeApiRoot(prefs.getString(KEY_API_ROOT, "").orEmpty()),
      apiKey = prefs.getString(KEY_API_KEY, "").orEmpty(),
      wakePhrase = prefs.getString(KEY_WAKE_PHRASE, DEFAULT_WAKE_PHRASE)
        .orEmpty()
        .ifBlank { DEFAULT_WAKE_PHRASE },
      wakeKeyword = prefs.getString(KEY_WAKE_KEYWORD, DEFAULT_WAKE_KEYWORD)
        .orEmpty()
        .lowercase()
        .ifBlank { DEFAULT_WAKE_KEYWORD },
      wakeSensitivity = prefs.getFloat(KEY_WAKE_SENSITIVITY, DEFAULT_WAKE_SENSITIVITY.toFloat())
        .toDouble()
        .coerceIn(0.0, 1.0)
    )
  }

  fun saveSettings(context: Context, settings: JarvisAssistantSettings) {
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .edit()
      .putBoolean(KEY_ENABLED, settings.enabled)
      .putBoolean(KEY_WAKE_WORD_DETECTION_ENABLED, settings.wakeWordDetectionEnabled)
      .putBoolean(KEY_MANUAL_MODE_ENABLED, settings.manualModeEnabled)
      .putBoolean(KEY_SPEAK_ANSWERS, settings.speakAnswers)
      .putBoolean(KEY_OPEN_APP_ON_ANSWER, settings.openAppOnAnswer)
      .putString(KEY_API_ROOT, normalizeApiRoot(settings.apiRoot))
      .putString(KEY_API_KEY, settings.apiKey)
      .putString(KEY_WAKE_PHRASE, settings.wakePhrase.ifBlank { DEFAULT_WAKE_PHRASE })
      .putString(KEY_WAKE_KEYWORD, settings.wakeKeyword.lowercase().ifBlank { DEFAULT_WAKE_KEYWORD })
      .putFloat(KEY_WAKE_SENSITIVITY, settings.wakeSensitivity.coerceIn(0.0, 1.0).toFloat())
      .apply()
  }

  fun setEnabled(context: Context, enabled: Boolean): JarvisAssistantSettings {
    val next = readSettings(context).copy(enabled = enabled)
    saveSettings(context, next)
    return next
  }

  fun saveStatus(
    context: Context,
    state: String,
    message: String = "",
    wakeWordReady: Boolean = false,
    wakeWordAvailable: Boolean = false,
    wakeWordEngine: String = "manual",
    lastError: String = ""
  ) {
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .edit()
      .putString(KEY_STATE, state)
      .putString(KEY_STATUS_MESSAGE, message)
      .putBoolean(KEY_WAKE_WORD_READY, wakeWordReady)
      .putBoolean(KEY_WAKE_WORD_AVAILABLE, wakeWordAvailable)
      .putString(KEY_WAKE_WORD_ENGINE, wakeWordEngine)
      .putString(KEY_LAST_ERROR, lastError)
      .apply()
  }

  fun saveLastResult(context: Context, transcript: String, answer: String) {
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .edit()
      .putString(KEY_LAST_TRANSCRIPT, transcript)
      .putString(KEY_LAST_ANSWER, answer)
      .putString(KEY_LAST_ERROR, "")
      .apply()
  }

  fun saveLastError(context: Context, error: String) {
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .edit()
      .putString(KEY_LAST_ERROR, error)
      .apply()
  }

  fun readStatus(context: Context): JarvisAssistantStatus {
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val settings = readSettings(context)

    return JarvisAssistantStatus(
      enabled = settings.enabled,
      state = prefs.getString(KEY_STATE, if (settings.enabled) "starting" else "off").orEmpty(),
      message = prefs.getString(KEY_STATUS_MESSAGE, "").orEmpty(),
      wakeWordReady = prefs.getBoolean(KEY_WAKE_WORD_READY, false),
      wakeWordAvailable = prefs.getBoolean(KEY_WAKE_WORD_AVAILABLE, false),
      wakeWordEngine = prefs.getString(KEY_WAKE_WORD_ENGINE, "manual").orEmpty(),
      lastTranscript = prefs.getString(KEY_LAST_TRANSCRIPT, "").orEmpty(),
      lastAnswer = prefs.getString(KEY_LAST_ANSWER, "").orEmpty(),
      lastError = prefs.getString(KEY_LAST_ERROR, "").orEmpty()
    )
  }

  fun normalizeApiRoot(value: String): String {
    val trimmed = value.trim().trimEnd('/')

    return when {
      trimmed.endsWith("/api/assistant/command") -> trimmed.removeSuffix("/api/assistant/command")
      trimmed.endsWith("/api/ask-memory") -> trimmed.removeSuffix("/api/ask-memory")
      trimmed.endsWith("/api/memories") -> trimmed.removeSuffix("/api/memories")
      trimmed.endsWith("/api") -> trimmed.removeSuffix("/api")
      else -> trimmed
    }
  }
}
