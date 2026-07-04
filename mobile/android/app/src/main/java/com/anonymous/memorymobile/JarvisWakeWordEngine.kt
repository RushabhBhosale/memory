package com.anonymous.memorymobile

import android.content.Context
import android.util.Log
import edu.cmu.pocketsphinx.Assets
import edu.cmu.pocketsphinx.Hypothesis
import edu.cmu.pocketsphinx.RecognitionListener
import edu.cmu.pocketsphinx.SpeechRecognizer
import edu.cmu.pocketsphinx.SpeechRecognizerSetup
import java.io.File

interface WakeWordEngine {
  val name: String
  fun start()
  fun stop()
  fun release()
}

data class WakeWordEngineSetup(
  val engine: WakeWordEngine?,
  val engineName: String,
  val available: Boolean,
  val message: String,
  val ready: Boolean
)

object PocketSphinxAssetStore {
  fun hasRequiredAssets(context: Context): Boolean =
    assetExists(context, "sync/assets.lst") &&
      assetExists(context, "sync/cmudict-en-us.dict") &&
      assetListHasAnyFile(context, "sync/en-us-ptm")

  private fun assetExists(context: Context, path: String): Boolean =
    try {
      context.assets.open(path).use { true }
    } catch (_: Exception) {
      false
    }

  private fun assetListHasAnyFile(context: Context, path: String): Boolean =
    try {
      !context.assets.list(path).isNullOrEmpty()
    } catch (_: Exception) {
      false
    }
}

class PocketSphinxWakeEngine private constructor(
  override val name: String,
  private val recognizer: SpeechRecognizer,
  private val keyword: String,
  private val onWakeWordDetected: () -> Unit
) : WakeWordEngine, RecognitionListener {
  private var running = false

  override fun start() {
    if (running) {
      return
    }

    Log.i(TAG, "Starting PocketSphinx keyword spotting for '$keyword'")
    recognizer.startListening(KWS_SEARCH)
    running = true
  }

  override fun stop() {
    if (!running) {
      return
    }

    try {
      recognizer.stop()
    } catch (error: Exception) {
      Log.w(TAG, "PocketSphinx stop failed", error)
    } finally {
      running = false
    }
  }

  override fun release() {
    try {
      recognizer.cancel()
    } catch (_: Exception) {
      // The recognizer may already be stopped.
    }

    try {
      recognizer.shutdown()
    } catch (error: Exception) {
      Log.w(TAG, "PocketSphinx shutdown failed", error)
    } finally {
      running = false
    }
  }

  override fun onPartialResult(hypothesis: Hypothesis?) {
    val text = hypothesis?.hypstr?.lowercase()?.trim().orEmpty()

    if (text == keyword || text.split(" ").contains(keyword)) {
      Log.i(TAG, "PocketSphinx detected wake keyword '$keyword'")
      onWakeWordDetected()
    }
  }

  override fun onResult(hypothesis: Hypothesis?) = Unit

  override fun onBeginningOfSpeech() = Unit

  override fun onEndOfSpeech() = Unit

  override fun onError(error: Exception?) {
    Log.w(TAG, "PocketSphinx keyword spotting error", error)
  }

  override fun onTimeout() {
    if (running) {
      recognizer.startListening(KWS_SEARCH)
    }
  }

  companion object {
    const val ENGINE_NAME = "pocketsphinx"
    private const val TAG = "JarvisWake"
    private const val KWS_SEARCH = "jarvis_wake"
    private const val ACOUSTIC_MODEL_DIR = "en-us-ptm"
    private const val DICTIONARY_FILE = "cmudict-en-us.dict"

    fun create(
      context: Context,
      settings: JarvisAssistantSettings,
      onWakeWordDetected: () -> Unit
    ): WakeWordEngineSetup {
      if (!PocketSphinxAssetStore.hasRequiredAssets(context)) {
        return WakeWordEngineSetup(
          engine = null,
          engineName = ENGINE_NAME,
          available = false,
          message = "PocketSphinx assets are missing. Manual Jarvis mode is ready.",
          ready = false
        )
      }

      return try {
        val assetsDir = Assets(context).syncAssets()
        val recognizer = SpeechRecognizerSetup.defaultSetup()
          .setAcousticModel(File(assetsDir, ACOUSTIC_MODEL_DIR))
          .setDictionary(File(assetsDir, DICTIONARY_FILE))
          .setKeywordThreshold(keywordThreshold(settings.wakeSensitivity))
          .getRecognizer()
        val engine = PocketSphinxWakeEngine(
          ENGINE_NAME,
          recognizer,
          settings.wakeKeyword.lowercase().ifBlank { JarvisAssistantPrefs.DEFAULT_WAKE_KEYWORD },
          onWakeWordDetected
        )

        recognizer.addListener(engine)
        recognizer.addKeyphraseSearch(KWS_SEARCH, engine.keyword)

        WakeWordEngineSetup(
          engine = engine,
          engineName = ENGINE_NAME,
          available = true,
          message = "PocketSphinx wake-word detection is ready.",
          ready = true
        )
      } catch (error: Exception) {
        Log.w(TAG, "PocketSphinx setup failed", error)
        WakeWordEngineSetup(
          engine = null,
          engineName = ENGINE_NAME,
          available = false,
          message = error.message ?: JarvisAssistantPrefs.WAKE_ENGINE_UNAVAILABLE_MESSAGE,
          ready = false
        )
      }
    }

    private fun keywordThreshold(sensitivity: Double): Float {
      val clamped = sensitivity.coerceIn(0.0, 1.0)
      val exponent = -10.0 - (clamped * 30.0)
      return Math.pow(10.0, exponent).toFloat()
    }
  }
}

class ManualNotificationWakeEngine(
  private val onWakeWordDetected: () -> Unit
) : WakeWordEngine {
  override val name = "manual-notification"

  override fun start() = Unit

  override fun stop() = Unit

  override fun release() = Unit

  fun askNow() {
    onWakeWordDetected()
  }
}
