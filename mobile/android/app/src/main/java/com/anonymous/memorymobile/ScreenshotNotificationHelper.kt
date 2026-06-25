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
import kotlin.math.abs

private const val SCREENSHOT_CHANNEL_ID = "memoryos_screenshot_inbox"
const val SCREENSHOT_ACTION_SAVE = "com.anonymous.memorymobile.SCREENSHOT_SAVE"
const val SCREENSHOT_ACTION_LATER = "com.anonymous.memorymobile.SCREENSHOT_LATER"
const val SCREENSHOT_ACTION_IGNORE = "com.anonymous.memorymobile.SCREENSHOT_IGNORE"
const val SCREENSHOT_EXTRA_ID = "screenshotId"

object ScreenshotNotificationHelper {
  fun notifyScreenshot(context: Context, item: JSONObject) {
    if (
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
        context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
    ) {
      return
    }

    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    ensureChannel(manager)

    val id = item.optString("id")
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
    val saveIntent = actionIntent(context, notificationId + 1, SCREENSHOT_ACTION_SAVE, id)
    val laterIntent = actionIntent(context, notificationId + 2, SCREENSHOT_ACTION_LATER, id)
    val ignoreIntent = actionIntent(context, notificationId + 3, SCREENSHOT_ACTION_IGNORE, id)

    val notification =
      Notification.Builder(context, SCREENSHOT_CHANNEL_ID)
        .setSmallIcon(android.R.drawable.ic_menu_gallery)
        .setContentTitle("Screenshot captured")
        .setContentText("Save this to Memory?")
        .setStyle(Notification.BigTextStyle().bigText("Save this to Memory?"))
        .setAutoCancel(true)
        .setContentIntent(contentIntent)
        .addAction(Notification.Action.Builder(android.R.drawable.ic_menu_save, "Save", saveIntent).build())
        .addAction(Notification.Action.Builder(android.R.drawable.ic_menu_recent_history, "Later", laterIntent).build())
        .addAction(Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel, "Ignore", ignoreIntent).build())
        .build()

    manager.notify(notificationId, notification)
  }

  fun dismiss(context: Context, screenshotId: String) {
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.cancel(notificationId(screenshotId))
  }

  private fun actionIntent(context: Context, requestCode: Int, actionName: String, id: String) =
    PendingIntent.getBroadcast(
      context,
      requestCode,
      Intent(context, ScreenshotActionReceiver::class.java).apply {
        action = actionName
        putExtra(SCREENSHOT_EXTRA_ID, id)
      },
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

  private fun ensureChannel(manager: NotificationManager) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return
    }

    manager.createNotificationChannel(
      NotificationChannel(
        SCREENSHOT_CHANNEL_ID,
        "MemoryOS Screenshots",
        NotificationManager.IMPORTANCE_DEFAULT
      ).apply {
        description = "Screenshot save prompts and inbox reminders"
      }
    )
  }

  private fun notificationId(screenshotId: String): Int =
    abs(screenshotId.hashCode()).coerceAtLeast(1)
}
