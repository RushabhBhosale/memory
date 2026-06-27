import { NextResponse } from 'next/server';

import { validateApiKey } from '@/lib/apiKey';
import { connectDB } from '@/lib/mongodb';
import Expense from '@/models/Expense';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Internal server error';

const parseJsonBody = async (request: Request) => {
  try {
    return await request.json();
  } catch {
    return null;
  }
};

const toString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = typeof value === 'number' ? value : Number(toString(value));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toDate = (value: unknown) => {
  const parsed = typeof value === 'number' ? new Date(value) : new Date(toString(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const buildExpensePayload = (body: Record<string, unknown>) => {
  const timestamp = toDate(body.timestamp) || new Date();
  const type = toString(body.type) === 'income' ? 'income' : 'expense';

  return {
    amount: toNumber(body.amount),
    category: toString(body.category) || 'general',
    currency: toString(body.currency) || 'INR',
    deviceExpenseId: toString(body.deviceExpenseId || body.id),
    merchant: toString(body.merchant) || 'Unknown Merchant',
    note: toString(body.note),
    originalSmsPreview: toString(body.originalSmsPreview),
    source: toString(body.source) === 'sms' ? 'sms' : 'manual',
    timestamp,
    type
  };
};

export async function GET(request: Request) {
  const authError = validateApiKey(request);

  if (authError) {
    return authError;
  }

  try {
    await connectDB();

    const expenses = await Expense.find().sort({ timestamp: -1 }).limit(1000).lean();

    return NextResponse.json({
      count: expenses.length,
      data: expenses
    });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authError = validateApiKey(request);

  if (authError) {
    return authError;
  }

  try {
    const body = await parseJsonBody(request);

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const payload = buildExpensePayload(body as Record<string, unknown>);

    if (!payload.deviceExpenseId || payload.amount <= 0) {
      return NextResponse.json(
        { error: 'Device expense id and amount are required' },
        { status: 400 }
      );
    }

    await connectDB();

    const expense = await Expense.findOneAndUpdate(
      { deviceExpenseId: payload.deviceExpenseId },
      { $set: payload },
      { new: true, runValidators: true, setDefaultsOnInsert: true, upsert: true }
    ).lean();

    return NextResponse.json({ data: expense }, { status: 201 });
  } catch (error) {
    const status = error instanceof Error && error.name === 'ValidationError' ? 400 : 500;
    return NextResponse.json({ error: getErrorMessage(error) }, { status });
  }
}
