import mongoose from 'mongoose';

/** Stripe event ids already processed, so retried webhooks are idempotent. */
const webhookEventSchema = new mongoose.Schema({
  eventId: { type: String, required: true, unique: true },
  type: String,
  processedAt: { type: Date, default: Date.now },
});

webhookEventSchema.index({ processedAt: 1 }, { expireAfterSeconds: 60 * 86400 });

export default mongoose.model('WebhookEvent', webhookEventSchema);
