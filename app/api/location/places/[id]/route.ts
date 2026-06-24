import mongoose from 'mongoose';
import { NextResponse } from 'next/server';

import { validateApiKey } from '@/lib/apiKey';
import { connectDB } from '@/lib/mongodb';
import Place from '@/models/Place';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{
    id: string;
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

const getId = async (context: RouteContext) => (await context.params).id;

const validateId = (id: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'Invalid place id' }, { status: 400 });
  }

  return null;
};

const toString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const toNumber = (value: unknown) => {
  const parsed = typeof value === 'number' ? value : Number(toString(value));
  return Number.isFinite(parsed) ? parsed : undefined;
};

const pickUpdates = (body: Record<string, unknown>) => {
  const updates: Record<string, unknown> = {};

  if (Object.prototype.hasOwnProperty.call(body, 'name')) {
    updates.name = toString(body.name);
  }

  if (Object.prototype.hasOwnProperty.call(body, 'type')) {
    updates.type = toString(body.type);
  }

  if (Object.prototype.hasOwnProperty.call(body, 'latitude')) {
    updates.latitude = toNumber(body.latitude);
  }

  if (Object.prototype.hasOwnProperty.call(body, 'longitude')) {
    updates.longitude = toNumber(body.longitude);
  }

  if (Object.prototype.hasOwnProperty.call(body, 'radiusMeters')) {
    updates.radiusMeters = Math.max(50, toNumber(body.radiusMeters) || 50);
  }

  return updates;
};

export async function PATCH(request: Request, context: RouteContext) {
  const authError = validateApiKey(request);

  if (authError) {
    return authError;
  }

  try {
    const id = await getId(context);
    const idError = validateId(id);

    if (idError) {
      return idError;
    }

    const body = await parseJsonBody(request);

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const updates = pickUpdates(body as Record<string, unknown>);

    await connectDB();

    const place = await Place.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true
    }).lean();

    if (!place) {
      return NextResponse.json({ error: 'Place not found' }, { status: 404 });
    }

    return NextResponse.json({ data: place });
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

  try {
    const id = await getId(context);
    const idError = validateId(id);

    if (idError) {
      return idError;
    }

    await connectDB();

    const place = await Place.findByIdAndDelete(id).lean();

    if (!place) {
      return NextResponse.json({ error: 'Place not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Place deleted', data: place });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
