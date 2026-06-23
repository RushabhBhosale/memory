package com.anonymous.memorymobile

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStats
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.os.Build
import android.os.Process
import android.provider.Settings
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import kotlin.math.max

private data class AppUsageAggregate(
  var totalTimeMs: Long = 0L,
  var lastUsedTime: Long = 0L
)

class AppUsageModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val logTag = "MemoryAppUsage"

  override fun getName(): String = "AppUsageModule"

  @ReactMethod
  fun hasUsageAccessPermission(promise: Promise) {
    promise.resolve(hasUsagePermission())
  }

  @ReactMethod
  fun openUsageAccessSettings() {
    val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    reactContext.startActivity(intent)
  }

  @ReactMethod
  fun getAppUsageStats(startTime: Double, endTime: Double, promise: Promise) {
    if (!hasUsagePermission()) {
      Log.w(logTag, "usage access missing for app usage query")
      promise.resolve(Arguments.createArray())
      return
    }

    try {
      val usageStatsManager =
        reactContext.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
      val packageManager = reactContext.packageManager
      val windowStart = startTime.toLong()
      val windowEnd = endTime.toLong()
      val windowDurationMs = max(0L, windowEnd - windowStart)
      val preferEventTotals = windowDurationMs <= 8L * 24L * 60L * 60L * 1000L
      val events = usageStatsManager.queryEvents(windowStart, windowEnd)
      val aggregated = linkedMapOf<String, AppUsageAggregate>()
      val event = UsageEvents.Event()
      var totalEvents = 0
      var matchedEvents = 0
      var skippedSystemEvents = 0
      var skippedUnknownPackages = 0
      var instagramForegroundEvents = 0
      var instagramBackgroundEvents = 0
      var currentForegroundPackage: String? = null
      var currentForegroundStartedAt: Long? = null

      Log.i(
        logTag,
        "query start windowStart=$windowStart windowEnd=$windowEnd durationMs=${windowEnd - windowStart}"
      )

      while (events.hasNextEvent()) {
        events.getNextEvent(event)
        totalEvents += 1

        val packageName = event.packageName ?: continue
        val appInfo = resolveAppInfo(packageManager, packageName)
        if (appInfo == null) {
          skippedUnknownPackages += 1
          if (packageName == "com.instagram.android") {
            Log.w(
              logTag,
              "instagram package could not be resolved type=${eventTypeName(event.eventType)} ts=${event.timeStamp}"
            )
          }
        } else if (shouldIgnoreApp(appInfo)) {
          skippedSystemEvents += 1
          continue
        }

        if (packageName == "com.instagram.android") {
          Log.i(
            logTag,
            "instagram event type=${eventTypeName(event.eventType)} ts=${event.timeStamp}"
          )
        }

        when {
          isForegroundEvent(event) -> {
            matchedEvents += 1
            if (packageName == "com.instagram.android") {
              instagramForegroundEvents += 1
            }
            val activePackage = currentForegroundPackage
            val activeStartedAt = currentForegroundStartedAt
            if (
              activePackage != null &&
                activeStartedAt != null &&
                activePackage != packageName
            ) {
              val activeAggregate = aggregated.getOrPut(activePackage) { AppUsageAggregate() }
              activeAggregate.totalTimeMs += max(0L, event.timeStamp - activeStartedAt)
              activeAggregate.lastUsedTime = max(activeAggregate.lastUsedTime, event.timeStamp)
            }

            val aggregate = aggregated.getOrPut(packageName) { AppUsageAggregate() }
            aggregate.lastUsedTime = max(aggregate.lastUsedTime, event.timeStamp)
            if (currentForegroundPackage != packageName || currentForegroundStartedAt == null) {
              currentForegroundPackage = packageName
              currentForegroundStartedAt = event.timeStamp
            }
          }
          isBackgroundEvent(event) -> {
            matchedEvents += 1
            if (packageName == "com.instagram.android") {
              instagramBackgroundEvents += 1
            }
            if (currentForegroundPackage != packageName) {
              continue
            }

            val startedAt = currentForegroundStartedAt ?: continue
            val aggregate = aggregated.getOrPut(packageName) { AppUsageAggregate() }
            aggregate.totalTimeMs += max(0L, event.timeStamp - startedAt)
            aggregate.lastUsedTime = max(aggregate.lastUsedTime, event.timeStamp)
            currentForegroundPackage = null
            currentForegroundStartedAt = null
          }
        }
      }

      if (currentForegroundPackage != null && currentForegroundStartedAt != null) {
        val aggregate = aggregated.getOrPut(currentForegroundPackage) { AppUsageAggregate() }
        aggregate.totalTimeMs += max(0L, windowEnd - currentForegroundStartedAt)
        aggregate.lastUsedTime = max(aggregate.lastUsedTime, windowEnd)
      }

      val usageStats =
        usageStatsManager.queryAndAggregateUsageStats(windowStart, windowEnd).values
      var usageStatsMerged = 0

      for (stat in usageStats) {
        val packageName = stat.packageName ?: continue
        val appInfo = resolveAppInfo(packageManager, packageName)
        if (appInfo != null && shouldIgnoreApp(appInfo)) {
          continue
        }

        val usageStatLastUsed = stat.lastTimeUsed
        val usageStatInWindow = usageStatLastUsed in windowStart..windowEnd

        val aggregate = aggregated.getOrPut(packageName) { AppUsageAggregate() }
        val usageStatTotal = getBestUsageStatDuration(stat)
        val shouldUseAggregateTotal =
          usageStatInWindow &&
            usageStatTotal > 0L &&
            (!preferEventTotals || aggregate.totalTimeMs <= 0L)

        if (shouldUseAggregateTotal && usageStatTotal > aggregate.totalTimeMs) {
          aggregate.totalTimeMs = usageStatTotal
        }
        if (usageStatInWindow) {
          aggregate.lastUsedTime = max(aggregate.lastUsedTime, usageStatLastUsed)
        }

        if (usageStatInWindow && usageStatTotal > 0L) {
          usageStatsMerged += 1
        }

        if (packageName == "com.instagram.android") {
          Log.i(
            logTag,
            "instagram aggregate total=$usageStatTotal lastUsed=$usageStatLastUsed inWindow=$usageStatInWindow"
          )
        }
      }

      Log.i(
        logTag,
        "query events total=$totalEvents matched=$matchedEvents skippedSystem=$skippedSystemEvents skippedUnknown=$skippedUnknownPackages instagramForeground=$instagramForegroundEvents instagramBackground=$instagramBackgroundEvents usageStatsMerged=$usageStatsMerged preferEventTotals=$preferEventTotals"
      )

      val sortedStats =
        aggregated.entries
          .filter { (_, aggregate) ->
            aggregate.totalTimeMs > 0L && aggregate.lastUsedTime in windowStart..windowEnd
          }
          .sortedByDescending { (_, aggregate) -> aggregate.totalTimeMs }
      val result = Arguments.createArray()

      for ((packageName, aggregate) in sortedStats) {
        val appInfo = resolveAppInfo(packageManager, packageName)
        val label =
          appInfo?.let { packageManager.getApplicationLabel(it)?.toString() } ?: packageName
        val item = Arguments.createMap().apply {
          putString("packageName", packageName)
          putString("appName", label)
          putDouble("totalTimeMs", aggregate.totalTimeMs.toDouble())
          putDouble("lastUsedTime", aggregate.lastUsedTime.toDouble())
        }

        result.pushMap(item)
      }

      val preview =
        sortedStats
          .take(10)
          .joinToString(separator = ", ") { (packageName, aggregate) ->
            "$packageName:${aggregate.totalTimeMs}"
          }
      Log.i(logTag, "query result count=${sortedStats.size} top=$preview")

      promise.resolve(result)
    } catch (error: Exception) {
      Log.e(logTag, "query failed", error)
      promise.reject("APP_USAGE_ERROR", error.message, error)
    }
  }

  private fun shouldIgnoreApp(appInfo: ApplicationInfo): Boolean {
    val isSystemApp = appInfo.flags and ApplicationInfo.FLAG_SYSTEM != 0
    val isUpdatedSystemApp = appInfo.flags and ApplicationInfo.FLAG_UPDATED_SYSTEM_APP != 0
    return isSystemApp || isUpdatedSystemApp
  }

  private fun resolveAppInfo(
    packageManager: android.content.pm.PackageManager,
    packageName: String
  ): ApplicationInfo? =
    try {
      packageManager.getApplicationInfo(packageName, 0)
    } catch (_: Exception) {
      null
    }

  private fun isForegroundEvent(event: UsageEvents.Event): Boolean =
    event.eventType == UsageEvents.Event.MOVE_TO_FOREGROUND ||
      event.eventType == UsageEvents.Event.ACTIVITY_RESUMED

  private fun isBackgroundEvent(event: UsageEvents.Event): Boolean =
    event.eventType == UsageEvents.Event.MOVE_TO_BACKGROUND ||
      event.eventType == UsageEvents.Event.ACTIVITY_PAUSED ||
      event.eventType == UsageEvents.Event.ACTIVITY_STOPPED

  private fun eventTypeName(eventType: Int): String =
    when (eventType) {
      UsageEvents.Event.ACTIVITY_RESUMED -> "ACTIVITY_RESUMED"
      UsageEvents.Event.ACTIVITY_PAUSED -> "ACTIVITY_PAUSED"
      UsageEvents.Event.ACTIVITY_STOPPED -> "ACTIVITY_STOPPED"
      UsageEvents.Event.MOVE_TO_FOREGROUND -> "MOVE_TO_FOREGROUND"
      UsageEvents.Event.MOVE_TO_BACKGROUND -> "MOVE_TO_BACKGROUND"
      else -> eventType.toString()
    }

  private fun getBestUsageStatDuration(stat: UsageStats): Long {
    val duration =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        max(stat.totalTimeInForeground, stat.totalTimeVisible)
      } else {
        stat.totalTimeInForeground
      }

    return max(0L, duration)
  }

  private fun hasUsagePermission(): Boolean {
    val appOpsManager = reactContext.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
    val mode =
      appOpsManager.checkOpNoThrow(
        AppOpsManager.OPSTR_GET_USAGE_STATS,
        Process.myUid(),
        reactContext.packageName
      )

    return mode == AppOpsManager.MODE_ALLOWED
  }
}
