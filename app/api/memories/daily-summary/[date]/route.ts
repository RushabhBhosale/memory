import { NextResponse } from 'next/server';

import {
  buildDailySummaryPayload,
  getDailySummaryDateError,
  toDailySummaryUpdate
} from '@/lib/dailySummary';
import { validateApiKey } from '@/lib/apiKey';
import { connectDB } from '@/lib/mongodb';
import DailySummary from '@/models/DailySummary';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{
    date: string;
  }>;
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Internal server error';

const parseJsonBody = async (request: Request) => {
  try {
    return await request.json();
  } catch {
    return null;
  }
};

const getDate = async (context: RouteContext) => {
  const params = await context.params;
  return decodeURIComponent(params.date || '').trim();
};

export async function GET(request: Request, context: RouteContext) {
  const authError = validateApiKey(request);

  if (authError) {
    return authError;
  }

  const date = await getDate(context);
  const dateError = getDailySummaryDateError(date);

  if (dateError) {
    return NextResponse.json({ error: dateError }, { status: 400 });
  }

  try {
    await connectDB();

    const summary = await DailySummary.findOne({ date }).lean();

    if (!summary) {
      return NextResponse.json({ error: 'Daily summary not found' }, { status: 404 });
    }

    return NextResponse.json({ data: summary });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const authError = validateApiKey(request);

  if (authError) {
    return authError;
  }

  const date = await getDate(context);
  const dateError = getDailySummaryDateError(date);

  if (dateError) {
    return NextResponse.json({ error: dateError }, { status: 400 });
  }

  try {
    const body = await parseJsonBody(request);

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const result = buildDailySummaryPayload(body as Record<string, unknown>, { partial: true });

    if (result.error || !result.payload) {
      return NextResponse.json({ error: result.error || 'Invalid daily summary' }, { status: 400 });
    }

    delete result.payload.date;

    await connectDB();

    const summary = await DailySummary.findOneAndUpdate(
      { date },
      toDailySummaryUpdate(result.payload),
      {
        new: true,
        runValidators: true
      }
    ).lean();

    if (!summary) {
      return NextResponse.json({ error: 'Daily summary not found' }, { status: 404 });
    }

    return NextResponse.json({ data: summary });
  } catch (error) {
    const status = error instanceof Error && error.name === 'ValidationError' ? 400 : 500;

    return NextResponse.json({ error: getErrorMessage(error) }, { status });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const authError = validateApiKey(request);

  if (authError) {
    return authError;
  }

  const date = await getDate(context);
  const dateError = getDailySummaryDateError(date);

  if (dateError) {
    return NextResponse.json({ error: dateError }, { status: 400 });
  }

  try {
    await connectDB();

    const summary = await DailySummary.findOneAndDelete({ date }).lean();

    if (!summary) {
      return NextResponse.json({ error: 'Daily summary not found' }, { status: 404 });
    }

    return NextResponse.json({
      message: 'Daily summary deleted',
      data: summary
    });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
