import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Short lived cache of YouTube Data API responses to save quota.
 * Entries expire automatically (well within the 30 day limit that the
 * YouTube API Services Developer Policies place on stored API data).
 */
const youtubeCacheSchema = new Schema({
  key: { type: String, required: true, unique: true },
  value: { type: Schema.Types.Mixed, required: true },
  expiresAt: { type: Date, required: true },
});

youtubeCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('YoutubeCache', youtubeCacheSchema);
