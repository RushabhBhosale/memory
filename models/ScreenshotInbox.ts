import mongoose, { Schema, type Document, type Model } from 'mongoose';

export type ScreenshotInboxDocument = Document & {
  imageUri: string;
  capturedAt: Date;
  processed: boolean;
  dismissed: boolean;
  extractedText: string;
  generatedTitle: string;
  generatedTags: string[];
  generatedCategory: string;
  memoryId?: mongoose.Types.ObjectId;
  source: string;
  createdAt: Date;
  updatedAt: Date;
};

const screenshotInboxSchema = new Schema<ScreenshotInboxDocument>(
  {
    imageUri: {
      type: String,
      required: [true, 'Image URI is required'],
      trim: true,
      unique: true
    },
    capturedAt: {
      type: Date,
      required: true,
      index: true
    },
    processed: {
      type: Boolean,
      default: false,
      index: true
    },
    dismissed: {
      type: Boolean,
      default: false,
      index: true
    },
    extractedText: {
      type: String,
      default: '',
      trim: true
    },
    generatedTitle: {
      type: String,
      default: '',
      trim: true
    },
    generatedTags: {
      type: [String],
      default: []
    },
    generatedCategory: {
      type: String,
      default: 'general',
      trim: true
    },
    memoryId: {
      type: Schema.Types.ObjectId,
      ref: 'Memory',
      default: undefined
    },
    source: {
      type: String,
      default: 'android',
      trim: true
    }
  },
  {
    timestamps: true
  }
);

screenshotInboxSchema.index({ capturedAt: -1 });
screenshotInboxSchema.index({ processed: 1, dismissed: 1, capturedAt: -1 });
screenshotInboxSchema.index({
  extractedText: 'text',
  generatedCategory: 'text',
  generatedTags: 'text',
  generatedTitle: 'text'
});

const ScreenshotInbox =
  (mongoose.models.ScreenshotInbox as Model<ScreenshotInboxDocument> | undefined) ??
  mongoose.model<ScreenshotInboxDocument>('ScreenshotInbox', screenshotInboxSchema);

export default ScreenshotInbox;
