import mongoose, { Schema, type Document, type Model } from 'mongoose';

export type PlaceTimelineDocument = Document & {
  placeId: string;
  placeName: string;
  eventType: 'enter' | 'exit' | 'dwell' | 'visit';
  latitude: number;
  longitude: number;
  timestamp: Date;
  durationMinutes?: number;
  activity?: 'walking' | 'running' | 'cycling' | 'driving' | 'still' | 'unknown';
  address?: string;
  locality?: string;
  city?: string;
  country?: string;
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
      enum: ['enter', 'exit', 'dwell', 'visit'],
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
    },
    activity: {
      type: String,
      enum: ['walking', 'running', 'cycling', 'driving', 'still', 'unknown'],
      default: undefined
    },
    address: {
      type: String,
      trim: true,
      default: undefined
    },
    locality: {
      type: String,
      trim: true,
      default: undefined
    },
    city: {
      type: String,
      trim: true,
      default: undefined
    },
    country: {
      type: String,
      trim: true,
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
