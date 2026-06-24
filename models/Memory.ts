import mongoose, { Schema, type Document, type Model } from 'mongoose';

export type MemoryDocument = Document & {
  title: string;
  content: string;
  category: string;
  tags: string[];
  source: string;
  sourceTitle?: string;
  sourceUrl?: string;
  capturedAt?: Date;
  kind: 'note' | 'task' | 'work_done' | 'requirement' | 'credential';
  projectId?: mongoose.Types.ObjectId;
  reminderAt?: Date;
  notificationEnabled: boolean;
  reminderType?: 'time' | 'location';
  triggerType?: 'enter' | 'exit';
  placeId?: string;
  placeName?: string;
  latitude?: number;
  longitude?: number;
  radiusMeters?: number;
  status?: 'pending' | 'triggered' | 'completed';
  triggeredAt?: Date;
  importance: number;
  embedding?: number[] | null;
  createdAt: Date;
  updatedAt: Date;
};

const memorySchema = new Schema<MemoryDocument>(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true
    },
    content: {
      type: String,
      default: '',
      trim: true
    },
    category: {
      type: String,
      default: 'general',
      trim: true
    },
    tags: {
      type: [String],
      default: []
    },
    source: {
      type: String,
      default: 'manual',
      trim: true
    },
    sourceTitle: {
      type: String,
      default: '',
      trim: true
    },
    sourceUrl: {
      type: String,
      default: '',
      trim: true
    },
    capturedAt: {
      type: Date,
      default: undefined
    },
    kind: {
      type: String,
      enum: ['note', 'task', 'work_done', 'requirement', 'credential'],
      default: 'note',
      trim: true
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      default: undefined
    },
    reminderAt: {
      type: Date,
      default: undefined,
      index: true
    },
    notificationEnabled: {
      type: Boolean,
      default: false
    },
    reminderType: {
      type: String,
      enum: ['time', 'location'],
      default: undefined,
      index: true
    },
    triggerType: {
      type: String,
      enum: ['enter', 'exit'],
      default: undefined
    },
    placeId: {
      type: String,
      default: '',
      trim: true,
      index: true
    },
    placeName: {
      type: String,
      default: '',
      trim: true
    },
    latitude: {
      type: Number,
      default: undefined
    },
    longitude: {
      type: Number,
      default: undefined
    },
    radiusMeters: {
      type: Number,
      min: 50,
      default: undefined
    },
    status: {
      type: String,
      enum: ['pending', 'triggered', 'completed'],
      default: undefined,
      index: true
    },
    triggeredAt: {
      type: Date,
      default: undefined
    },
    importance: {
      type: Number,
      min: 1,
      max: 5,
      default: 3,
      index: true
    },
    embedding: {
      type: [Number],
      default: null
    }
  },
  {
    timestamps: true
  }
);

memorySchema.index({ title: 1 });
memorySchema.index({ tags: 1 });
memorySchema.index({ projectId: 1 });
memorySchema.index({ createdAt: -1 });
memorySchema.index({ title: 'text', content: 'text', tags: 'text' });

const Memory =
  (mongoose.models.Memory as Model<MemoryDocument> | undefined) ??
  mongoose.model<MemoryDocument>('Memory', memorySchema);

export default Memory;
