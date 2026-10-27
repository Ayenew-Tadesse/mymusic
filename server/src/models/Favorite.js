import mongoose from 'mongoose';

const { Schema } = mongoose;

/** A liked song: a catalog track or a YouTube video id (metadata fetched on read). */
const favoriteSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    kind: { type: String, enum: ['catalog', 'youtube'], required: true },
    track: { type: Schema.Types.ObjectId, ref: 'Track' },
    videoId: { type: String, match: /^[A-Za-z0-9_-]{11}$/ },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

favoriteSchema.index({ user: 1, createdAt: -1 });
favoriteSchema.index(
  { user: 1, track: 1 },
  { unique: true, partialFilterExpression: { track: { $type: 'objectId' } } },
);
favoriteSchema.index(
  { user: 1, videoId: 1 },
  { unique: true, partialFilterExpression: { videoId: { $type: 'string' } } },
);

export default mongoose.model('Favorite', favoriteSchema);
