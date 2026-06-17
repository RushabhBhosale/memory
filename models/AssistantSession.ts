import mongoose, { Schema, type Document, type Model } from 'mongoose';

export type AssistantSessionDocument = Document & {
  sessionKey: string;
  activeProjectId?: mongoose.Types.ObjectId;
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
