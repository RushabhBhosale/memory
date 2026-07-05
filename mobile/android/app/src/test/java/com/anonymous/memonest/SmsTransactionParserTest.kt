package com.anonymous.memonest

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SmsTransactionParserTest {
  @Test
  fun detectsRuleBasedDebitSms() {
    val result = SmsTransactionParser.parseWithRules(
      "VK-HDFCBK",
      "Rs.250.00 debited from a/c XX1234 for Swiggy order on 03-07-26.",
      1L
    )

    assertEquals("matched", result.reason)
    assertNotNull(result.transaction)
    assertEquals("debit", result.transaction?.type)
    assertEquals(250.0, result.transaction?.amount ?: 0.0, 0.001)
  }

  @Test
  fun detectsRuleBasedCreditSms() {
    val result = SmsTransactionParser.parseWithRules(
      "VK-ICICIB",
      "INR 1500 credited to your account XX7788 from ACME Payroll.",
      1L
    )

    assertEquals("matched", result.reason)
    assertEquals("credit", result.transaction?.type)
  }

  @Test
  fun blocksOtpSmsBeforeAiFallback() {
    val body = "OTP 123456 is your verification code for payment of Rs.500."
    val result = SmsTransactionParser.parseWithRules("VM-BANK", body, 1L)

    assertEquals("ignored_sensitive_message", result.reason)
    assertNull(result.transaction)
    assertTrue(SmsTransactionAiFallback.hasAmountLikeValue(body))
  }

  @Test
  fun detectsSentStyleTransferSms() {
    val body = "Sent Rs.58.00 from Kotak Bank AC X9341 to snp051643@tjsb on 03-07-26.UPI Ref 618478851780."
    val result = SmsTransactionParser.parseWithRules("JX-KOTAKB-S", body, 1L)

    assertEquals("matched", result.reason)
    assertNotNull(result.transaction)
    assertEquals("debit", result.transaction?.type)
    assertEquals(58.0, result.transaction?.amount ?: 0.0, 0.001)
    assertEquals("Snp051643@tjsb", result.transaction?.merchant)
  }

  @Test
  fun offerSmsIsNotRuleMatched() {
    val result = SmsTransactionParser.parseWithRules(
      "AD-BANK",
      "Get Rs.500 cashback offer on a new credit card. Apply now.",
      1L
    )

    assertNull(result.transaction)
    assertEquals("ignored_non_transaction_message", result.reason)
  }

  @Test
  fun failedTransactionSmsIsNotRuleMatched() {
    val result = SmsTransactionParser.parseWithRules(
      "VK-BANK",
      "Your transaction of INR 999.00 failed due to insufficient balance.",
      1L
    )

    assertNull(result.transaction)
    assertEquals("ignored_non_transaction_message", result.reason)
  }

  @Test
  fun balanceOnlySmsIsNotRuleMatched() {
    val result = SmsTransactionParser.parseWithRules(
      "VK-BANK",
      "Available balance in account XX1234 is INR 5000.00 as of today.",
      1L
    )

    assertNull(result.transaction)
    assertEquals("ignored_non_transaction_message", result.reason)
  }

  @Test
  fun masksSensitiveFieldsBeforeAi() {
    val masked = SmsTransactionAiFallback.maskSensitiveSmsBody(
      "OTP 123456. Sent Rs.58.00 from Kotak Bank AC X9341 to snp051643@tjsb. Call +91 9876543210. Ref 618478851780."
    )

    assertFalse(masked.contains("123456"))
    assertFalse(masked.contains("snp051643@tjsb"))
    assertFalse(masked.contains("9876543210"))
    assertFalse(masked.contains("618478851780"))
  }
}
