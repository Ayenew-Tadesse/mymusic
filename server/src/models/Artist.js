import mongoose from 'mongoose';

const { Schema } = mongoose;

const artistSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    bio: { type: String, maxlength: 5000 },
    imageUrl: { type: String, maxlength: 2048 },
    genres: { type: [String], default: [] },
    verified: { type: Boolean, default: false },
  },
  { timestamps: true },
);

artistSchema.index({ name: 'text' });
artistSchema.index({ name: 1 });

export default mongoose.model('Artist', artistSchema);
