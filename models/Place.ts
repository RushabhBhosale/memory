import mongoose, { Schema, type Document, type Model } from 'mongoose';

export type PlaceDocument = Document & {
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  type: 'home' | 'office' | 'gym' | 'mall' | 'custom';
  createdAt: Date;
  updatedAt: Date;
};

const placeSchema = new Schema<PlaceDocument>(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true
    },
    latitude: {
      type: Number,
      required: [true, 'Latitude is required'],
      min: -90,
      max: 90
    },
    longitude: {
      type: Number,
      required: [true, 'Longitude is required'],
      min: -180,
      max: 180
    },
    radiusMeters: {
      type: Number,
      min: 50,
      default: 50
    },
    type: {
      type: String,
      enum: ['home', 'office', 'gym', 'mall', 'custom'],
      default: 'custom',
      index: true
    }
  },
  {
    timestamps: true
  }
);

placeSchema.index({ name: 1 });
placeSchema.index({ updatedAt: -1 });

const Place =
  (mongoose.models.Place as Model<PlaceDocument> | undefined) ??
  mongoose.model<PlaceDocument>('Place', placeSchema);

export default Place;
