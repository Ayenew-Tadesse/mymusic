import mongoose from 'mongoose';

const { Schema } = mongoose;

export const HISTORY_RETENTION_DAYS = 365;

/** A play, used for "recently played" and for admin analytics. */
const listeningEventSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  kind: { type: String, enum: ['catalog', 'youtube'], required: true },
  track: { type: Schema.Types.ObjectId, ref: 'Track' },
  videoId: { type: String, match: /^[A-Za-z0-9_-]{11}$/ },
  playedAt: { type: Date, default: Date.now },
  msPlayed: { type: Number, min: 0, default: 0 },
  completed: { type: Boolean, default: false },
  offline: { type: Boolean, default: false },
  context: {
    type: { type: String, enum: ['playlist', 'album', 'artist', 'search', 'favorites', 'history', 'other'] },
    id: String,
  },
  platform: { type: String, enum: ['ios', 'android', 'web', 'other'], default: 'other' },
});

listeningEventSchema.index({ user: 1, playedAt: -1 });
listeningEventSchema.index({ track: 1, playedAt: -1 });
listeningEventSchema.index({ playedAt: 1 }, { expireAfterSeconds: HISTORY_RETENTION_DAYS * 86400 });

export default mongoose.model('ListeningEvent', listeningEventSchema);
