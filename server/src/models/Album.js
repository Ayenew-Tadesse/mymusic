import mongoose from 'mongoose';

const { Schema } = mongoose;

const albumSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    artist: { type: Schema.Types.ObjectId, ref: 'Artist', required: true, index: true },
    artworkUrl: { type: String, maxlength: 2048 },
    releaseDate: Date,
    label: { type: String, maxlength: 200 },
    upc: { type: String, maxlength: 20 },
  },
  { timestamps: true },
);

albumSchema.index({ title: 'text' });

export default mongoose.model('Album', albumSchema);
