import mongoose, { Schema, type Document, type Model } from 'mongoose';

export type ProjectDocument = Document & {
  name: string;
  description: string;
  status: 'active' | 'paused' | 'completed' | 'archived';
  tags: string[];
  source: string;
  createdAt: Date;
  updatedAt: Date;
};

const projectSchema = new Schema<ProjectDocument>(
  {
    name: {
      type: String,
      required: [true, 'Project name is required'],
      trim: true
    },
    description: {
      type: String,
      default: '',
      trim: true
    },
    status: {
      type: String,
      enum: ['active', 'paused', 'completed', 'archived'],
      default: 'active',
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
    }
  },
  {
    timestamps: true
  }
);

projectSchema.index({ name: 1 });

const Project =
  (mongoose.models.Project as Model<ProjectDocument> | undefined) ??
  mongoose.model<ProjectDocument>('Project', projectSchema);

export default Project;
