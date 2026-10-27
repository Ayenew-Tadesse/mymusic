import mongoose from 'mongoose';
import crypto from 'node:crypto';

const { Schema } = mongoose;

export const MAX_PLAYLIST_ITEMS = 1000;

/**
 * A playlist entry points either at a licensed catalog track or at a public
 * YouTube video. For YouTube only the video id is stored: titles, thumbnails
 * and durations are fetched fresh from the YouTube Data API on read, as the
 * YouTube API Services policies require for stored API data.
 */
const itemSchema = new Schema(
  {
    kind: { type: String, enum: ['catalog', 'youtube'], required: true },
    track: { type: Schema.Types.ObjectId, ref: 'Track' },
    videoId: { type: String, match: /^[A-Za-z0-9_-]{11}$/ },
    addedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

itemSchema.pre('validate', function check(next) {
  if (this.kind === 'catalog' && !this.track) return next(new Error('catalog items need a track'));
  if (this.kind === 'youtube' && !this.videoId) return next(new Error('youtube items need a videoId'));
  next();
});

const playlistSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 300, default: '' },
    coverUrl: { type: String, maxlength: 2048 },
    visibility: { type: String, enum: ['private', 'unlisted', 'public'], default: 'private', index: true },
    // Random slug used in share links; rotating it revokes old links.
    shareId: { type: String, unique: true, default: () => crypto.randomBytes(9).toString('base64url') },
    collaborators: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    items: {
      type: [itemSchema],
      default: [],
      validate: [(v) => v.length <= MAX_PLAYLIST_ITEMS, `A playlist holds at most ${MAX_PLAYLIST_ITEMS} items`],
    },
    // Editorial playlists are curated by admins and shown on the home screen.
    isEditorial: { type: Boolean, default: false, index: true },
    followers: [{ type: Schema.Types.ObjectId, ref: 'User', index: true }],
    // Admin moderation for public playlists (e.g. abusive names / covers).
    hidden: { type: Boolean, default: false },
  },
  { timestamps: true },
);

playlistSchema.index({ name: 'text', description: 'text' });
playlistSchema.index({ collaborators: 1 });

playlistSchema.methods.canView = function canView(userId) {
  if (this.hidden && !this.isOwnedBy(userId)) return false;
  if (this.visibility !== 'private') return true;
  return this.canEdit(userId);
};

// Works whether `owner` / `collaborators` hold ids or populated documents.
const idOf = (ref) => (ref?._id ?? ref)?.toString();

playlistSchema.methods.isOwnedBy = function isOwnedBy(userId) {
  return Boolean(userId) && idOf(this.owner) === idOf(userId);
};

playlistSchema.methods.canEdit = function canEdit(userId) {
  if (!userId) return false;
  return this.isOwnedBy(userId) || this.collaborators.some((c) => idOf(c) === idOf(userId));
};

export default mongoose.model('Playlist', playlistSchema);
