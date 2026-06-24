import mongoose, { Schema, type Document, type Model } from 'mongoose';

export type PlaceTimelineDocument = Document & {
  placeId: string;
  placeName: string;
  eventType: 'enter' | 'exit';
  latitude: number;
  longitude: number;
  timestamp: Date;
  durationMinutes?: number;
  createdAt: Date;
  updatedAt: Date;
};

const placeTimelineSchema = new Schema<PlaceTimelineDocument>(
  {
    placeId: {
      type: String,
      required: [true, 'Place id is required'],
      trim: true,
      index: true
    },
    placeName: {
      type: String,
      required: [true, 'Place name is required'],
      trim: true
    },
    eventType: {
      type: String,
      enum: ['enter', 'exit'],
      required: [true, 'Event type is required'],
      index: true
    },
    latitude: {
      type: Number,
      required: [true, 'Latitude is required']
    },
    longitude: {
      type: Number,
      required: [true, 'Longitude is required']
    },
    timestamp: {
      type: Date,
      required: [true, 'Timestamp is required'],
      index: true
    },
    durationMinutes: {
      type: Number,
      min: 0,
      default: undefined
    }
  },
  {
    timestamps: true
  }
);

placeTimelineSchema.index({ placeId: 1, timestamp: -1 });

const PlaceTimeline =
  (mongoose.models.PlaceTimeline as Model<PlaceTimelineDocument> | undefined) ??
  mongoose.model<PlaceTimelineDocument>('PlaceTimeline', placeTimelineSchema);

export default PlaceTimeline;
