import mongoose from 'mongoose';

const { Schema } = mongoose;

/** Append-only record of administrative actions. */
const auditLogSchema = new Schema({
  actor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  action: { type: String, required: true },
  targetType: String,
  targetId: String,
  meta: Schema.Types.Mixed,
  ip: String,
  at: { type: Date, default: Date.now },
});

auditLogSchema.index({ at: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1, at: -1 });

export default mongoose.model('AuditLog', auditLogSchema);
