import { NextResponse } from 'next/server';

import { validateApiKey } from '@/lib/apiKey';
import { connectDB } from '@/lib/mongodb';
import Place from '@/models/Place';

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

const buildPlacePayload = (body: Record<string, unknown>) => ({
  latitude: toNumber(body.latitude, Number.NaN),
  longitude: toNumber(body.longitude, Number.NaN),
  name: toString(body.name),
  radiusMeters: Math.max(50, toNumber(body.radiusMeters, 50)),
  type: toString(body.type) || 'custom'
});

export async function GET(request: Request) {
  const authError = validateApiKey(request);

  if (authError) {
    return authError;
  }

  try {
    await connectDB();

    const places = await Place.find().sort({ updatedAt: -1 }).lean();

    return NextResponse.json({
      count: places.length,
      data: places
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

    const payload = buildPlacePayload(body as Record<string, unknown>);

    if (!payload.name || !Number.isFinite(payload.latitude) || !Number.isFinite(payload.longitude)) {
      return NextResponse.json({ error: 'Place name, latitude, and longitude are required' }, { status: 400 });
    }

    await connectDB();

    const place = await Place.create(payload);

    return NextResponse.json({ data: place }, { status: 201 });
  } catch (error) {
    const status = error instanceof Error && error.name === 'ValidationError' ? 400 : 500;
    return NextResponse.json({ error: getErrorMessage(error) }, { status });
  }
}
