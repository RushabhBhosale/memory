import mongoose, { Schema, type Document, type Model } from 'mongoose';

export type AssistantSessionDocument = Document & {
  sessionKey: string;
  activeProjectId?: mongoose.Types.ObjectId;
  lastItemId?: mongoose.Types.ObjectId;
  lastItemType?: 'memory' | 'task' | 'note' | 'meeting';
  lastSearchResults?: Array<{
    itemId: mongoose.Types.ObjectId;
    itemType: 'project' | 'task' | 'note' | 'meeting' | 'memory';
    title: string;
  }>;
  pendingTaskCompletionId?: mongoose.Types.ObjectId;
  pendingTaskCompletionTitle?: string;
  pendingReminderContent?: string;
  pendingReminderDate?: Date;
  createdAt: Date;
  updatedAt: Date;
};

const assistantSessionSchema = new Schema<AssistantSessionDocument>(
  {
    sessionKey: {
      type: String,
      required: [true, 'Session key is required'],
      trim: true,
      unique: true
    },
    activeProjectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      default: undefined
    },
    lastItemId: {
      type: Schema.Types.ObjectId,
      default: undefined
    },
    lastItemType: {
      type: String,
      enum: ['memory', 'task', 'note', 'meeting'],
      default: undefined
    },
    lastSearchResults: {
      type: [
        {
          itemId: {
            type: Schema.Types.ObjectId,
            required: true
          },
          itemType: {
            type: String,
            enum: ['project', 'task', 'note', 'meeting', 'memory'],
            required: true
          },
          title: {
            type: String,
            default: '',
            trim: true
          }
        }
      ],
      default: undefined
    },
    pendingTaskCompletionId: {
      type: Schema.Types.ObjectId,
      default: undefined
    },
    pendingTaskCompletionTitle: {
      type: String,
      default: undefined,
      trim: true
    },
    pendingReminderContent: {
      type: String,
      default: undefined,
      trim: true
    },
    pendingReminderDate: {
      type: Date,
      default: undefined
    }
  },
  {
    timestamps: true
  }
);

const AssistantSession =
  (mongoose.models.AssistantSession as Model<AssistantSessionDocument> | undefined) ??
  mongoose.model<AssistantSessionDocument>('AssistantSession', assistantSessionSchema);

export default AssistantSession;
