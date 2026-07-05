package com.anonymous.memonest

import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale
import kotlin.math.max
import kotlin.math.min

private const val OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"
private const val OPENROUTER_MODEL = "qwen/qwen3-next-80b-a3b-instruct:free"
private const val AI_CONFIDENCE_REVIEW_THRESHOLD = 0.75
private const val LOG_TAG = "MemoryExpenseSms"

data class SmsTransactionClassification(
  val isTransaction: Boolean,
  val type: String,
  val amount: Double?,
  val currency: String,
  val merchant: String,
  val accountHint: String?,
  val transactionDateTime: String?,
  val confidence: Double,
  val reason: String
)

object SmsTransactionAiFallback {
  private val allowedTypes =
    setOf("debit", "credit", "refund", "transfer", "bill_payment", "cash_withdrawal", "unknown")
  private val amountLikeRegex =
    Regex("(?i)(?:₹|rs\\.?|inr)\\s*[0-9][0-9,]*(?:\\.\\d{1,2})?|\\b[0-9][0-9,]*\\.\\d{1,2}\\b")

  fun hasAmountLikeValue(messageBody: String): Boolean = amountLikeRegex.containsMatchIn(messageBody)

  fun classify(sender: String, messageBody: String, timestamp: Long): SmsTransactionClassification? {
    if (!hasAmountLikeValue(messageBody)) {
      return null
    }

    val apiKey = BuildConfig.OPENROUTER_API_KEY
    if (apiKey.isBlank()) {
      Log.i(LOG_TAG, "AI fallback skipped reason=missing_openrouter_api_key")
      return null
    }

    return try {
      val sanitizedSender = maskSensitiveValue(sender)
      val sanitizedBody = maskSensitiveSmsBody(messageBody)
      val request = JSONObject().apply {
        put("model", OPENROUTER_MODEL)
        put("temperature", 0.1)
        put(
          "messages",
          JSONArray()
            .put(JSONObject().put("role", "system").put("content", prompt()))
            .put(
              JSONObject()
                .put("role", "user")
                .put("content", "Sender: $sanitizedSender\nTimestampMillis: $timestamp\nSMS:\n$sanitizedBody")
            )
        )
      }
      val raw = postJson(apiKey, request)
      val json = extractJson(raw)
      val classification = parseClassification(JSONObject(json))
      Log.i(
        LOG_TAG,
        "AI classification result isTransaction=${classification.isTransaction} type=${classification.type} amount=${classification.amount} confidence=${classification.confidence} reason=${classification.reason}"
      )
      classification
    } catch (error: Exception) {
      Log.e(LOG_TAG, "AI fallback failed", error)
      null
    }
  }

  fun toParsedTransaction(
    sender: String,
    originalMessageBody: String,
    timestamp: Long,
    classification: SmsTransactionClassification
  ): ParsedSmsTransaction? {
    if (!classification.isTransaction || classification.amount == null || classification.amount <= 0.0) {
      return null
    }

    val transactionType =
      when (classification.type) {
        "credit", "refund" -> "credit"
        else -> "debit"
      }
    val merchant = classification.merchant.ifBlank {
      sender.ifBlank { "Unknown Merchant" }
    }

    return ParsedSmsTransaction(
      amount = classification.amount,
      currency = classification.currency.ifBlank { "INR" },
      merchant = merchant,
      type = transactionType,
      sender = sender,
      messageBody = originalMessageBody,
      timestamp = timestamp,
      confidence = classification.confidence,
      classificationReason = classification.reason,
      reviewRequired = classification.confidence < AI_CONFIDENCE_REVIEW_THRESHOLD,
      accountHint = classification.accountHint,
      transactionDateTime = classification.transactionDateTime
    )
  }

  fun maskSensitiveSmsBody(messageBody: String): String {
    var value = messageBody
    value = value.replace(Regex("(?i)\\b(?:otp|one time password|verification code)\\s*(?:is|:|-)?\\s*\\d{4,8}\\b"), "[OTP]")
    value = value.replace(Regex("(?i)\\b\\d{4,8}\\s*(?:is\\s+)?(?:your\\s+)?(?:otp|one time password|verification code)\\b"), "[OTP]")
    value = value.replace(Regex("(?i)\\b[A-Z0-9._%+-]{2,64}@[A-Z][A-Z0-9.-]{1,32}\\b"), "[UPI_ID]")
    value = value.replace(Regex("(?i)\\b(?:a/c|acct|account|ac|card|cc)\\s*(?:no\\.?|number|ending|x+)?\\s*[xX*\\- ]*\\d{3,19}\\b"), "[ACCOUNT_HINT]")
    value = value.replace(Regex("\\b(?:\\+?91[- ]?)?[6-9]\\d{9}\\b"), "[PHONE]")
    value = value.replace(Regex("\\b(?:\\d[ -]?){12,19}\\b"), "[LONG_NUMBER]")
    return value
  }

  private fun parseClassification(json: JSONObject): SmsTransactionClassification {
    val rawType = json.optString("type", "unknown").lowercase(Locale.US)
    val type = if (allowedTypes.contains(rawType)) rawType else "unknown"
    val amount = when (val rawAmount = json.opt("amount")) {
      is Number -> rawAmount.toDouble()
      is String -> rawAmount.replace(",", "").toDoubleOrNull()
      else -> null
    }
    val confidence = min(1.0, max(0.0, json.optDouble("confidence", 0.0)))

    return SmsTransactionClassification(
      isTransaction = json.optBoolean("isTransaction", false),
      type = type,
      amount = amount,
      currency = json.optString("currency", "INR").ifBlank { "INR" },
      merchant = json.optString("merchant", json.optString("sender", "Unknown Merchant")),
      accountHint = json.optString("accountHint").ifBlank { null },
      transactionDateTime = json.optString("transactionDateTime").ifBlank { null },
      confidence = confidence,
      reason = json.optString("reason", "AI classified SMS")
    )
  }

  private fun postJson(apiKey: String, request: JSONObject): String {
    val connection = (URL(OPENROUTER_ENDPOINT).openConnection() as HttpURLConnection).apply {
      requestMethod = "POST"
      connectTimeout = 10000
      readTimeout = 15000
      doOutput = true
      setRequestProperty("Content-Type", "application/json")
      setRequestProperty("Authorization", "Bearer $apiKey")
    }

    OutputStreamWriter(connection.outputStream).use { writer ->
      writer.write(request.toString())
    }

    val responseText =
      (if (connection.responseCode in 200..299) connection.inputStream else connection.errorStream)
        .bufferedReader()
        .use { it.readText() }

    if (connection.responseCode !in 200..299) {
      throw IllegalStateException(responseText.ifBlank { "OpenRouter request failed with ${connection.responseCode}" })
    }

    return JSONObject(responseText)
      .optJSONArray("choices")
      ?.optJSONObject(0)
      ?.optJSONObject("message")
      ?.optString("content")
      ?.takeIf { it.isNotBlank() }
      ?: throw IllegalStateException("OpenRouter returned an empty response")
  }

  private fun extractJson(value: String): String {
    val fenced = Regex("```(?:json)?\\s*([\\s\\S]*?)```", RegexOption.IGNORE_CASE).find(value)
    if (fenced?.groupValues?.getOrNull(1)?.isNotBlank() == true) {
      return fenced.groupValues[1].trim()
    }

    val start = value.indexOf('{')
    val end = value.lastIndexOf('}')
    if (start >= 0 && end > start) {
      return value.substring(start, end + 1)
    }

    return value.trim()
  }

  private fun maskSensitiveValue(value: String): String =
    maskSensitiveSmsBody(value).replace(Regex("\\b\\d{4,}\\b"), "[NUMBER]")

  private fun prompt(): String =
    """
    You classify Indian SMS messages for personal expense tracking.

    Return ONLY structured JSON:
    {
      "isTransaction": true,
      "type": "debit",
      "amount": 250,
      "currency": "INR",
      "merchant": "Swiggy",
      "accountHint": "Kotak Bank AC X9341",
      "transactionDateTime": "2026-07-03T10:13:08",
      "confidence": 0.91,
      "reason": "SMS contains a successful debit transaction"
    }

    Valid type values: debit, credit, refund, transfer, bill_payment, cash_withdrawal, unknown.
    Classify true only for successful real financial transactions.
    Ignore OTPs, promotional offers, credit card offers, loan ads, balance-only alerts, payment reminders, failed or declined transactions, and generic bank messages.
    If unsure, use isTransaction false or confidence below 0.75.
    Do not infer sensitive full identifiers.
    """.trimIndent()
}
