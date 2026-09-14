import mongoose from 'mongoose';

const userLikeSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    movieId: { type: String, required: true },
    action: { type: String, enum: ['like', 'dislike'], required: true },
    updatedAt: { type: Date, default: Date.now },
  },
  { autoIndex: false }
);

export const UserLike = mongoose.model('UserLike', userLikeSchema);