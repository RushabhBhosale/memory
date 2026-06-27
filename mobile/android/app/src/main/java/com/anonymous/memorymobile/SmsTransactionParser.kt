package com.anonymous.memorymobile

import java.util.Locale

data class ParsedSmsTransaction(
  val amount: Double,
  val currency: String,
  val merchant: String,
  val type: String,
  val sender: String,
  val messageBody: String,
  val timestamp: Long,
  val confidence: Double
)

data class SmsTransactionParseResult(
  val transaction: ParsedSmsTransaction?,
  val reason: String
)

object SmsTransactionParser {
  private val blockedKeywords =
    listOf("otp", "verification code", "password", "login", "one time password")
  private val debitKeywords =
    listOf("debited", "spent", "paid", "purchase", "withdrawn", "card used")
  private val creditKeywords =
    listOf("credited", "received", "deposited", "refund", "cashback", "salary", "sent you")
  private val amountRegex =
    Regex("(?i)(?:₹|rs\\.?|inr)\\s*([0-9][0-9,]*(?:\\.\\d{1,2})?)")
  private val fallbackAmountRegex =
    Regex("(?i)(?:debited|credited|spent|paid|received|withdrawn|purchase|txn|transaction)[^0-9₹rsi]{0,40}(?:₹|rs\\.?|inr)?\\s*([0-9][0-9,]*(?:\\.\\d{1,2})?)")

  fun parse(sender: String, messageBody: String, timestamp: Long): ParsedSmsTransaction? {
    return parseWithReason(sender, messageBody, timestamp).transaction
  }

  fun parseWithReason(
    sender: String,
    messageBody: String,
    timestamp: Long
  ): SmsTransactionParseResult {
    val normalized = messageBody.lowercase(Locale.US)

    if (blockedKeywords.any { normalized.contains(it) }) {
      return SmsTransactionParseResult(null, "ignored_sensitive_message")
    }

    val debitMatch = debitKeywords.any { normalized.contains(it) }
    val creditMatch = creditKeywords.any { normalized.contains(it) }

    if (!debitMatch && !creditMatch) {
      return SmsTransactionParseResult(null, "missing_transaction_keyword")
    }

    val amountMatch = amountRegex.find(messageBody) ?: fallbackAmountRegex.find(messageBody)

    if (amountMatch == null) {
      return SmsTransactionParseResult(null, "missing_amount")
    }

    val amount =
      amountMatch.groupValues[1]
        .replace(",", "")
        .toDoubleOrNull()
        ?: return SmsTransactionParseResult(null, "invalid_amount")

    val type = if (creditMatch) "credit" else "debit"
    val merchant = extractMerchant(messageBody)
    val confidence = when {
      merchant != "Unknown Merchant" && (debitMatch || creditMatch) -> 0.86
      debitMatch || creditMatch -> 0.72
      else -> 0.6
    }

    return SmsTransactionParseResult(
      ParsedSmsTransaction(
        amount = amount,
        currency = "INR",
        merchant = merchant,
        type = type,
        sender = sender,
        messageBody = messageBody,
        timestamp = timestamp,
        confidence = confidence
      ),
      "matched"
    )
  }

  private fun extractMerchant(messageBody: String): String {
    val patterns =
      listOf(
        Regex("(?i)spent\\s+(?:at|on)\\s+([A-Z0-9&._ -]{2,32})"),
        Regex("(?i)paid\\s+to\\s+([A-Z0-9&._ -]{2,32})"),
        Regex("(?i)purchase\\s+(?:at|on|from)\\s+([A-Z0-9&._ -]{2,32})"),
        Regex("(?i)(?:at|to|from)\\s+([A-Z0-9&._ -]{2,32})")
      )

    for (pattern in patterns) {
      val merchant = pattern.find(messageBody)?.groupValues?.getOrNull(1)?.let(::cleanMerchant)

      if (!merchant.isNullOrBlank()) {
        return titleCase(merchant)
      }
    }

    val slashMerchant =
      Regex("(?i)UPI/[A-Z0-9]+/([A-Z0-9._ -]{2,32})")
        .find(messageBody)
        ?.groupValues
        ?.getOrNull(1)
        ?.let(::cleanMerchant)

    if (!slashMerchant.isNullOrBlank()) {
      return titleCase(slashMerchant)
    }

    return "Unknown Merchant"
  }

  private fun cleanMerchant(value: String): String {
    val stopWords =
      listOf(" on ", " via ", " ref", " txn", " transaction", " using", " with", " is ", " has ")
    var cleaned = value.replace(Regex("\\s+"), " ").trim(' ', '.', ',', '-', ':')
    val lower = cleaned.lowercase(Locale.US)

    for (stopWord in stopWords) {
      val index = lower.indexOf(stopWord)
      if (index > 0) {
        cleaned = cleaned.substring(0, index).trim(' ', '.', ',', '-', ':')
        break
      }
    }

    return cleaned
  }

  private fun titleCase(value: String): String =
    value
      .lowercase(Locale.US)
      .split(" ")
      .filter { it.isNotBlank() }
      .joinToString(" ") { word ->
        word.replaceFirstChar { char ->
          if (char.isLowerCase()) char.titlecase(Locale.US) else char.toString()
        }
      }
}
