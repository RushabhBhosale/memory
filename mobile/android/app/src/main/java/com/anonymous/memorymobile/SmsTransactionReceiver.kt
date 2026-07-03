package com.anonymous.memorymobile

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.util.Log

class SmsTransactionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) {
      return
    }

    try {
      val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
      val sender =
        messages.firstOrNull()?.displayOriginatingAddress
          ?: messages.firstOrNull()?.originatingAddress
          ?: "Unknown"
      val body = messages.joinToString(separator = "") { it.messageBody ?: "" }
      val timestamp = messages.maxOfOrNull { it.timestampMillis } ?: System.currentTimeMillis()
      Log.i("MemoryExpenseSms", "SMS received sender=$sender length=${body.length}")
      val ruleResult = SmsTransactionParser.parseWithRules(sender, body, timestamp)
      val shouldRunAsyncFallback =
        ruleResult.transaction == null &&
          ruleResult.reason != "ignored_sensitive_message" &&
          ruleResult.reason != "ignored_non_transaction_message" &&
          SmsTransactionAiFallback.hasAmountLikeValue(body)

      if (shouldRunAsyncFallback) {
        val pendingResult = goAsync()
        Thread {
          try {
            processMessage(context, sender, body, timestamp)
          } finally {
            pendingResult.finish()
          }
        }.start()
      } else {
        processMessage(context, sender, body, timestamp)
      }
    } catch (error: Exception) {
      Log.e("MemoryExpenseSms", "Failed to process SMS transaction", error)
    }
  }

  private fun processMessage(context: Context, sender: String, body: String, timestamp: Long) {
    val result = SmsTransactionParser.parseWithReason(sender, body, timestamp)
    Log.i(
      "MemoryExpenseSms",
      "Rule parser result ruleReason=${result.ruleReason} matched=${result.ruleReason == "matched"}"
    )
    Log.i("MemoryExpenseSms", "AI fallback triggered=${result.aiFallbackTriggered}")
    result.aiClassification?.let { classification ->
      Log.i(
        "MemoryExpenseSms",
        "AI classification result isTransaction=${classification.isTransaction} type=${classification.type} amount=${classification.amount} confidence=${classification.confidence} reason=${classification.reason}"
      )
    }
    val parsed = result.transaction

    if (parsed == null) {
      Log.i("MemoryExpenseSms", "Final SMS decision=${result.finalDecision} reason=${result.reason}")
      return
    }

    val pending = ExpenseTransactionStore.addPending(context, parsed)
    if (pending == null) {
      Log.i("MemoryExpenseSms", "Final SMS decision=ignore reason=already_added amount=${parsed.amount} type=${parsed.type}")
      return
    }

    Log.i(
      "MemoryExpenseSms",
      "Final SMS decision=review id=${pending.optString("id")} amount=${parsed.amount} merchant=${parsed.merchant} type=${parsed.type} confidence=${parsed.confidence} reviewRequired=${parsed.reviewRequired}"
    )
    ExpenseNotificationHelper.notifyPendingTransaction(context, pending)
  }
}
