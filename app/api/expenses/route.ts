import { NextResponse } from 'next/server';

import { getExpenseOwnerFilter, getExpenseUser } from '@/lib/expenseAuth';
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

const buildExpensePayload = (body: Record<string, unknown>, userId: string) => {
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
    type,
    userId
  };
};

export async function GET(request: Request) {
  const user = getExpenseUser(request);

  if (!user) {
    return NextResponse.json({ error: 'Login required' }, { status: 401 });
  }

  try {
    await connectDB();
    const searchParams = new URL(request.url).searchParams;
    const page = Math.max(Number.parseInt(searchParams.get('page') || '1', 10) || 1, 1);
    const pageSize = Math.min(
      Math.max(Number.parseInt(searchParams.get('limit') || '50', 10) || 50, 1),
      100
    );
    const filter = getExpenseOwnerFilter(user.id);
    const total = await Expense.countDocuments(filter);
    const expenses = await Expense.find(filter)
      .sort({ timestamp: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean();
    const totalPages = Math.ceil(total / pageSize);

    return NextResponse.json({
      count: total,
      data: expenses,
      hasMore: page < totalPages,
      page,
      pageSize,
      totalPages
    });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = getExpenseUser(request);

  if (!user) {
    return NextResponse.json({ error: 'Login required' }, { status: 401 });
  }

  try {
    const body = await parseJsonBody(request);

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const payload = buildExpensePayload(body as Record<string, unknown>, user.id);

    if (!payload.deviceExpenseId || payload.amount <= 0) {
      return NextResponse.json(
        { error: 'Device expense id and amount are required' },
        { status: 400 }
      );
    }

    await connectDB();

    const existing = await Expense.findOne({ deviceExpenseId: payload.deviceExpenseId })
      .select({ userId: 1 })
      .lean();
    const existingUserId = existing?.userId || 'main';

    if (existing && existingUserId !== user.id) {
      return NextResponse.json({ error: 'This transaction belongs to another user' }, { status: 403 });
    }

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
