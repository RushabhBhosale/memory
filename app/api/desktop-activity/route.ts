import { NextResponse } from 'next/server';

import { validateApiKey } from '@/lib/apiKey';
import { connectDB } from '@/lib/mongodb';
import DesktopActivity from '@/models/DesktopActivity';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 180;

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Internal server error';

const getLimitParam = (value: string | null) => {
  const parsed = Number.parseInt(value || '', 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_LIMIT;
  }

  return Math.min(parsed, MAX_LIMIT);
};

const toString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const toNumber = (value: unknown) => {
  const parsed = typeof value === 'number' ? value : Number.parseInt(toString(value), 10);
  return Number.isFinite(parsed) ? parsed : 0;
};
const toItems = (value: unknown, key: 'projectName' | 'appName') =>
  Array.isArray(value)
    ? value
        .map((item) => {
          if (!item || typeof item !== 'object') {
            return null;
          }

          const record = item as Record<string, unknown>;
          const name = toString(record[key]);

          if (!name) {
            return null;
          }

          return {
            [key]: name,
            durationMinutes: toNumber(record.durationMinutes),
          };
        })
        .filter(Boolean)
    : [];

export async function GET(request: Request) {
  const authError = validateApiKey(request);

  if (authError) {
    return authError;
  }

  try {
    const { searchParams } = new URL(request.url);
    const limit = getLimitParam(searchParams.get('limit'));

    await connectDB();

    const rows = await DesktopActivity.find()
      .sort({ date: -1, createdAt: -1 })
      .limit(limit)
      .lean();

    return NextResponse.json({
      count: rows.length,
      data: rows,
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
    const body = (await request.json()) as Record<string, unknown>;
    const date = toString(body.date);

    if (!date) {
      return NextResponse.json({ error: 'date is required' }, { status: 400 });
    }

    await connectDB();

    const saved = await DesktopActivity.findOneAndUpdate(
      {
        date,
        source: toString(body.source) || 'desktop-companion',
      },
      {
        date,
        title: toString(body.title) || `Desktop Activity Summary ${date}`,
        summary: toString(body.summary),
        codingMinutes: toNumber(body.codingMinutes),
        productiveMinutes: toNumber(body.productiveMinutes),
        idleMinutes: toNumber(body.idleMinutes),
        productivityScore: toNumber(body.productivityScore),
        projectBreakdown: toItems(body.projectBreakdown, 'projectName'),
        appBreakdown: toItems(body.appBreakdown, 'appName'),
        source: toString(body.source) || 'desktop-companion',
        deviceLabel: toString(body.deviceLabel),
        capturedAt: body.capturedAt ? new Date(toString(body.capturedAt)) : new Date(),
        syncedAt: new Date(),
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    ).lean();

    return NextResponse.json({
      message: 'Desktop activity saved',
      data: saved,
    });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
