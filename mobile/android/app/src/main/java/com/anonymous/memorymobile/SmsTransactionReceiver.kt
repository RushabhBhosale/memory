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
      val result = SmsTransactionParser.parseWithReason(sender, body, timestamp)
      val parsed = result.transaction

      if (parsed == null) {
        Log.i("MemoryExpenseSms", "SMS ignored reason=${result.reason}")
        return
      }

      val pending = ExpenseTransactionStore.addPending(context, parsed)
      Log.i(
        "MemoryExpenseSms",
        "Pending transaction created id=${pending.optString("id")} amount=${parsed.amount} merchant=${parsed.merchant} type=${parsed.type}"
      )
      ExpenseNotificationHelper.notifyPendingTransaction(context, pending)
    } catch (error: Exception) {
      Log.e("MemoryExpenseSms", "Failed to process SMS transaction", error)
    }
  }
}
