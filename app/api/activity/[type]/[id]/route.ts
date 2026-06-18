import mongoose from 'mongoose';
import { NextResponse } from 'next/server';

import {
  toMeetingActivity,
  toMemoryActivity,
  toNoteActivity,
  toTaskActivity,
  type ActivityType
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

type RouteContext = {
  params: Promise<{
    id: string;
    type: string;
  }>;
};

const activityTypes = new Set<ActivityType>(['memory', 'task', 'note', 'meeting']);

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Internal server error';

const getParams = async (context: RouteContext) => context.params;

const validateActivityParams = (type: string, id: string) => {
  if (!activityTypes.has(type as ActivityType)) {
    return NextResponse.json({ error: 'Invalid activity type' }, { status: 400 });
  }

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'Invalid activity id' }, { status: 400 });
  }

  return null;
};

const findActivityItem = async (type: ActivityType, id: string) => {
  switch (type) {
    case 'memory': {
      const memory = await Memory.findById(id)
        .populate('projectId', 'name description status')
        .lean();

      return memory ? toMemoryActivity(memory) : null;
    }
    case 'task': {
      const task = await ProjectTask.findById(id)
        .populate('projectId', 'name description status')
        .lean();

      return task ? toTaskActivity(task) : null;
    }
    case 'note': {
      const note = await ProjectNote.findById(id)
        .populate('projectId', 'name description status')
        .lean();

      return note ? toNoteActivity(note) : null;
    }
    case 'meeting': {
      const meeting = await ProjectMeeting.findById(id)
        .populate('projectId', 'name description status')
        .lean();

      return meeting ? toMeetingActivity(meeting) : null;
    }
    default:
      return null;
  }
};

export async function GET(request: Request, context: RouteContext) {
  const authError = validateApiKey(request);

  if (authError) {
    return authError;
  }

  try {
    const { id, type } = await getParams(context);
    const paramsError = validateActivityParams(type, id);

    if (paramsError) {
      return paramsError;
    }

    await connectDB();

    const data = await findActivityItem(type as ActivityType, id);

    if (!data) {
      return NextResponse.json({ error: 'Activity not found' }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
