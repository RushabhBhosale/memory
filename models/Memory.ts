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
  attachment?: {
    kind: 'screenshot';
    name: string;
    mimeType: string;
    dataUrl: string;
    size: number;
  };
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
    attachment: {
      type: new Schema(
        {
          kind: {
            type: String,
            enum: ['screenshot'],
            required: true
          },
          name: {
            type: String,
            default: ''
          },
          mimeType: {
            type: String,
            default: 'application/octet-stream'
          },
          dataUrl: {
            type: String,
            required: true
          },
          size: {
            type: Number,
            required: true
          }
        },
        { _id: false }
      ),
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
