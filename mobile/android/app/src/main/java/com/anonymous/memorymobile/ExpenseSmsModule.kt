package com.anonymous.memorymobile

import android.Manifest
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener
import org.json.JSONArray
import org.json.JSONObject

class ExpenseSmsModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext), PermissionListener {
  private var permissionPromise: Promise? = null

  override fun getName(): String = "ExpenseSmsModule"

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
  fun confirmTransaction(id: String, updates: ReadableMap?, promise: Promise) {
    val updated = ExpenseTransactionStore.confirmPending(reactContext, id, updates?.toJson())
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
        timestamp = System.currentTimeMillis()
      )
    promise.resolve(expense.toWritableMap())
  }

  @ReactMethod
  fun simulateIncomingSms(sender: String, messageBody: String, promise: Promise) {
    val result = SmsTransactionParser.parseWithReason(sender, messageBody, System.currentTimeMillis())
    val parsed = result.transaction

    if (parsed == null) {
      promise.resolve(
        Arguments.createMap().apply {
          putBoolean("matched", false)
          putString("reason", result.reason)
        }
      )
      return
    }

    val pending = ExpenseTransactionStore.addPending(reactContext, parsed)
    ExpenseNotificationHelper.notifyPendingTransaction(reactContext, pending)
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

    val maxMessages = limit.toInt().coerceIn(1, 25)
    val reasonCounts = linkedMapOf<String, Int>()
    var scanned = 0
    var matched = 0
    var createdOrExisting = 0

    try {
      reactContext.contentResolver.query(
        Uri.parse("content://sms/inbox"),
        arrayOf("address", "body", "date"),
        null,
        null,
        "date DESC"
      )?.use { cursor ->
        val addressIndex = cursor.getColumnIndex("address")
        val bodyIndex = cursor.getColumnIndex("body")
        val dateIndex = cursor.getColumnIndex("date")

        while (cursor.moveToNext() && scanned < maxMessages) {
          scanned += 1
          val sender = cursor.getString(addressIndex) ?: "Unknown"
          val body = cursor.getString(bodyIndex) ?: ""
          val timestamp = cursor.getLong(dateIndex)
          val result = SmsTransactionParser.parseWithReason(sender, body, timestamp)
          val parsed = result.transaction

          if (parsed == null) {
            reasonCounts[result.reason] = (reasonCounts[result.reason] ?: 0) + 1
            continue
          }

          matched += 1
          val pending = ExpenseTransactionStore.addPending(reactContext, parsed)
          createdOrExisting += 1
          ExpenseNotificationHelper.notifyPendingTransaction(reactContext, pending)
        }
      }

      val reasons = Arguments.createMap()
      reasonCounts.forEach { (reason, count) -> reasons.putInt(reason, count) }
      promise.resolve(
        Arguments.createMap().apply {
          putInt("scanned", scanned)
          putInt("matched", matched)
          putInt("pending", createdOrExisting)
          putMap("ignoredReasons", reasons)
        }
      )
    } catch (error: Exception) {
      promise.reject("SMS_SCAN_FAILED", error.message, error)
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
