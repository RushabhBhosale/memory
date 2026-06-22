import mongoose, { Schema, type Document, type Model } from 'mongoose';

export type DesktopActivityDocument = Document & {
  date: string;
  title: string;
  summary: string;
  codingMinutes: number;
  productiveMinutes: number;
  idleMinutes: number;
  productivityScore: number;
  projectBreakdown: Array<{
    projectName: string;
    durationMinutes: number;
  }>;
  appBreakdown: Array<{
    appName: string;
    durationMinutes: number;
  }>;
  source: string;
  deviceLabel?: string;
  capturedAt: Date;
  syncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

const desktopActivitySchema = new Schema<DesktopActivityDocument>(
  {
    date: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    summary: {
      type: String,
      default: '',
      trim: true,
    },
    codingMinutes: {
      type: Number,
      default: 0,
      min: 0,
    },
    productiveMinutes: {
      type: Number,
      default: 0,
      min: 0,
    },
    idleMinutes: {
      type: Number,
      default: 0,
      min: 0,
    },
    productivityScore: {
      type: Number,
      default: 0,
    },
    projectBreakdown: {
      type: [
        {
          _id: false,
          projectName: { type: String, required: true, trim: true },
          durationMinutes: { type: Number, required: true, min: 0 },
        },
      ],
      default: [],
    },
    appBreakdown: {
      type: [
        {
          _id: false,
          appName: { type: String, required: true, trim: true },
          durationMinutes: { type: Number, required: true, min: 0 },
        },
      ],
      default: [],
    },
    source: {
      type: String,
      default: 'desktop-companion',
      trim: true,
      index: true,
    },
    deviceLabel: {
      type: String,
      default: '',
      trim: true,
    },
    capturedAt: {
      type: Date,
      default: Date.now,
    },
    syncedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

desktopActivitySchema.index({ date: -1, source: 1 }, { unique: true });
desktopActivitySchema.index({ createdAt: -1 });

const DesktopActivity =
  (mongoose.models.DesktopActivity as Model<DesktopActivityDocument> | undefined) ??
  mongoose.model<DesktopActivityDocument>('DesktopActivity', desktopActivitySchema);

export default DesktopActivity;
