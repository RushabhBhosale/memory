package com.anonymous.memorymobile

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

object ScreenshotInboxStore {
  private const val PREFS_NAME = "memoryos_screenshot_inbox"
  private const val ITEMS_KEY = "items"
  private const val LAST_PROCESSED_KEY = "lastProcessedTimestamp"

  fun addDetected(context: Context, imageUri: String, capturedAt: Long): JSONObject? {
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val lastProcessed = prefs.getLong(LAST_PROCESSED_KEY, 0L)

    if (capturedAt <= lastProcessed) {
      return null
    }

    val items = listLocal(context)
    val existing = findByImageUri(items, imageUri)

    prefs.edit().putLong(LAST_PROCESSED_KEY, maxOf(lastProcessed, capturedAt)).apply()

    if (existing != null) {
      return null
    }

    val item =
      JSONObject().apply {
        put("id", "screenshot-$capturedAt-${kotlin.math.abs(imageUri.hashCode())}")
        put("imageUri", imageUri)
        put("capturedAt", capturedAt)
        put("processed", false)
        put("dismissed", false)
        put("saveRequested", false)
        put("synced", false)
        put("createdAt", System.currentTimeMillis())
      }

    items.put(item)
    writeItems(context, items)
    return item
  }

  fun listLocal(context: Context): JSONArray {
    val raw = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getString(ITEMS_KEY, "[]")
    return try {
      JSONArray(raw ?: "[]")
    } catch (_: Exception) {
      JSONArray()
    }
  }

  fun markSaveRequested(context: Context, id: String): JSONObject? =
    update(context, id) { item ->
      item.put("saveRequested", true)
      item.put("dismissed", false)
    }

  fun markLater(context: Context, id: String): JSONObject? =
    update(context, id) { item ->
      item.put("dismissed", false)
    }

  fun markIgnored(context: Context, id: String): JSONObject? =
    update(context, id) { item ->
      item.put("dismissed", true)
      item.put("saveRequested", false)
    }

  fun markSynced(context: Context, id: String): JSONObject? =
    update(context, id) { item ->
      item.put("synced", true)
    }

  private fun update(context: Context, id: String, block: (JSONObject) -> Unit): JSONObject? {
    val items = listLocal(context)
    var updated: JSONObject? = null

    for (index in 0 until items.length()) {
      val item = items.optJSONObject(index) ?: continue

      if (item.optString("id") == id) {
        block(item)
        item.put("updatedAt", System.currentTimeMillis())
        updated = item
        break
      }
    }

    writeItems(context, items)
    return updated
  }

  private fun findByImageUri(items: JSONArray, imageUri: String): JSONObject? {
    for (index in 0 until items.length()) {
      val item = items.optJSONObject(index) ?: continue

      if (item.optString("imageUri") == imageUri) {
        return item
      }
    }

    return null
  }

  private fun writeItems(context: Context, items: JSONArray) {
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .edit()
      .putString(ITEMS_KEY, items.toString())
      .apply()
  }
}
