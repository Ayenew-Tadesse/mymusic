import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Permission for one device to keep one licensed track offline until
 * `expiresAt`. Devices renew licences while online; revoked or expired
 * licences make the app delete the encrypted file.
 */
const offlineLicenseSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    track: { type: Schema.Types.ObjectId, ref: 'Track', required: true },
    deviceId: { type: String, required: true, maxlength: 128 },
    expiresAt: { type: Date, required: true },
    revokedAt: Date,
    revokeReason: String,
  },
  { timestamps: true },
);

offlineLicenseSchema.index({ user: 1, deviceId: 1, track: 1 }, { unique: true });
offlineLicenseSchema.index({ track: 1 });

export default mongoose.model('OfflineLicense', offlineLicenseSchema);
