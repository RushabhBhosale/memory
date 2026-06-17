import mongoose, { Schema, type Document, type Model } from 'mongoose';

export type ProjectTaskStatus = 'pending' | 'completed';

export type ProjectTaskDocument = Document & {
  projectId: mongoose.Types.ObjectId;
  title: string;
  description: string;
  status: ProjectTaskStatus;
  tags: string[];
  source: string;
  createdAt: Date;
  updatedAt: Date;
};

const projectTaskSchema = new Schema<ProjectTaskDocument>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: [true, 'Project id is required'],
      index: true
    },
    title: {
      type: String,
      required: [true, 'Task title is required'],
      trim: true
    },
    description: {
      type: String,
      default: '',
      trim: true
    },
    status: {
      type: String,
      enum: ['pending', 'completed'],
      default: 'pending',
      trim: true,
      index: true
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

projectTaskSchema.index({ title: 1, description: 1 });

const ProjectTask =
  (mongoose.models.ProjectTask as Model<ProjectTaskDocument> | undefined) ??
  mongoose.model<ProjectTaskDocument>('ProjectTask', projectTaskSchema);

export default ProjectTask;
