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

const parseJsonBody = async (request: Request) => {
  try {
    return await request.json();
  } catch {
    return null;
  }
};

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

const pickString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const pickTags = (value: unknown) =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
    : undefined;

const pickImportance = (value: unknown) => {
  const importance = typeof value === 'number' ? value : Number.parseInt(pickString(value), 10);

  return Number.isInteger(importance) && importance >= 1 && importance <= 5
    ? importance
    : undefined;
};

const buildActivityUpdates = (type: ActivityType, body: Record<string, unknown>) => {
  const updates: Record<string, unknown> = {};
  const title = pickString(body.title);
  const content = pickString(body.content);
  const category = pickString(body.category);
  const source = pickString(body.source);
  const tags = pickTags(body.tags);
  const importance = pickImportance(body.importance);

  if (title) {
    updates.title = title;
  }

  if (content) {
    updates[type === 'task' ? 'description' : type === 'meeting' ? 'details' : 'content'] =
      content;
  }

  if (category) {
    updates.category = category;
  }

  if (source) {
    updates.source = source;
  }

  if (tags) {
    updates.tags = tags;
  }

  if (importance !== undefined) {
    updates.importance = importance;
  }

  if (type === 'task') {
    const status = pickString(body.status);

    if (status) {
      updates.status = status;
    }
  }

  if (type === 'note') {
    const kind = pickString(body.kind);

    if (kind) {
      updates.kind = kind;
    }
  }

  if (type === 'memory') {
    const kind = pickString(body.kind);
    const reminderAt = pickString(body.reminderAt);

    if (kind) {
      updates.kind = kind;
    }

    if (reminderAt) {
      updates.reminderAt = reminderAt;
    }

    if (typeof body.notificationEnabled === 'boolean') {
      updates.notificationEnabled = body.notificationEnabled;
    }
  }

  return updates;
};

const updateActivityItem = async (
  type: ActivityType,
  id: string,
  updates: Record<string, unknown>
) => {
  switch (type) {
    case 'memory': {
      const memory = await Memory.findByIdAndUpdate(id, updates, {
        new: true,
        runValidators: true
      })
        .populate('projectId', 'name description status')
        .lean();

      return memory ? toMemoryActivity(memory) : null;
    }
    case 'task': {
      const task = await ProjectTask.findByIdAndUpdate(id, updates, {
        new: true,
        runValidators: true
      })
        .populate('projectId', 'name description status')
        .lean();

      return task ? toTaskActivity(task) : null;
    }
    case 'note': {
      const note = await ProjectNote.findByIdAndUpdate(id, updates, {
        new: true,
        runValidators: true
      })
        .populate('projectId', 'name description status')
        .lean();

      return note ? toNoteActivity(note) : null;
    }
    case 'meeting': {
      const meeting = await ProjectMeeting.findByIdAndUpdate(id, updates, {
        new: true,
        runValidators: true
      })
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

export async function PATCH(request: Request, context: RouteContext) {
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

    const body = await parseJsonBody(request);

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const updates = buildActivityUpdates(type as ActivityType, body as Record<string, unknown>);

    if (!Object.keys(updates).length) {
      return NextResponse.json(
        { error: 'No valid fields provided for update' },
        { status: 400 }
      );
    }

    await connectDB();

    const data = await updateActivityItem(type as ActivityType, id, updates);

    if (!data) {
      return NextResponse.json({ error: 'Activity not found' }, { status: 404 });
    }

    return NextResponse.json({
      message: 'Activity updated',
      data
    });
  } catch (error) {
    const status = error instanceof Error && error.name === 'ValidationError' ? 400 : 500;

    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status }
    );
  }
}
