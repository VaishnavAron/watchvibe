import { movieIndex } from './movieData.js';
import { User } from '../models/userSchema.js';

// Build a co‑occurrence matrix from watched movies (in-memory, recalculated periodically)
// For now, we compute on-the-fly from all users' watchedMovies.

export async function getCollaborativeRecommendations(userId, userWatchedMovieIds, limit = 6) {
  const allUsers = await User.find({}, 'watchedMovies');
  const likedMovieIds = userWatchedMovieIds; // movies the current user liked/clicked

  if (!likedMovieIds.length) return [];

  // Count how many users liked each movie
  const movieLikes = new Map(); // movieId -> number of users who liked it
  for (const user of allUsers) {
    const likedByUser = (user.watchedMovies || [])
      .filter(w => w.liked === true || w.rating >= 4) // treat rating ≥4 as like
      .map(w => w.movieKey);
    for (const movieId of likedByUser) {
      movieLikes.set(movieId, (movieLikes.get(movieId) || 0) + 1);
    }
  }

  // For each movie the user liked, find other movies liked by the same users
  const candidateScores = new Map();
  for (const likedId of likedMovieIds) {
    for (const user of allUsers) {
      const likedByUser = (user.watchedMovies || [])
        .filter(w => w.liked === true || w.rating >= 4)
        .map(w => w.movieKey);
      if (likedByUser.includes(likedId)) {
        for (const otherId of likedByUser) {
          if (otherId === likedId) continue;
          const score = 1 / (1 + Math.log(movieLikes.get(otherId) || 1));
          candidateScores.set(otherId, (candidateScores.get(otherId) || 0) + score);
        }
      }
    }
  }

  const sorted = [...candidateScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => movieIndex.get(id))
    .filter(Boolean);

  return sorted;
}