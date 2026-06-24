import { NextResponse } from 'next/server';

import { validateApiKey } from '@/lib/apiKey';
import { connectDB } from '@/lib/mongodb';
import PlaceTimeline from '@/models/PlaceTimeline';

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

const toNumber = (value: unknown, fallback: number) => {
  const parsed = typeof value === 'number' ? value : Number(toString(value));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getRangeStart = (range: string | null) => {
  const now = new Date();

  if (range === 'today') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  if (range === 'yesterday') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  }

  if (range === 'week') {
    const day = now.getDay() || 7;
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1);
  }

  if (range === 'month') {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }

  return null;
};

const getRangeEnd = (range: string | null) => {
  if (range !== 'yesterday') {
    return null;
  }

  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

const buildTimelinePayload = (body: Record<string, unknown>) => ({
  durationMinutes:
    body.durationMinutes === undefined ? undefined : toNumber(body.durationMinutes, 0),
  eventType: toString(body.eventType),
  latitude: toNumber(body.latitude, Number.NaN),
  longitude: toNumber(body.longitude, Number.NaN),
  placeId: toString(body.placeId),
  placeName: toString(body.placeName),
  timestamp: body.timestamp ? new Date(toString(body.timestamp)) : new Date()
});

export async function GET(request: Request) {
  const authError = validateApiKey(request);

  if (authError) {
    return authError;
  }

  try {
    const { searchParams } = new URL(request.url);
    const range = searchParams.get('range');
    const start = getRangeStart(range);
    const end = getRangeEnd(range);
    const query: Record<string, unknown> = {};

    if (start || end) {
      query.timestamp = {
        ...(start ? { $gte: start } : {}),
        ...(end ? { $lt: end } : {})
      };
    }

    await connectDB();

    const events = await PlaceTimeline.find(query).sort({ timestamp: -1 }).limit(1000).lean();

    return NextResponse.json({
      count: events.length,
      data: events
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

    const payload = buildTimelinePayload(body as Record<string, unknown>);

    if (
      !payload.placeId ||
      !payload.placeName ||
      !['enter', 'exit'].includes(payload.eventType) ||
      !Number.isFinite(payload.latitude) ||
      !Number.isFinite(payload.longitude)
    ) {
      return NextResponse.json({ error: 'Valid place and event fields are required' }, { status: 400 });
    }

    await connectDB();

    const event = await PlaceTimeline.create(payload);

    return NextResponse.json({ data: event }, { status: 201 });
  } catch (error) {
    const status = error instanceof Error && error.name === 'ValidationError' ? 400 : 500;
    return NextResponse.json({ error: getErrorMessage(error) }, { status });
  }
}

export async function DELETE(request: Request) {
  const authError = validateApiKey(request);

  if (authError) {
    return authError;
  }

  try {
    const { searchParams } = new URL(request.url);
    const recentMinutes = Number.parseInt(searchParams.get('recentMinutes') || '', 10);
    const query =
      Number.isFinite(recentMinutes) && recentMinutes > 0
        ? { timestamp: { $gte: new Date(Date.now() - recentMinutes * 60 * 1000) } }
        : {};

    await connectDB();

    const result = await PlaceTimeline.deleteMany(query);

    return NextResponse.json({
      deletedCount: result.deletedCount || 0,
      message: 'Timeline events deleted'
    });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
