package com.anonymous.memorymobile

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class ExpenseActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val transactionId = intent.getStringExtra(EXPENSE_EXTRA_ID) ?: return

    when (intent.action) {
      EXPENSE_ACTION_ADD -> ExpenseTransactionStore.confirmPending(context, transactionId)
      EXPENSE_ACTION_IGNORE -> ExpenseTransactionStore.ignorePending(context, transactionId)
    }

    ExpenseNotificationHelper.dismiss(context, transactionId)
  }
}

