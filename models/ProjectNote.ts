import mongoose, { Schema, type Document, type Model } from 'mongoose';

export type ProjectNoteDocument = Document & {
  projectId: mongoose.Types.ObjectId;
  title: string;
  content: string;
  kind: 'note' | 'requirement' | 'credential' | 'work_done';
  tags: string[];
  source: string;
  createdAt: Date;
  updatedAt: Date;
};

const projectNoteSchema = new Schema<ProjectNoteDocument>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: [true, 'Project id is required'],
      index: true
    },
    title: {
      type: String,
      required: [true, 'Note title is required'],
      trim: true
    },
    content: {
      type: String,
      required: [true, 'Note content is required'],
      trim: true
    },
    kind: {
      type: String,
      enum: ['note', 'requirement', 'credential', 'work_done'],
      default: 'note',
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

projectNoteSchema.index({ title: 1, content: 1 });

const ProjectNote =
  (mongoose.models.ProjectNote as Model<ProjectNoteDocument> | undefined) ??
  mongoose.model<ProjectNoteDocument>('ProjectNote', projectNoteSchema);

export default ProjectNote;
