package com.anonymous.memorymobile

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import org.json.JSONObject
import java.text.NumberFormat
import java.util.Locale
import kotlin.math.abs

private const val EXPENSE_CHANNEL_ID = "memoryos_expense_sms"
const val EXPENSE_ACTION_ADD = "com.anonymous.memorymobile.EXPENSE_ADD"
const val EXPENSE_ACTION_IGNORE = "com.anonymous.memorymobile.EXPENSE_IGNORE"
const val EXPENSE_EXTRA_ID = "transactionId"

object ExpenseNotificationHelper {
  fun notifyPendingTransaction(context: Context, transaction: JSONObject) {
    if (
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
        context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
    ) {
      return
    }

    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    ensureChannel(manager)

    val id = transaction.optString("id")
    val type = transaction.optString("type")
    val amount = formatAmount(transaction.optDouble("amount", 0.0))
    val merchant = transaction.optString("merchant", "Unknown Merchant")
    val body =
      if (type == "credit") {
        "$amount credited. Add as income?"
      } else {
        "You spent $amount at $merchant. Add to expenses?"
      }
    val notificationId = notificationId(id)
    val contentIntent =
      context.packageManager.getLaunchIntentForPackage(context.packageName)?.let { launchIntent ->
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        PendingIntent.getActivity(
          context,
          notificationId,
          launchIntent,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
      }
    val addIntent =
      PendingIntent.getBroadcast(
        context,
        notificationId + 1,
        Intent(context, ExpenseActionReceiver::class.java).apply {
          action = EXPENSE_ACTION_ADD
          putExtra(EXPENSE_EXTRA_ID, id)
        },
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
    val ignoreIntent =
      PendingIntent.getBroadcast(
        context,
        notificationId + 2,
        Intent(context, ExpenseActionReceiver::class.java).apply {
          action = EXPENSE_ACTION_IGNORE
          putExtra(EXPENSE_EXTRA_ID, id)
        },
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )

    val notification =
      Notification.Builder(context, EXPENSE_CHANNEL_ID)
        .setSmallIcon(android.R.drawable.ic_dialog_info)
        .setContentTitle("MemoryOS Expense")
        .setContentText(body)
        .setStyle(Notification.BigTextStyle().bigText(body))
        .setAutoCancel(true)
        .setContentIntent(contentIntent)
        .addAction(Notification.Action.Builder(android.R.drawable.ic_menu_add, "Add", addIntent).build())
        .addAction(Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel, "Ignore", ignoreIntent).build())
        .build()

    manager.notify(notificationId, notification)
  }

  fun dismiss(context: Context, transactionId: String) {
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.cancel(notificationId(transactionId))
  }

  private fun ensureChannel(manager: NotificationManager) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return
    }

    val channel =
      NotificationChannel(
        EXPENSE_CHANNEL_ID,
        "MemoryOS Expenses",
        NotificationManager.IMPORTANCE_DEFAULT
      ).apply {
        description = "Transaction approval notifications from SMS"
      }

    manager.createNotificationChannel(channel)
  }

  private fun notificationId(transactionId: String): Int =
    abs(transactionId.hashCode()).coerceAtLeast(1)

  private fun formatAmount(amount: Double): String {
    val format = NumberFormat.getCurrencyInstance(Locale("en", "IN"))
    format.maximumFractionDigits = if (amount % 1.0 == 0.0) 0 else 2
    return format.format(amount)
  }
}

