import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * One row per issued refresh token. Tokens rotate on every use; all tokens
 * descended from one login share a `family`. Presenting an already rotated
 * token is treated as theft and revokes the whole family.
 */
const refreshTokenSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true }, // sha256 of the opaque token
    family: { type: String, required: true, index: true },
    deviceName: { type: String, maxlength: 120 },
    ip: String,
    expiresAt: { type: Date, required: true },
    revokedAt: Date,
    replacedAt: Date,
  },
  { timestamps: true },
);

// MongoDB removes expired sessions automatically.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('RefreshToken', refreshTokenSchema);
