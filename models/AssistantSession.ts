import mongoose, { Schema, type Document, type Model } from 'mongoose';

export type AssistantSessionDocument = Document & {
  sessionKey: string;
  activeProjectId?: mongoose.Types.ObjectId;
  lastItemId?: mongoose.Types.ObjectId;
  lastItemType?: 'memory' | 'task' | 'note' | 'meeting';
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
