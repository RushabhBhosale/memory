package com.anonymous.memorymobile

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale
import java.util.UUID
import kotlin.math.min

private const val EXPENSE_PREFS = "memoryos_expense_sms"
private const val PENDING_KEY = "pending_transactions"
private const val EXPENSES_KEY = "expenses"

object ExpenseTransactionStore {
  fun addExpense(
    context: Context,
    amount: Double,
    currency: String,
    merchant: String,
    category: String,
    type: String,
    source: String,
    originalPreview: String,
    timestamp: Long
  ): JSONObject {
    val now = System.currentTimeMillis()
    val expense = JSONObject().apply {
      put("id", UUID.randomUUID().toString())
      put("amount", amount)
      put("currency", currency)
      put("merchant", merchant.ifBlank { "Unknown Merchant" })
      put("category", category.ifBlank { "general" })
      put("type", type)
      put("source", source)
      put("originalSmsPreview", safePreview(originalPreview))
      put("timestamp", timestamp)
      put("createdAt", now)
    }
    val expenses = readArray(context, EXPENSES_KEY)
    expenses.put(expense)
    writeArray(context, EXPENSES_KEY, expenses)
    return expense
  }

  fun addPending(context: Context, parsed: ParsedSmsTransaction): JSONObject? {
    val now = System.currentTimeMillis()
    val preview = safePreview(parsed.messageBody)
    val existingExpenseWasUpdated = updateExistingExpense(context, parsed, preview)

    if (existingExpenseWasUpdated) {
      return null
    }

    val existing = findExistingTransaction(context, parsed.sender, preview)

    if (existing != null) {
      existing.put("amount", parsed.amount)
      existing.put("currency", parsed.currency)
      existing.put("merchant", parsed.merchant)
      existing.put("type", parsed.type)
      existing.put("category", categoryForMerchant(parsed.merchant))
      existing.put("confidence", parsed.confidence)
      existing.put("updatedAt", now)
      updateMatchingPending(context, parsed.sender, preview, existing)
      return existing
    }

    val item = JSONObject().apply {
      put("id", UUID.randomUUID().toString())
      put("amount", parsed.amount)
      put("currency", parsed.currency)
      put("merchant", parsed.merchant)
      put("type", parsed.type)
      put("category", categoryForMerchant(parsed.merchant))
      put("sender", parsed.sender)
      put("messagePreview", preview)
      put("timestamp", parsed.timestamp)
      put("confidence", parsed.confidence)
      put("status", "pending")
      put("createdAt", now)
      put("updatedAt", now)
    }

    val pending = readArray(context, PENDING_KEY)
    pending.put(item)
    writeArray(context, PENDING_KEY, pending)
    return item
  }

  fun listPending(context: Context): JSONArray {
    val pending = readArray(context, PENDING_KEY)
    val visible = JSONArray()
    val seen = mutableSetOf<String>()

    for (index in 0 until pending.length()) {
      val item = pending.optJSONObject(index) ?: continue

      if (item.optString("status") != "pending") {
        continue
      }

      val key = duplicateKey(
        item.optString("sender"),
        item.optString("messagePreview"),
        item.optDouble("amount", 0.0)
      )

      if (seen.contains(key)) {
        continue
      }

      seen.add(key)
      visible.put(item)
    }

    return visible
  }

  fun listExpenses(context: Context): JSONArray = readArray(context, EXPENSES_KEY)

  fun smsDebugStats(context: Context): JSONObject {
    val pending = readArray(context, PENDING_KEY)
    val expenses = readArray(context, EXPENSES_KEY)
    var totalSmsExpenses = 0
    var lastDetectedAt = 0L

    for (index in 0 until expenses.length()) {
      val item = expenses.optJSONObject(index) ?: continue

      if (item.optString("source") != "sms") {
        continue
      }

      totalSmsExpenses += 1
      lastDetectedAt = maxOf(lastDetectedAt, item.optLong("timestamp", 0L))
      lastDetectedAt = maxOf(lastDetectedAt, item.optLong("createdAt", 0L))
    }

    for (index in 0 until pending.length()) {
      val item = pending.optJSONObject(index) ?: continue
      lastDetectedAt = maxOf(lastDetectedAt, item.optLong("timestamp", 0L))
      lastDetectedAt = maxOf(lastDetectedAt, item.optLong("createdAt", 0L))
    }

    return JSONObject().apply {
      put("lastDetectedExpenseTime", if (lastDetectedAt > 0L) lastDetectedAt else JSONObject.NULL)
      put("totalExpensesDetectedFromSms", totalSmsExpenses)
    }
  }

  fun deleteExpense(context: Context, id: String): Boolean {
    val expenses = readArray(context, EXPENSES_KEY)
    val nextExpenses = JSONArray()
    var deleted = false

    for (index in 0 until expenses.length()) {
      val item = expenses.optJSONObject(index) ?: continue

      if (item.optString("id") == id) {
        deleted = true
        continue
      }

      nextExpenses.put(item)
    }

    if (deleted) {
      writeArray(context, EXPENSES_KEY, nextExpenses)
    }

    return deleted
  }

  fun updatePending(context: Context, id: String, updates: JSONObject): JSONObject? {
    val pending = readArray(context, PENDING_KEY)
    var updated: JSONObject? = null

    for (index in 0 until pending.length()) {
      val item = pending.optJSONObject(index) ?: continue
      if (item.optString("id") != id) {
        continue
      }

      for (key in updates.keys()) {
        item.put(key, updates.get(key))
      }
      item.put("updatedAt", System.currentTimeMillis())
      updated = item
      break
    }

    writeArray(context, PENDING_KEY, pending)
    return updated
  }

  fun ignorePending(context: Context, id: String): JSONObject? =
    updatePending(context, id, JSONObject().put("status", "ignored"))

  fun confirmPending(context: Context, id: String, updates: JSONObject? = null): JSONObject? {
    val pending = readArray(context, PENDING_KEY)
    var confirmed: JSONObject? = null

    for (index in 0 until pending.length()) {
      val item = pending.optJSONObject(index) ?: continue
      if (item.optString("id") != id) {
        continue
      }

      if (updates != null) {
        for (key in updates.keys()) {
          item.put(key, updates.get(key))
        }
      }

      val now = System.currentTimeMillis()
      item.put("status", "confirmed")
      item.put("updatedAt", now)
      confirmed = item

      val expense = JSONObject().apply {
        put("id", UUID.randomUUID().toString())
        put("amount", item.optDouble("amount", 0.0))
        put("currency", item.optString("currency", "INR"))
        put("merchant", item.optString("merchant", "Unknown Merchant"))
        put("category", item.optString("category", "general"))
        put("type", if (item.optString("type") == "credit") "income" else "expense")
        put("source", "sms")
        put("originalSmsPreview", item.optString("messagePreview"))
        put("timestamp", item.optLong("timestamp", now))
        put("createdAt", now)
      }

      val expenses = readArray(context, EXPENSES_KEY)
      expenses.put(expense)
      writeArray(context, EXPENSES_KEY, expenses)
      break
    }

    writeArray(context, PENDING_KEY, pending)
    return confirmed
  }

  fun categoryForMerchant(merchant: String): String {
    val normalized = merchant.lowercase(Locale.US)

    return when {
      listOf("zomato", "swiggy", "eatclub", "domino").any { normalized.contains(it) } -> "food"
      listOf("amazon", "flipkart", "myntra").any { normalized.contains(it) } -> "shopping"
      listOf("uber", "ola", "rapido").any { normalized.contains(it) } -> "travel"
      listOf("jio", "airtel", "electricity").any { normalized.contains(it) } -> "bills"
      else -> "general"
    }
  }

  private fun safePreview(message: String): String {
    val normalized = message.replace(Regex("\\s+"), " ").trim()
    return normalized.substring(0, min(normalized.length, 180))
  }

  private fun findExistingTransaction(
    context: Context,
    sender: String,
    preview: String
  ): JSONObject? {
    val pending = readArray(context, PENDING_KEY)
    var existing: JSONObject? = null

    for (index in 0 until pending.length()) {
      val item = pending.optJSONObject(index) ?: continue

      if (
        item.optString("sender") == sender &&
          item.optString("messagePreview") == preview
      ) {
        existing = item
        break
      }
    }

    return existing
  }

  private fun updateExistingExpense(
    context: Context,
    parsed: ParsedSmsTransaction,
    preview: String
  ): Boolean {
    val expenses = readArray(context, EXPENSES_KEY)
    var updated = false

    for (index in 0 until expenses.length()) {
      val item = expenses.optJSONObject(index) ?: continue
      val samePreview = item.optString("originalSmsPreview") == preview
      val sameAmount = kotlin.math.abs(item.optDouble("amount", 0.0) - parsed.amount) < 0.01

      if (!samePreview || !sameAmount) {
        continue
      }

      item.put("type", if (parsed.type == "credit") "income" else "expense")
      item.put("merchant", parsed.merchant)
      item.put("category", categoryForMerchant(parsed.merchant))
      updated = true
    }

    if (updated) {
      writeArray(context, EXPENSES_KEY, expenses)
      removeMatchingPending(context, parsed.sender, preview, parsed.amount)
    }

    return updated
  }

  private fun updateMatchingPending(
    context: Context,
    sender: String,
    preview: String,
    replacement: JSONObject
  ) {
    val pending = readArray(context, PENDING_KEY)

    for (index in 0 until pending.length()) {
      val item = pending.optJSONObject(index) ?: continue

      if (item.optString("sender") == sender && item.optString("messagePreview") == preview) {
        pending.put(index, replacement)
        break
      }
    }

    writeArray(context, PENDING_KEY, pending)
  }

  private fun removeMatchingPending(
    context: Context,
    sender: String,
    preview: String,
    amount: Double
  ) {
    val pending = readArray(context, PENDING_KEY)
    val nextPending = JSONArray()

    for (index in 0 until pending.length()) {
      val item = pending.optJSONObject(index) ?: continue
      val sameSender = item.optString("sender") == sender
      val samePreview = item.optString("messagePreview") == preview
      val sameAmount = kotlin.math.abs(item.optDouble("amount", 0.0) - amount) < 0.01

      if (sameSender && samePreview && sameAmount) {
        continue
      }

      nextPending.put(item)
    }

    writeArray(context, PENDING_KEY, nextPending)
  }

  private fun duplicateKey(sender: String, preview: String, amount: Double): String {
    val normalizedPreview = preview.lowercase(Locale.US).replace(Regex("\\s+"), " ").trim()
    return "${sender.lowercase(Locale.US)}|$normalizedPreview|${"%.2f".format(Locale.US, amount)}"
  }

  private fun readArray(context: Context, key: String): JSONArray {
    val value = context.getSharedPreferences(EXPENSE_PREFS, Context.MODE_PRIVATE).getString(key, "[]")
    return try {
      JSONArray(value ?: "[]")
    } catch (_: Exception) {
      JSONArray()
    }
  }

  private fun writeArray(context: Context, key: String, value: JSONArray) {
    context
      .getSharedPreferences(EXPENSE_PREFS, Context.MODE_PRIVATE)
      .edit()
      .putString(key, value.toString())
      .commit()
  }
}
