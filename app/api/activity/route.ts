import { NextResponse } from 'next/server';

import {
  sortActivityItems,
  toMeetingActivity,
  toMemoryActivity,
  toNoteActivity,
  toTaskActivity
} from '@/lib/activityFeed';
import { validateApiKey } from '@/lib/apiKey';
import { connectDB } from '@/lib/mongodb';
import Memory from '@/models/Memory';
import '@/models/Project';
import ProjectMeeting from '@/models/ProjectMeeting';
import ProjectNote from '@/models/ProjectNote';
import ProjectTask from '@/models/ProjectTask';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Internal server error';

const getDateParam = (value: string | null) => {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getLimitParam = (value: string | null) => {
  const parsed = Number.parseInt(value || '', 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_LIMIT;
  }

  return Math.min(parsed, MAX_LIMIT);
};

const getCreatedAtQuery = (from: Date | null, to: Date | null) => {
  if (!from && !to) {
    return {};
  }

  return {
    createdAt: {
      ...(from ? { $gte: from } : {}),
      ...(to ? { $lte: to } : {})
    }
  };
};

export async function GET(request: Request) {
  const authError = validateApiKey(request);

  if (authError) {
    return authError;
  }

  try {
    const { searchParams } = new URL(request.url);
    const from = getDateParam(searchParams.get('from'));
    const to = getDateParam(searchParams.get('to'));
    const limit = getLimitParam(searchParams.get('limit'));
    const query = getCreatedAtQuery(from, to);

    await connectDB();

    const [memories, tasks, notes, meetings] = await Promise.all([
      Memory.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('projectId', 'name description status')
        .lean(),
      ProjectTask.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('projectId', 'name description status')
        .lean(),
      ProjectNote.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('projectId', 'name description status')
        .lean(),
      ProjectMeeting.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('projectId', 'name description status')
        .lean()
    ]);

    const data = sortActivityItems([
      ...memories.map(toMemoryActivity),
      ...tasks.map(toTaskActivity),
      ...notes.map(toNoteActivity),
      ...meetings.map(toMeetingActivity)
    ]).slice(0, limit);

    return NextResponse.json({
      count: data.length,
      data
    });
  } catch (error) {
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
