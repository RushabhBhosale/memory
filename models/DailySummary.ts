import mongoose, { Schema, type Document, type Model } from 'mongoose';

export type DailySummaryTopic = {
  title: string;
  project: string;
  summary: string;
  status: string;
  tags: string[];
};

export type DailySummaryTask = {
  task: string;
  project: string;
  status: string;
};

export type DailySummaryDocument = Document & {
  type: 'daily_summary';
  date: string;
  title: string;
  summary: string;
  bodyMarkdown: string;
  topics: DailySummaryTopic[];
  keyQuestions: string[];
  tasks: DailySummaryTask[];
  decisions: string[];
  projects: string[];
  tags: string[];
  source: string;
  createdAt: Date;
  updatedAt: Date;
};

const topicSchema = new Schema<DailySummaryTopic>(
  {
    title: { type: String, default: '', trim: true },
    project: { type: String, default: '', trim: true },
    summary: { type: String, default: '', trim: true },
    status: { type: String, default: '', trim: true },
    tags: { type: [String], default: [] }
  },
  { _id: false }
);

const taskSchema = new Schema<DailySummaryTask>(
  {
    task: { type: String, default: '', trim: true },
    project: { type: String, default: '', trim: true },
    status: { type: String, default: '', trim: true }
  },
  { _id: false }
);

const dailySummarySchema = new Schema<DailySummaryDocument>(
  {
    type: {
      type: String,
      enum: ['daily_summary'],
      default: 'daily_summary',
      immutable: true,
      index: true
    },
    date: {
      type: String,
      required: [true, 'Date is required'],
      match: [/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD'],
      trim: true,
      unique: true,
      index: true
    },
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true
    },
    summary: {
      type: String,
      default: '',
      trim: true
    },
    bodyMarkdown: {
      type: String,
      default: '',
      trim: true
    },
    topics: {
      type: [topicSchema],
      default: []
    },
    keyQuestions: {
      type: [String],
      default: []
    },
    tasks: {
      type: [taskSchema],
      default: []
    },
    decisions: {
      type: [String],
      default: []
    },
    projects: {
      type: [String],
      default: [],
      index: true
    },
    tags: {
      type: [String],
      default: [],
      index: true
    },
    source: {
      type: String,
      default: 'chatgpt_scheduled_task',
      trim: true,
      index: true
    }
  },
  {
    timestamps: true
  }
);

dailySummarySchema.index({ date: -1 });
dailySummarySchema.index({
  title: 'text',
  summary: 'text',
  bodyMarkdown: 'text',
  'topics.title': 'text',
  'topics.summary': 'text',
  projects: 'text',
  tags: 'text',
  keyQuestions: 'text',
  'tasks.task': 'text',
  decisions: 'text'
});

const DailySummary =
  (mongoose.models.DailySummary as Model<DailySummaryDocument> | undefined) ??
  mongoose.model<DailySummaryDocument>('DailySummary', dailySummarySchema);

export default DailySummary;
