import mongoose from 'mongoose';

const recentlyWatchedSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    movieId: { type: String, required: true },
    movieData: {
      title: String,
      posterUrl: String,
      genres: [String],
    },
    watchedAt: { type: Date, default: Date.now },
  },
  { autoIndex: false }
);

export const UserRecentlyWatched = mongoose.model('UserRecentlyWatched', recentlyWatchedSchema);