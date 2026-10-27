import mongoose from 'mongoose';

const { Schema } = mongoose;

export const LICENSE_TYPES = ['owned', 'licensed', 'creative_commons', 'public_domain'];

/**
 * Rights metadata. A track can only be streamed or downloaded while its
 * licence is valid for the listener's territory. Admins must record where the
 * rights come from before a track can be published.
 */
const rightsSchema = new Schema(
  {
    licenseType: { type: String, enum: LICENSE_TYPES, required: true },
    licensor: { type: String, required: true, maxlength: 200 },
    licenseReference: { type: String, maxlength: 200 }, // contract id / CC licence URL
    attribution: { type: String, maxlength: 500 }, // shown in the player when required
    territories: { type: [String], default: ['WW'] }, // ISO 3166-1 alpha-2, 'WW' = worldwide
    streamAllowed: { type: Boolean, default: true },
    offlineAllowed: { type: Boolean, default: false },
    validFrom: { type: Date, default: Date.now },
    validUntil: Date,
  },
  { _id: false },
);

const trackSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    artist: { type: Schema.Types.ObjectId, ref: 'Artist', required: true, index: true },
    album: { type: Schema.Types.ObjectId, ref: 'Album', index: true },
    trackNumber: Number,
    durationSec: { type: Number, required: true, min: 1 },
    genres: { type: [String], default: [], index: true },
    explicit: { type: Boolean, default: false },
    isrc: { type: String, maxlength: 15 },
    artworkUrl: { type: String, maxlength: 2048 }, // falls back to the album artwork
    // Object storage key; never exposed directly, clients get short lived signed URLs.
    audioKey: { type: String, required: true, select: false },
    audioMimeType: { type: String, default: 'audio/mpeg' },
    fileSizeBytes: Number,
    rights: { type: rightsSchema, required: true },
    status: { type: String, enum: ['draft', 'published', 'takedown'], default: 'draft', index: true },
    // Content available to free users; everything else needs a paid plan.
    freeTier: { type: Boolean, default: true },
    playCount: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

trackSchema.index({ title: 'text' });
trackSchema.index({ status: 1, createdAt: -1 });
trackSchema.index({ status: 1, playCount: -1 });

/** True if the rights currently allow `use` ('stream' | 'offline') in `country`. */
trackSchema.methods.isAvailable = function isAvailable(use, country, now = new Date()) {
  if (this.status !== 'published') return false;
  const r = this.rights;
  if (!r) return false;
  if (use === 'stream' && !r.streamAllowed) return false;
  if (use === 'offline' && !r.offlineAllowed) return false;
  if (r.validFrom && r.validFrom > now) return false;
  if (r.validUntil && r.validUntil <= now) return false;
  const territories = r.territories?.length ? r.territories : ['WW'];
  if (territories.includes('WW')) return true;
  return Boolean(country) && territories.includes(country.toUpperCase());
};

export default mongoose.model('Track', trackSchema);
