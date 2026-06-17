import mongoose, { Schema, type Document, type Model } from 'mongoose';

export type ProjectMeetingDocument = Document & {
  projectId: mongoose.Types.ObjectId;
  title: string;
  details: string;
  tags: string[];
  source: string;
  importance: number;
  embedding?: number[] | null;
  createdAt: Date;
  updatedAt: Date;
};

const projectMeetingSchema = new Schema<ProjectMeetingDocument>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: [true, 'Project id is required'],
      index: true
    },
    title: {
      type: String,
      required: [true, 'Meeting title is required'],
      trim: true
    },
    details: {
      type: String,
      required: [true, 'Meeting details are required'],
      trim: true
    },
    tags: {
      type: [String],
      default: []
    },
    source: {
      type: String,
      default: 'assistant',
      trim: true
    },
    importance: {
      type: Number,
      min: 1,
      max: 5,
      default: 4,
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

projectMeetingSchema.index({ title: 1 });
projectMeetingSchema.index({ tags: 1 });
projectMeetingSchema.index({ createdAt: -1 });
projectMeetingSchema.index({ title: 'text', details: 'text', tags: 'text' });

const ProjectMeeting =
  (mongoose.models.ProjectMeeting as Model<ProjectMeetingDocument> | undefined) ??
  mongoose.model<ProjectMeetingDocument>('ProjectMeeting', projectMeetingSchema);

export default ProjectMeeting;
