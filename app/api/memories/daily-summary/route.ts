import { NextResponse } from 'next/server';

import {
  buildDailySummaryPayload,
  buildDailySummarySearchQuery,
  toDailySummaryUpdate
} from '@/lib/dailySummary';
import { validateApiKey } from '@/lib/apiKey';
import { connectDB } from '@/lib/mongodb';
import DailySummary from '@/models/DailySummary';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

const parseJsonBody = async (request: Request) => {
  try {
    return await request.json();
  } catch {
    return null;
  }
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Internal server error';

const getLimit = (value: string | null) => {
  const parsed = Number.parseInt(value || '', 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_LIMIT;
  }

  return Math.min(parsed, MAX_LIMIT);
};

export async function GET(request: Request) {
  const authError = validateApiKey(request);

  if (authError) {
    return authError;
  }

  try {
    const { searchParams } = new URL(request.url);
    const limit = getLimit(searchParams.get('limit'));
    const query = buildDailySummarySearchQuery(searchParams);

    await connectDB();

    const summaries = await DailySummary.find(query)
      .sort({ date: -1 })
      .limit(limit)
      .lean();

    return NextResponse.json({
      count: summaries.length,
      data: summaries
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

    const result = buildDailySummaryPayload(body as Record<string, unknown>);

    if (result.error || !result.payload?.date) {
      return NextResponse.json({ error: result.error || 'Invalid daily summary' }, { status: 400 });
    }

    await connectDB();

    const summary = await DailySummary.findOneAndUpdate(
      { date: result.payload.date },
      toDailySummaryUpdate(result.payload),
      {
        new: true,
        runValidators: true,
        setDefaultsOnInsert: true,
        upsert: true
      }
    ).lean();

    return NextResponse.json({ data: summary });
  } catch (error) {
    const status = error instanceof Error && error.name === 'ValidationError' ? 400 : 500;

    return NextResponse.json({ error: getErrorMessage(error) }, { status });
  }
}
