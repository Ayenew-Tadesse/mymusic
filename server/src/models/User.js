import mongoose from 'mongoose';

const { Schema } = mongoose;

export const PLANS = ['free', 'premium', 'family'];
export const ACTIVE_SUB_STATUSES = ['active', 'trialing', 'past_due'];

const subscriptionSchema = new Schema(
  {
    plan: { type: String, enum: PLANS, default: 'free' },
    // Mirrors Stripe's subscription status ('active', 'trialing', 'past_due', 'canceled', ...).
    status: { type: String, default: 'none' },
    stripeCustomerId: { type: String, index: { unique: true, sparse: true } },
    stripeSubscriptionId: String,
    stripePriceId: String,
    currentPeriodEnd: Date,
    cancelAtPeriodEnd: { type: Boolean, default: false },
  },
  { _id: false },
);

const offlineDeviceSchema = new Schema(
  {
    deviceId: { type: String, required: true },
    name: { type: String, maxlength: 80 },
    registeredAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    // Optional because Apple users may hide their email and only share it on first sign-in.
    email: { type: String, lowercase: true, trim: true, maxlength: 254 },
    emailVerified: { type: Boolean, default: false },
    passwordHash: { type: String, select: false },
    // Denormalised so profiles can say whether a password exists without loading the hash.
    hasPassword: { type: Boolean, default: false },
    displayName: { type: String, trim: true, maxlength: 60, required: true },
    avatarUrl: { type: String, maxlength: 2048 },
    googleId: { type: String },
    appleId: { type: String },
    // Encrypted Sign in with Apple refresh token, kept only to revoke it on account deletion.
    appleRefreshToken: { type: String, select: false },
    role: { type: String, enum: ['user', 'admin'], default: 'user', index: true },
    status: { type: String, enum: ['active', 'suspended'], default: 'active', index: true },
    // Incrementing this invalidates every outstanding access and refresh token for the user.
    tokenVersion: { type: Number, default: 0 },
    subscription: { type: subscriptionSchema, default: () => ({}) },
    offlineDevices: { type: [offlineDeviceSchema], default: [] },
    preferences: {
      theme: { type: String, enum: ['system', 'dark', 'light'], default: 'system' },
      allowExplicit: { type: Boolean, default: true },
    },
    country: { type: String, uppercase: true, minlength: 2, maxlength: 2 },
    lastLoginAt: Date,
  },
  { timestamps: true },
);

userSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } } });
userSchema.index({ googleId: 1 }, { unique: true, partialFilterExpression: { googleId: { $type: 'string' } } });
userSchema.index({ appleId: 1 }, { unique: true, partialFilterExpression: { appleId: { $type: 'string' } } });
userSchema.index({ createdAt: -1 });
userSchema.index({ displayName: 'text', email: 'text' });

userSchema.pre('save', function syncHasPassword(next) {
  if (this.isModified('passwordHash')) this.hasPassword = Boolean(this.passwordHash);
  next();
});

/** Whether the user currently holds a paid plan. */
userSchema.methods.isPremium = function isPremium() {
  const sub = this.subscription || {};
  if (sub.plan === 'free' || !ACTIVE_SUB_STATUSES.includes(sub.status)) return false;
  return !sub.currentPeriodEnd || sub.currentPeriodEnd.getTime() > Date.now();
};

/** Safe public projection. Never return the raw document to clients. */
userSchema.methods.toProfile = function toProfile() {
  return {
    id: this._id.toString(),
    email: this.email ?? null,
    emailVerified: this.emailVerified,
    displayName: this.displayName,
    avatarUrl: this.avatarUrl ?? null,
    role: this.role,
    providers: {
      password: this.hasPassword,
      google: Boolean(this.googleId),
      apple: Boolean(this.appleId),
    },
    subscription: {
      plan: this.isPremium() ? this.subscription.plan : 'free',
      status: this.subscription?.status ?? 'none',
      currentPeriodEnd: this.subscription?.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: this.subscription?.cancelAtPeriodEnd ?? false,
    },
    preferences: this.preferences,
    createdAt: this.createdAt,
  };
};

export default mongoose.model('User', userSchema);
