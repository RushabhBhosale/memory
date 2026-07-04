package com.anonymous.memorymobile

import android.content.Context
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets

data class JarvisAssistantClientResult(
  val answer: String,
  val mode: String
)

object JarvisAssistantClient {
  private const val SESSION_ID = "jarvis-android"

  fun send(context: Context, transcript: String): JarvisAssistantClientResult {
    val settings = JarvisAssistantPrefs.readSettings(context)
    val apiRoot = JarvisAssistantPrefs.normalizeApiRoot(settings.apiRoot)

    if (apiRoot.isBlank()) {
      throw IllegalStateException("MemoryOS API URL is missing. Open Jarvis settings once while the app has EXPO_PUBLIC_API_URL configured.")
    }

    val trimmed = transcript.trim()
    val commandPayload = buildCommandPayload(trimmed)
    val isCommand = commandPayload != null
    val endpoint = if (isCommand) {
      "$apiRoot/api/assistant/command"
    } else {
      "$apiRoot/api/ask-memory"
    }
    val payload = commandPayload ?: JSONObject().put("query", trimmed)
    val body = postJson(endpoint, payload, settings.apiKey)
    val json = JSONObject(body)
    val error = json.optString("error").trim()

    if (error.isNotBlank()) {
      throw IllegalStateException(error)
    }

    val answer = json.optString("answer").trim()
      .ifBlank { json.optString("message").trim() }
      .ifBlank { "Done." }

    return JarvisAssistantClientResult(answer = answer, mode = if (isCommand) "command" else "ask")
  }

  private fun buildCommandPayload(input: String): JSONObject? {
    if (input.startsWith("@")) {
      return baseCommandPayload(input)
    }

    val memoryContent = extractExplicitMemoryContent(input)

    if (!memoryContent.isNullOrBlank()) {
      return baseCommandPayload(input)
        .put(
          "save",
          JSONObject()
            .put("type", "memory")
            .put("content", memoryContent)
        )
    }

    if (
      Regex("^(?:remember this|save this|note this|store this)\\b", RegexOption.IGNORE_CASE)
        .containsMatchIn(input) ||
      Regex("^remind\\s+me\\b", RegexOption.IGNORE_CASE).containsMatchIn(input)
    ) {
      return baseCommandPayload(input)
    }

    return null
  }

  private fun baseCommandPayload(input: String) =
    JSONObject()
      .put("input", input)
      .put("sessionId", SESSION_ID)

  private fun extractExplicitMemoryContent(input: String): String? {
    val patterns = listOf(
      Regex("^(?:add|create|save|store)\\s+(?:a\\s+)?memory\\s+(?:that|about|for)?\\s*:?\\s+(.+)$", RegexOption.IGNORE_CASE),
      Regex("^(?:add|create|save|store)\\s+(?:this\\s+)?(?:as\\s+)?(?:a\\s+)?memory\\s*:?\\s+(.+)$", RegexOption.IGNORE_CASE)
    )

    return patterns.firstNotNullOfOrNull { pattern ->
      pattern.find(input)?.groupValues?.getOrNull(1)?.trim()?.takeIf { it.isNotBlank() }
    }
  }

  private fun postJson(endpoint: String, payload: JSONObject, apiKey: String): String {
    val connection = (URL(endpoint).openConnection() as HttpURLConnection).apply {
      requestMethod = "POST"
      connectTimeout = 15_000
      readTimeout = 45_000
      doOutput = true
      setRequestProperty("Content-Type", "application/json")
      setRequestProperty("Accept", "application/json")

      if (apiKey.isNotBlank()) {
        setRequestProperty("x-api-key", apiKey)
      }
    }

    try {
      OutputStreamWriter(connection.outputStream, StandardCharsets.UTF_8).use { writer ->
        writer.write(payload.toString())
      }

      val responseCode = connection.responseCode
      val responseStream = if (responseCode in 200..299) {
        connection.inputStream
      } else {
        connection.errorStream ?: connection.inputStream
      }
      val response = BufferedReader(InputStreamReader(responseStream, StandardCharsets.UTF_8))
        .use { reader -> reader.readText() }

      if (responseCode !in 200..299) {
        val message = response.takeIf { it.isNotBlank() }
          ?.let { body ->
            try {
              JSONObject(body).optString("error").ifBlank {
                JSONObject(body).optString("message")
              }
            } catch (_: Exception) {
              body
            }
          }
          ?.takeIf { it.isNotBlank() }
          ?: "MemoryOS API failed with status $responseCode."

        throw IllegalStateException(message)
      }

      return response.ifBlank { "{}" }
    } finally {
      connection.disconnect()
    }
  }
}
