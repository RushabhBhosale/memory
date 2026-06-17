import mongoose, { Schema, type Document, type Model } from 'mongoose';

export type MemoryDocument = Document & {
  title: string;
  content: string;
  category: string;
  tags: string[];
  source: string;
  kind: 'note' | 'task' | 'work_done' | 'requirement' | 'credential';
  projectId?: mongoose.Types.ObjectId;
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
    }
  },
  {
    timestamps: true
  }
);

const Memory =
  (mongoose.models.Memory as Model<MemoryDocument> | undefined) ??
  mongoose.model<MemoryDocument>('Memory', memorySchema);

export default Memory;
