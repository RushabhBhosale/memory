import mongoose from 'mongoose';
import { NextResponse } from 'next/server';

import { validateApiKey } from '@/lib/apiKey';
import { connectDB } from '@/lib/mongodb';
import AssistantSession from '@/models/AssistantSession';
import Memory from '@/models/Memory';
import Project from '@/models/Project';
import ProjectMeeting from '@/models/ProjectMeeting';
import ProjectNote from '@/models/ProjectNote';
import ProjectTask from '@/models/ProjectTask';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type CommandBody = {
  input?: unknown;
  sessionId?: unknown;
};

type ProjectLike = {
  _id: mongoose.Types.ObjectId | string;
  name: string;
  description?: string;
  status?: string;
};

const DEFAULT_SESSION_KEY = 'default';
const RECENT_LIMIT = 20;
const SUMMARY_LIMIT = 8;
const DELETE_CHOICE_LIMIT = 10;

const STOP_WORDS = new Set([
  'a',
  'about',
  'all',
  'and',
  'any',
  'are',
  'db',
  'do',
  'find',
  'for',
  'i',
  'in',
  'is',
  'know',
  'me',
  'my',
  'of',
  'on',
  'the',
  'this',
  'to',
  'what'
]);

const parseJsonBody = async (request: Request) => {
  try {
    return (await request.json()) as CommandBody;
  } catch {
    return null;
  }
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Internal server error';

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();

const normalizeName = (value: string) =>
  normalizeWhitespace(value.replace(/[.!?]+$/g, ''));

const makeTitle = (value: string) => {
  const title = normalizeWhitespace(value);

  return title.length > 80 ? `${title.slice(0, 77)}...` : title;
};

const getSessionKey = (request: Request, body: CommandBody) => {
  const bodySessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
  const headerSessionId = request.headers.get('x-session-id')?.trim() || '';

  return bodySessionId || headerSessionId || DEFAULT_SESSION_KEY;
};

const getQueryTokens = (query: string) => {
  const tokens = query
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !STOP_WORDS.has(token));

  return tokens.length ? tokens.slice(0, 8) : [query.trim()].filter(Boolean);
};

const buildTextQuery = (query: string, fields: string[]) => {
  const tokens = getQueryTokens(query);
  const conditions = tokens.flatMap((token) => {
    const regex = new RegExp(escapeRegex(token), 'i');

    return fields.map((field) => ({ [field]: regex }));
  });

  return conditions.length ? { $or: conditions } : {};
};

const getProjectDisplay = (project: ProjectLike | null | undefined) =>
  project ? { _id: String(project._id), name: project.name } : null;

const findProjectByName = async (name: string) =>
  Project.findOne({
    name: new RegExp(`^${escapeRegex(normalizeName(name))}$`, 'i')
  });

const findOrCreateProject = async (name: string) => {
  const normalizedName = normalizeName(name);
  const existingProject = await findProjectByName(normalizedName);

  if (existingProject) {
    return { project: existingProject, created: false };
  }

  const project = await Project.create({
    name: normalizedName,
    source: 'assistant'
  });

  return { project, created: true };
};

const getSession = async (sessionKey: string) =>
  AssistantSession.findOneAndUpdate(
    { sessionKey },
    { $setOnInsert: { sessionKey } },
    { new: true, upsert: true }
  ).populate('activeProjectId', 'name description status');

const setActiveProject = async (sessionKey: string, projectId: mongoose.Types.ObjectId) =>
  AssistantSession.findOneAndUpdate(
    { sessionKey },
    { sessionKey, activeProjectId: projectId },
    { new: true, upsert: true }
  ).populate('activeProjectId', 'name description status');

const getActiveProject = async (sessionKey: string) => {
  const session = await getSession(sessionKey);
  const activeProject = session.activeProjectId;

  if (!activeProject || typeof activeProject !== 'object' || !('name' in activeProject)) {
    return null;
  }

  return activeProject as unknown as ProjectLike;
};

const askForProject = async () => {
  const projects = await Project.find().sort({ updatedAt: -1 }).limit(RECENT_LIMIT).lean();

  return NextResponse.json({
    message: 'Which project should I use?',
    needsProject: true,
    data: {
      projects
    }
  });
};

const createStandaloneMemory = async (content: string) => {
  const memory = await Memory.create({
    title: makeTitle(content),
    content,
    category: 'general',
    tags: [],
    source: 'assistant'
  });

  return memory.toObject();
};

const createProjectTask = async (project: ProjectLike, description: string) => {
  const task = await ProjectTask.create({
    projectId: project._id,
    title: makeTitle(description),
    description,
    source: 'assistant'
  });

  return task.toObject();
};

const createProjectNote = async (project: ProjectLike, content: string) => {
  const note = await ProjectNote.create({
    projectId: project._id,
    title: makeTitle(content),
    content,
    kind: 'note',
    source: 'assistant'
  });

  return note.toObject();
};

const createTypedProjectNote = async (
  project: ProjectLike,
  content: string,
  kind: 'requirement' | 'credential' | 'work_done'
) => {
  const note = await ProjectNote.create({
    projectId: project._id,
    title: makeTitle(content),
    content,
    kind,
    source: 'assistant'
  });

  return note.toObject();
};

const createProjectMeeting = async (project: ProjectLike, details: string) => {
  const meeting = await ProjectMeeting.create({
    projectId: project._id,
    title: makeTitle(details),
    details,
    source: 'assistant'
  });

  return meeting.toObject();
};

const listProjectTasks = async (projectId: unknown) =>
  ProjectTask.find({ projectId }).sort({ createdAt: -1 }).limit(RECENT_LIMIT).lean();

const listProjectNotes = async (projectId: unknown) =>
  ProjectNote.find({ projectId }).sort({ createdAt: -1 }).limit(RECENT_LIMIT).lean();

const listProjectMeetings = async (projectId: unknown) =>
  ProjectMeeting.find({ projectId }).sort({ createdAt: -1 }).limit(RECENT_LIMIT).lean();

const getProjectSummary = async (project: ProjectLike) => {
  const [pendingTasks, completedTasks, recentMeetings, recentNotes] = await Promise.all([
    ProjectTask.find({ projectId: project._id, status: 'pending' })
      .sort({ createdAt: -1 })
      .limit(SUMMARY_LIMIT)
      .lean(),
    ProjectTask.find({ projectId: project._id, status: 'completed' })
      .sort({ updatedAt: -1 })
      .limit(SUMMARY_LIMIT)
      .lean(),
    ProjectMeeting.find({ projectId: project._id })
      .sort({ createdAt: -1 })
      .limit(SUMMARY_LIMIT)
      .lean(),
    ProjectNote.find({ projectId: project._id })
      .sort({ createdAt: -1 })
      .limit(SUMMARY_LIMIT)
      .lean()
  ]);

  return {
    project,
    pendingTasks,
    completedTasks,
    recentMeetings,
    recentNotes
  };
};

const searchGrouped = async (query: string) => {
  const projectQuery = buildTextQuery(query, ['name', 'description', 'tags']);
  const taskQuery = buildTextQuery(query, ['title', 'description', 'status', 'tags']);
  const noteQuery = buildTextQuery(query, ['title', 'content', 'kind', 'tags']);
  const meetingQuery = buildTextQuery(query, ['title', 'details', 'tags']);
  const memoryQuery = buildTextQuery(query, ['title', 'content', 'category', 'tags', 'source']);

  const [projects, tasks, notes, meetings, memories] = await Promise.all([
    Project.find(projectQuery).sort({ updatedAt: -1 }).limit(RECENT_LIMIT).lean(),
    ProjectTask.find(taskQuery)
      .sort({ updatedAt: -1 })
      .limit(RECENT_LIMIT)
      .populate('projectId', 'name description status')
      .lean(),
    ProjectNote.find(noteQuery)
      .sort({ updatedAt: -1 })
      .limit(RECENT_LIMIT)
      .populate('projectId', 'name description status')
      .lean(),
    ProjectMeeting.find(meetingQuery)
      .sort({ updatedAt: -1 })
      .limit(RECENT_LIMIT)
      .populate('projectId', 'name description status')
      .lean(),
    Memory.find(memoryQuery).sort({ updatedAt: -1 }).limit(RECENT_LIMIT).lean()
  ]);

  return {
    projects,
    tasks,
    notes,
    meetings,
    memories
  };
};

const countGroupedResults = (results: Awaited<ReturnType<typeof searchGrouped>>) =>
  results.projects.length +
  results.tasks.length +
  results.notes.length +
  results.meetings.length +
  results.memories.length;

const searchTasksForDelete = async (query: string, projectId?: unknown) => {
  const baseQuery = buildTextQuery(query, ['title', 'description', 'status', 'tags']);
  const scopedQuery = projectId ? { $and: [{ projectId }, baseQuery] } : baseQuery;

  return ProjectTask.find(scopedQuery)
    .sort({ updatedAt: -1 })
    .limit(DELETE_CHOICE_LIMIT)
    .populate('projectId', 'name description status')
    .lean();
};

const searchMemoriesForDelete = async (query: string) =>
  Memory.find(buildTextQuery(query, ['title', 'content', 'category', 'tags', 'source']))
    .sort({ updatedAt: -1 })
    .limit(DELETE_CHOICE_LIMIT)
    .lean();

const handleDeleteTask = async (sessionKey: string, query: string) => {
  if (!query) {
    return NextResponse.json({ error: 'Task delete query is required' }, { status: 400 });
  }

  if (mongoose.Types.ObjectId.isValid(query)) {
    const deletedTask = await ProjectTask.findByIdAndDelete(query).lean();

    if (!deletedTask) {
      return NextResponse.json({ message: 'No matching task found.', data: null });
    }

    return NextResponse.json({
      message: `Deleted task: ${deletedTask.title}`,
      data: deletedTask
    });
  }

  const activeProject = await getActiveProject(sessionKey);
  const tasks = await searchTasksForDelete(query, activeProject?._id);

  if (!tasks.length) {
    return NextResponse.json({ message: 'No matching task found.', data: [] });
  }

  if (tasks.length > 1) {
    return NextResponse.json({
      message: 'Multiple tasks matched. Reply with @delete-task followed by the exact task id.',
      needsSelection: true,
      data: {
        tasks
      }
    });
  }

  await ProjectTask.findByIdAndDelete(tasks[0]._id);

  return NextResponse.json({
    message: `Deleted task: ${tasks[0].title}`,
    data: tasks[0]
  });
};

const handleDeleteMemory = async (query: string) => {
  if (!query) {
    return NextResponse.json({ error: 'Memory delete query is required' }, { status: 400 });
  }

  if (mongoose.Types.ObjectId.isValid(query)) {
    const deletedMemory = await Memory.findByIdAndDelete(query).lean();

    if (!deletedMemory) {
      return NextResponse.json({ message: 'No matching memory found.', data: null });
    }

    return NextResponse.json({
      message: `Deleted memory: ${deletedMemory.title}`,
      data: deletedMemory
    });
  }

  const memories = await searchMemoriesForDelete(query);

  if (!memories.length) {
    return NextResponse.json({ message: 'No matching memory found.', data: [] });
  }

  if (memories.length > 1) {
    return NextResponse.json({
      message: 'Multiple memories matched. Reply with @delete-memory followed by the exact memory id.',
      needsSelection: true,
      data: {
        memories
      }
    });
  }

  await Memory.findByIdAndDelete(memories[0]._id);

  return NextResponse.json({
    message: `Deleted memory: ${memories[0].title}`,
    data: memories[0]
  });
};

const getProjectFromNaturalTaskQuestion = async (input: string) => {
  const match = input.match(/\btasks?\s+(?:in|for)\s+(.+)$/i);

  if (!match) {
    return null;
  }

  return findProjectByName(match[1]);
};

const getProjectFromNaturalNoteQuestion = async (input: string) => {
  const match = input.match(/\bnotes?\s+(?:in|for)\s+(.+)$/i);

  if (!match) {
    return null;
  }

  return findProjectByName(match[1]);
};

const getProjectFromNaturalMeetingQuestion = async (input: string) => {
  const match = input.match(/\bmeetings?\s+(?:in|for)\s+(.+)$/i);

  if (!match) {
    return null;
  }

  return findProjectByName(match[1]);
};

const handleProjectSelection = async (sessionKey: string, name: string) => {
  if (!name) {
    return NextResponse.json({ error: 'Project name is required' }, { status: 400 });
  }

  const { project } = await findOrCreateProject(name);
  await setActiveProject(sessionKey, project._id);

  return NextResponse.json({
    message: `Active project set to ${project.name}`,
    activeProject: getProjectDisplay(project),
    data: project
  });
};

const handleProjectItemCommand = async (
  sessionKey: string,
  type: 'task' | 'note' | 'meeting' | 'requirement' | 'credential' | 'work_done',
  content: string
) => {
  if (!content) {
    return NextResponse.json({ error: `${type} content is required` }, { status: 400 });
  }

  const activeProject = await getActiveProject(sessionKey);

  if (!activeProject) {
    return askForProject();
  }

  if (type === 'task') {
    const task = await createProjectTask(activeProject, content);

    return NextResponse.json({
      message: `Task added to ${activeProject.name}`,
      activeProject: getProjectDisplay(activeProject),
      data: task
    });
  }

  if (type === 'note') {
    const note = await createProjectNote(activeProject, content);

    return NextResponse.json({
      message: `Note added to ${activeProject.name}`,
      activeProject: getProjectDisplay(activeProject),
      data: note
    });
  }

  if (type === 'requirement' || type === 'credential' || type === 'work_done') {
    const note = await createTypedProjectNote(activeProject, content, type);
    const label = type === 'work_done' ? 'Work entry' : `${type[0].toUpperCase()}${type.slice(1)}`;

    return NextResponse.json({
      message: `${label} added to ${activeProject.name}`,
      activeProject: getProjectDisplay(activeProject),
      data: note
    });
  }

  const meeting = await createProjectMeeting(activeProject, content);

  return NextResponse.json({
    message: `Meeting added to ${activeProject.name}`,
    activeProject: getProjectDisplay(activeProject),
    data: meeting
  });
};

const handleProjectScopedList = async (
  sessionKey: string,
  type: 'tasks' | 'notes' | 'meetings'
) => {
  const activeProject = await getActiveProject(sessionKey);

  if (!activeProject) {
    return askForProject();
  }

  const data =
    type === 'tasks'
      ? await listProjectTasks(activeProject._id)
      : type === 'notes'
        ? await listProjectNotes(activeProject._id)
        : await listProjectMeetings(activeProject._id);

  return NextResponse.json({
    message: `${type[0].toUpperCase()}${type.slice(1)} for ${activeProject.name}: ${data.length}`,
    activeProject: getProjectDisplay(activeProject),
    data
  });
};

const handleNaturalLanguage = async (sessionKey: string, input: string) => {
  const projectSwitch = input.match(/^(?:work on|switch to|open)\s+(.+)$/i);

  if (projectSwitch) {
    return handleProjectSelection(sessionKey, projectSwitch[1]);
  }

  const memoryMatch = input.match(/^(?:remember this|save this|note this|store this)\s*:?\s+([\s\S]+)$/i);

  if (memoryMatch) {
    const memory = await createStandaloneMemory(memoryMatch[1].trim());

    return NextResponse.json({
      message: 'Memory saved',
      data: memory
    });
  }

  if (/\btasks?\b/i.test(input)) {
    const project = await getProjectFromNaturalTaskQuestion(input);
    const activeProject = project || (await getActiveProject(sessionKey));

    if (activeProject) {
      const tasks = await listProjectTasks(activeProject._id);

      return NextResponse.json({
        message: `Tasks for ${activeProject.name}: ${tasks.length}`,
        activeProject: getProjectDisplay(activeProject),
        data: tasks
      });
    }
  }

  if (/\bnotes?\b/i.test(input)) {
    const project = await getProjectFromNaturalNoteQuestion(input);
    const activeProject = project || (await getActiveProject(sessionKey));

    if (activeProject) {
      const notes = await listProjectNotes(activeProject._id);

      return NextResponse.json({
        message: `Notes for ${activeProject.name}: ${notes.length}`,
        activeProject: getProjectDisplay(activeProject),
        data: notes
      });
    }
  }

  if (/\bmeetings?\b/i.test(input)) {
    const project = await getProjectFromNaturalMeetingQuestion(input);
    const activeProject = project || (await getActiveProject(sessionKey));

    if (activeProject) {
      const meetings = await listProjectMeetings(activeProject._id);

      return NextResponse.json({
        message: `Meetings for ${activeProject.name}: ${meetings.length}`,
        activeProject: getProjectDisplay(activeProject),
        data: meetings
      });
    }
  }

  const naturalSearch = input.match(/^find\s+(.+)$/i) || input.match(/^what do i know about\s+(.+)$/i);
  const query = naturalSearch ? naturalSearch[1].trim() : input;
  const results = await searchGrouped(query);

  return NextResponse.json({
    message: `Found ${countGroupedResults(results)} result(s) for "${query}"`,
    data: results
  });
};

const handleCommand = async (sessionKey: string, input: string) => {
  const commandMatch = input.match(/^@([a-z-]+)(?:\s+([\s\S]*))?$/i);

  if (!commandMatch) {
    return handleNaturalLanguage(sessionKey, input);
  }

  const command = commandMatch[1].toLowerCase();
  const content = normalizeWhitespace(commandMatch[2] || '');

  switch (command) {
    case 'project':
    case 'switch':
      return handleProjectSelection(sessionKey, content);

    case 'current': {
      const activeProject = await getActiveProject(sessionKey);

      return NextResponse.json({
        message: activeProject
          ? `Current active project: ${activeProject.name}`
          : 'No active project selected',
        activeProject: getProjectDisplay(activeProject)
      });
    }

    case 'task':
      return handleProjectItemCommand(sessionKey, 'task', content);

    case 'note':
      return handleProjectItemCommand(sessionKey, 'note', content);

    case 'requirement':
      return handleProjectItemCommand(sessionKey, 'requirement', content);

    case 'credential':
      return handleProjectItemCommand(sessionKey, 'credential', content);

    case 'work':
    case 'work-done':
      return handleProjectItemCommand(sessionKey, 'work_done', content);

    case 'meeting':
      return handleProjectItemCommand(sessionKey, 'meeting', content);

    case 'summary': {
      const activeProject = await getActiveProject(sessionKey);

      if (!activeProject) {
        return askForProject();
      }

      const summary = await getProjectSummary(activeProject);

      return NextResponse.json({
        message: `Summary for ${activeProject.name}`,
        activeProject: getProjectDisplay(activeProject),
        data: summary
      });
    }

    case 'tasks':
      return handleProjectScopedList(sessionKey, 'tasks');

    case 'notes':
      return handleProjectScopedList(sessionKey, 'notes');

    case 'meetings':
      return handleProjectScopedList(sessionKey, 'meetings');

    case 'memory': {
      if (!content) {
        return NextResponse.json({ error: 'Memory content is required' }, { status: 400 });
      }

      const memory = await createStandaloneMemory(content);

      return NextResponse.json({
        message: 'Memory saved',
        data: memory
      });
    }

    case 'find': {
      if (!content) {
        return NextResponse.json({ error: 'Search query is required' }, { status: 400 });
      }

      const results = await searchGrouped(content);

      return NextResponse.json({
        message: `Found ${countGroupedResults(results)} result(s) for "${content}"`,
        data: results
      });
    }

    case 'projects': {
      const projects = await Project.find().sort({ updatedAt: -1 }).limit(RECENT_LIMIT).lean();

      return NextResponse.json({
        message: `Projects: ${projects.length}`,
        data: projects
      });
    }

    case 'memories': {
      const memories = await Memory.find().sort({ createdAt: -1 }).limit(RECENT_LIMIT).lean();

      return NextResponse.json({
        message: `Recent memories: ${memories.length}`,
        data: memories
      });
    }

    case 'delete-task':
      return handleDeleteTask(sessionKey, content);

    case 'delete-memory':
      return handleDeleteMemory(content);

    default:
      return NextResponse.json(
        { error: `Unsupported command: @${command}` },
        { status: 400 }
      );
  }
};

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

    const input = typeof body.input === 'string' ? body.input.trim() : '';

    if (!input) {
      return NextResponse.json({ error: 'input is required' }, { status: 400 });
    }

    await connectDB();

    const sessionKey = getSessionKey(request, body);

    return handleCommand(sessionKey, input);
  } catch (error) {
    const status = error instanceof Error && error.name === 'ValidationError' ? 400 : 500;

    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status }
    );
  }
}
