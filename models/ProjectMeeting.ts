import mongoose, { Schema, type Document, type Model } from 'mongoose';

export type ProjectMeetingDocument = Document & {
  projectId: mongoose.Types.ObjectId;
  title: string;
  details: string;
  tags: string[];
  source: string;
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
    }
  },
  {
    timestamps: true
  }
);

projectMeetingSchema.index({ title: 1, details: 1 });

const ProjectMeeting =
  (mongoose.models.ProjectMeeting as Model<ProjectMeetingDocument> | undefined) ??
  mongoose.model<ProjectMeetingDocument>('ProjectMeeting', projectMeetingSchema);

export default ProjectMeeting;
