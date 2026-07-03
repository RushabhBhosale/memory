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
  val confidence: Double,
  val classificationReason: String = "rule_parser",
  val reviewRequired: Boolean = false,
  val accountHint: String? = null,
  val transactionDateTime: String? = null
)

data class SmsTransactionParseResult(
  val transaction: ParsedSmsTransaction?,
  val reason: String,
  val ruleReason: String = reason,
  val aiFallbackTriggered: Boolean = false,
  val aiClassification: SmsTransactionClassification? = null,
  val finalDecision: String = if (transaction != null) "review" else "ignore"
)

object SmsTransactionParser {
  private val blockedKeywords =
    listOf("otp", "verification code", "password", "login", "one time password")
  private val nonTransactionKeywords =
    listOf(
      "apply now",
      " offer",
      "credit card offer",
      "loan offer",
      "pre-approved",
      "preapproved",
      "failed",
      "declined",
      "unsuccessful",
      "insufficient balance",
      "available balance",
      "balance in account",
      "balance is"
    )
  private val debitKeywords =
    listOf("debited", "spent", "paid", "purchase", "withdrawn", "card used")
  private val creditKeywords =
    listOf("credited", "received", "deposited", "refund", "cashback", "salary", "sent you")
  private val sentTransferRegex =
    Regex("(?i)\\bsent\\s+(?:₹|rs\\.?|inr)\\s*[0-9][0-9,]*(?:\\.\\d{1,2})?\\s+from\\s+.+?\\s+to\\s+\\S+")
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
    val ruleResult = parseWithRules(sender, messageBody, timestamp)
    if (ruleResult.transaction != null) {
      return ruleResult
    }

    if (!SmsTransactionAiFallback.hasAmountLikeValue(messageBody)) {
      return ruleResult
    }

    if (ruleResult.reason == "ignored_sensitive_message" || ruleResult.reason == "ignored_non_transaction_message") {
      return ruleResult
    }

    val classification =
      SmsTransactionAiFallback.classify(sender, messageBody, timestamp)
        ?: return ruleResult.copy(aiFallbackTriggered = true)
    val aiParsed = SmsTransactionAiFallback.toParsedTransaction(sender, messageBody, timestamp, classification)

    return if (aiParsed != null) {
      SmsTransactionParseResult(
        transaction = aiParsed,
        reason = if (aiParsed.reviewRequired) "ai_low_confidence_review" else "ai_matched",
        ruleReason = ruleResult.reason,
        aiFallbackTriggered = true,
        aiClassification = classification,
        finalDecision = "review"
      )
    } else {
      SmsTransactionParseResult(
        transaction = null,
        reason = "ai_not_transaction",
        ruleReason = ruleResult.reason,
        aiFallbackTriggered = true,
        aiClassification = classification,
        finalDecision = "ignore"
      )
    }
  }

  fun parseWithRules(
    sender: String,
    messageBody: String,
    timestamp: Long
  ): SmsTransactionParseResult {
    val normalized = messageBody.lowercase(Locale.US)

    if (blockedKeywords.any { normalized.contains(it) }) {
      return SmsTransactionParseResult(null, "ignored_sensitive_message")
    }

    if (nonTransactionKeywords.any { normalized.contains(it) }) {
      return SmsTransactionParseResult(null, "ignored_non_transaction_message")
    }

    val debitMatch = debitKeywords.any { normalized.contains(it) } || sentTransferRegex.containsMatchIn(messageBody)
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
        Regex("(?i)sent\\s+(?:₹|rs\\.?|inr)\\s*[0-9][0-9,]*(?:\\.\\d{1,2})?\\s+from\\s+.+?\\s+to\\s+([^\\s]+)"),
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
