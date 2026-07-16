package com.anonymous.memonest

import android.Manifest
import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONArray
import org.json.JSONObject

class ExpenseSmsModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext), PermissionListener {
  private var permissionPromise: Promise? = null

  override fun getName(): String = "ExpenseSmsModule"

  @ReactMethod
  fun addListener(eventName: String) {
    // Required by React Native NativeEventEmitter.
  }

  @ReactMethod
  fun removeListeners(count: Double) {
    // Required by React Native NativeEventEmitter.
  }

  @ReactMethod
  fun hasSmsPermissions(promise: Promise) {
    promise.resolve(hasRequiredPermissions())
  }

  @ReactMethod
  fun requestSmsPermissions(promise: Promise) {
    if (hasRequiredPermissions()) {
      promise.resolve(true)
      return
    }

    val activity = reactContext.currentActivity

    if (activity !is PermissionAwareActivity) {
      promise.resolve(false)
      return
    }

    permissionPromise = promise
    activity.requestPermissions(requiredPermissions(), 4312, this)
  }

  @ReactMethod
  fun listPendingTransactions(promise: Promise) {
    promise.resolve(toWritableArray(ExpenseTransactionStore.listPending(reactContext)))
  }

  @ReactMethod
  fun listExpenses(promise: Promise) {
    promise.resolve(toWritableArray(ExpenseTransactionStore.listExpenses(reactContext)))
  }

  @ReactMethod
  fun setActiveExpenseUserId(userId: String, promise: Promise) {
    ExpenseTransactionStore.setActiveUserId(reactContext, userId)
    promise.resolve(null)
  }

  @ReactMethod
  fun getTrackingDebugStatus(promise: Promise) {
    try {
      val permissionGranted = hasRequiredPermissions()
      val receiverEnabled = isReceiverEnabled()
      val debugPrefs = reactContext.getSharedPreferences(DEBUG_PREFS, Context.MODE_PRIVATE)
      val stats = ExpenseTransactionStore.smsDebugStats(reactContext)

      promise.resolve(
        Arguments.createMap().apply {
          putBoolean("permissionGranted", permissionGranted)
          putBoolean("trackingEnabled", receiverEnabled)
          putBoolean("receiverEnabled", receiverEnabled)
          putString("trackingStatus", if (permissionGranted && receiverEnabled) "Running" else "Stopped")
          putNullableLong("lastSmsScanTime", debugPrefs.getLong(LAST_SCAN_TIME_KEY, 0L))
          putString("lastProcessedSmsId", debugPrefs.getString(LAST_PROCESSED_SMS_ID_KEY, null))
          putNullableLong("lastDetectedExpenseTime", stats.optLong("lastDetectedExpenseTime", 0L))
          putInt("totalExpensesDetectedFromSms", stats.optInt("totalExpensesDetectedFromSms", 0))
        }
      )
    } catch (error: Exception) {
      promise.reject("SMS_DEBUG_STATUS_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun deleteExpense(id: String, promise: Promise) {
    val deleted = ExpenseTransactionStore.deleteExpense(reactContext, id)
    if (deleted) {
      emitExpensesChanged()
    }
    promise.resolve(deleted)
  }

  @ReactMethod
  fun confirmTransaction(id: String, updates: ReadableMap?, promise: Promise) {
    val updated = ExpenseTransactionStore.confirmPending(reactContext, id, updates?.toJson())
    if (updated != null) {
      emitExpensesChanged()
    }
    promise.resolve(updated != null)
  }

  @ReactMethod
  fun ignoreTransaction(id: String, promise: Promise) {
    val updated = ExpenseTransactionStore.ignorePending(reactContext, id)
    promise.resolve(updated != null)
  }

  @ReactMethod
  fun updatePendingTransaction(id: String, updates: ReadableMap, promise: Promise) {
    val updated = ExpenseTransactionStore.updatePending(reactContext, id, updates.toJson())
    promise.resolve(updated?.toWritableMap())
  }

  @ReactMethod
  fun addManualExpense(input: ReadableMap, promise: Promise) {
    val amount = if (input.hasKey("amount")) input.getDouble("amount") else 0.0

    if (amount <= 0.0) {
      promise.reject("INVALID_EXPENSE", "Amount must be greater than zero.")
      return
    }

    val expense =
      ExpenseTransactionStore.addExpense(
        context = reactContext,
        amount = amount,
        currency = if (input.hasKey("currency")) input.getString("currency") ?: "INR" else "INR",
        merchant = if (input.hasKey("merchant")) input.getString("merchant") ?: "Unknown Merchant" else "Unknown Merchant",
        category = if (input.hasKey("category")) input.getString("category") ?: "general" else "general",
        type = if (input.hasKey("type")) input.getString("type") ?: "expense" else "expense",
        source = "manual",
        originalPreview = if (input.hasKey("note")) input.getString("note") ?: "" else "",
        timestamp = if (input.hasKey("timestamp")) input.getDouble("timestamp").toLong() else System.currentTimeMillis(),
        id = if (input.hasKey("id")) input.getString("id") else null,
        note = if (input.hasKey("note")) input.getString("note") ?: "" else "",
        userId = if (input.hasKey("userId")) input.getString("userId") ?: "main" else "main"
      )
    emitExpensesChanged()
    promise.resolve(expense.toWritableMap())
  }

  @ReactMethod
  fun simulateIncomingSms(sender: String, messageBody: String, promise: Promise) {
    val result = SmsTransactionParser.parseWithReason(sender, messageBody, System.currentTimeMillis())
    logSmsDecision(result)
    val parsed = result.transaction

    if (parsed == null) {
      logFinalStoreDecision(result.finalDecision, result.reason, null)
      promise.resolve(
        Arguments.createMap().apply {
          putBoolean("matched", false)
          putString("reason", result.reason)
        }
      )
      return
    }

    val pending = ExpenseTransactionStore.addPending(reactContext, parsed)

    if (pending == null) {
      emitExpensesChanged()
      logFinalStoreDecision("ignore", "already_added", parsed)
      promise.resolve(
        Arguments.createMap().apply {
          putBoolean("matched", false)
          putString("reason", "already_added")
        }
      )
      return
    }

    ExpenseNotificationHelper.notifyPendingTransaction(reactContext, pending)
    logFinalStoreDecision("review", result.reason, parsed)
    promise.resolve(
      Arguments.createMap().apply {
        putBoolean("matched", true)
        putString("reason", result.reason)
        putMap("transaction", pending.toWritableMap())
      }
    )
  }

  @ReactMethod
  fun scanRecentSms(limit: Double, promise: Promise) {
    if (reactContext.checkSelfPermission(Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED) {
      promise.reject("SMS_PERMISSION_MISSING", "READ_SMS permission is required to scan recent SMS.")
      return
    }

    val maxMessages = limit.toInt().coerceIn(1, 100)
    val reasonCounts = linkedMapOf<String, Int>()
    var scanned = 0
    var matched = 0
    var pendingCreated = 0
    var lastProcessedSmsId: String? = null

    try {
      reactContext.contentResolver.query(
        Uri.parse("content://sms/inbox"),
        arrayOf("_id", "address", "body", "date"),
        null,
        null,
        "date DESC"
      )?.use { cursor ->
        val idIndex = cursor.getColumnIndex("_id")
        val addressIndex = cursor.getColumnIndex("address")
        val bodyIndex = cursor.getColumnIndex("body")
        val dateIndex = cursor.getColumnIndex("date")

        while (cursor.moveToNext() && scanned < maxMessages) {
          scanned += 1
          lastProcessedSmsId = if (idIndex >= 0) cursor.getString(idIndex) else null
          val sender = cursor.getString(addressIndex) ?: "Unknown"
          val body = cursor.getString(bodyIndex) ?: ""
          val timestamp = cursor.getLong(dateIndex)
          val result = SmsTransactionParser.parseWithReason(sender, body, timestamp)
          logSmsDecision(result)
          val parsed = result.transaction

          if (parsed == null) {
            reasonCounts[result.reason] = (reasonCounts[result.reason] ?: 0) + 1
            logFinalStoreDecision(result.finalDecision, result.reason, null)
            continue
          }

          matched += 1
          val pending = ExpenseTransactionStore.addPending(reactContext, parsed)

          if (pending == null) {
            reasonCounts["already_pending_or_added"] = (reasonCounts["already_pending_or_added"] ?: 0) + 1
            logFinalStoreDecision("ignore", "already_pending_or_added", parsed)
            continue
          }

          pendingCreated += 1
          ExpenseNotificationHelper.notifyPendingTransaction(reactContext, pending)
          logFinalStoreDecision("review", result.reason, parsed)
        }
      }

      rememberDebugScan(lastProcessedSmsId)
      val reasons = Arguments.createMap()
      reasonCounts.forEach { (reason, count) -> reasons.putInt(reason, count) }
      promise.resolve(
        Arguments.createMap().apply {
          putInt("scanned", scanned)
          putInt("matched", pendingCreated)
          putInt("detected", matched)
          putInt("pending", pendingCreated)
          putMap("ignoredReasons", reasons)
        }
      )
    } catch (error: Exception) {
      promise.reject("SMS_SCAN_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun debugTestRecentSms(limit: Double, promise: Promise) {
    if (reactContext.checkSelfPermission(Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED) {
      promise.reject("SMS_PERMISSION_MISSING", "READ_SMS permission is required to test recent SMS.")
      return
    }

    val maxMessages = limit.toInt().coerceIn(1, 100)
    val messages = Arguments.createArray()
    var scanned = 0
    var matched = 0
    var lastProcessedSmsId: String? = null

    try {
      reactContext.contentResolver.query(
        Uri.parse("content://sms/inbox"),
        arrayOf("_id", "address", "body", "date"),
        null,
        null,
        "date DESC"
      )?.use { cursor ->
        val idIndex = cursor.getColumnIndex("_id")
        val addressIndex = cursor.getColumnIndex("address")
        val bodyIndex = cursor.getColumnIndex("body")
        val dateIndex = cursor.getColumnIndex("date")

        while (cursor.moveToNext() && scanned < maxMessages) {
          scanned += 1
          val id = if (idIndex >= 0) cursor.getString(idIndex) else scanned.toString()
          lastProcessedSmsId = id
          val sender = cursor.getString(addressIndex) ?: "Unknown"
          val body = cursor.getString(bodyIndex) ?: ""
          val timestamp = cursor.getLong(dateIndex)
          val result = SmsTransactionParser.parseWithReason(sender, body, timestamp)
          logSmsDecision(result)
          val parsed = result.transaction
          val wouldCreatePending = parsed != null && !ExpenseTransactionStore.hasStoredTransaction(reactContext, parsed)

          if (wouldCreatePending) {
            matched += 1
          }

          if (!wouldCreatePending) {
            continue
          }

          messages.pushMap(
            Arguments.createMap().apply {
              putString("id", id)
              putString("sender", sender)
              putString("bodyPreview", safeDebugPreview(body))
              putDouble("timestamp", timestamp.toDouble())
              putBoolean("matched", true)
              putString("reason", result.reason)

              putMap(
                "transaction",
                Arguments.createMap().apply {
                  putDouble("amount", parsed!!.amount)
                  putString("currency", parsed.currency)
                  putString("merchant", parsed.merchant)
                  putString("type", parsed.type)
                  putString("category", ExpenseTransactionStore.categoryForMerchant(parsed.merchant))
                  putDouble("confidence", parsed.confidence)
                  putBoolean("reviewRequired", parsed.reviewRequired)
                  putString("classificationReason", parsed.classificationReason)
                }
              )
            }
          )
        }
      }

      rememberDebugScan(lastProcessedSmsId)
      promise.resolve(
        Arguments.createMap().apply {
          putInt("scanned", scanned)
          putInt("matched", matched)
          putArray("messages", messages)
        }
      )
    } catch (error: Exception) {
      promise.reject("SMS_DEBUG_TEST_FAILED", error.message, error)
    }
  }

  override fun onRequestPermissionsResult(
    requestCode: Int,
    permissions: Array<String>,
    grantResults: IntArray
  ): Boolean {
    if (requestCode != 4312) {
      return false
    }

    permissionPromise?.resolve(hasRequiredPermissions())
    permissionPromise = null
    return true
  }

  private fun hasRequiredPermissions(): Boolean =
    requiredPermissions().all { permission ->
      reactContext.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED
    }

  private fun requiredPermissions(): Array<String> {
    val permissions = mutableListOf(Manifest.permission.RECEIVE_SMS, Manifest.permission.READ_SMS)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      permissions.add(Manifest.permission.POST_NOTIFICATIONS)
    }

    return permissions.toTypedArray()
  }

  private fun emitExpensesChanged() {
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("MemonestExpensesChanged", null)
  }

  private fun isReceiverEnabled(): Boolean {
    val component = ComponentName(reactContext, SmsTransactionReceiver::class.java)
    val state = reactContext.packageManager.getComponentEnabledSetting(component)

    return state == PackageManager.COMPONENT_ENABLED_STATE_ENABLED ||
      state == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT
  }

  private fun logSmsDecision(result: SmsTransactionParseResult) {
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
    Log.i("MemoryExpenseSms", "Final SMS decision=${result.finalDecision} reason=${result.reason}")
  }

  private fun logFinalStoreDecision(decision: String, reason: String, parsed: ParsedSmsTransaction?) {
    Log.i(
      "MemoryExpenseSms",
      "Final SMS save decision=$decision reason=$reason amount=${parsed?.amount} type=${parsed?.type} confidence=${parsed?.confidence}"
    )
  }

  private fun rememberDebugScan(lastProcessedSmsId: String?) {
    reactContext
      .getSharedPreferences(DEBUG_PREFS, Context.MODE_PRIVATE)
      .edit()
      .putLong(LAST_SCAN_TIME_KEY, System.currentTimeMillis())
      .apply {
        if (lastProcessedSmsId != null) {
          putString(LAST_PROCESSED_SMS_ID_KEY, lastProcessedSmsId)
        }
      }
      .apply()
  }
}

private const val DEBUG_PREFS = "memonest_expense_sms_debug"
private const val LAST_SCAN_TIME_KEY = "last_sms_scan_time"
private const val LAST_PROCESSED_SMS_ID_KEY = "last_processed_sms_id"

private fun com.facebook.react.bridge.WritableMap.putNullableLong(key: String, value: Long) {
  if (value > 0L) {
    putDouble(key, value.toDouble())
  } else {
    putNull(key)
  }
}

private fun safeDebugPreview(message: String): String {
  val normalized = message.replace(Regex("\\s+"), " ").trim()
  return normalized.substring(0, minOf(normalized.length, 180))
}

private fun ReadableMap.toJson(): JSONObject {
  val json = JSONObject()
  val iterator = keySetIterator()

  while (iterator.hasNextKey()) {
    val key = iterator.nextKey()

    when (getType(key)) {
      com.facebook.react.bridge.ReadableType.Boolean -> json.put(key, getBoolean(key))
      com.facebook.react.bridge.ReadableType.Number -> json.put(key, getDouble(key))
      com.facebook.react.bridge.ReadableType.String -> json.put(key, getString(key))
      else -> Unit
    }
  }

  return json
}

private fun toWritableArray(array: JSONArray) =
  Arguments.createArray().apply {
    for (index in 0 until array.length()) {
      array.optJSONObject(index)?.let { pushMap(it.toWritableMap()) }
    }
  }

private fun JSONObject.toWritableMap() =
  Arguments.createMap().also { map ->
    val keys = keys()

    while (keys.hasNext()) {
      val key = keys.next()
      val value = opt(key)

      when (value) {
        is Boolean -> map.putBoolean(key, value)
        is Int -> map.putInt(key, value)
        is Long -> map.putDouble(key, value.toDouble())
        is Double -> map.putDouble(key, value)
        is Number -> map.putDouble(key, value.toDouble())
        is String -> map.putString(key, value)
        JSONObject.NULL, null -> map.putNull(key)
        else -> map.putString(key, value.toString())
      }
    }
  }
