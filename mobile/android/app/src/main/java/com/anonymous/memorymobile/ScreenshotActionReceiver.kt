package com.anonymous.memorymobile

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class ScreenshotActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val screenshotId = intent.getStringExtra(SCREENSHOT_EXTRA_ID) ?: return

    when (intent.action) {
      SCREENSHOT_ACTION_SAVE -> {
        ScreenshotInboxStore.markSaveRequested(context, screenshotId)
        context.packageManager.getLaunchIntentForPackage(context.packageName)?.let { launchIntent ->
          launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
          context.startActivity(launchIntent)
        }
      }
      SCREENSHOT_ACTION_LATER -> ScreenshotInboxStore.markLater(context, screenshotId)
      SCREENSHOT_ACTION_IGNORE -> ScreenshotInboxStore.markIgnored(context, screenshotId)
    }

    ScreenshotNotificationHelper.dismiss(context, screenshotId)
  }
}
