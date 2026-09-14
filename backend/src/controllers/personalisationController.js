import { UserRecentlyWatched } from '../models/UserRecentlyWatched.js';
import { UserLike } from '../models/UserLike.js';
import { getMovieById } from '../services/movieData.js';

async function getMovieData(movieId) {
  const movie = await getMovieById(movieId);
  if (!movie) return null;
  return {
    title: movie.title,
    posterUrl: movie.posterUrl,
    genres: movie.genres || [],
  };
}

export async function addRecentlyWatched(req, res) {
  try {
    const userId = req.user._id.toString();
    const { movieId, timestamp } = req.body;
    if (!movieId) return res.status(400).json({ error: 'movieId required' });

    // Check if movie is disliked by this user
    const disliked = await UserLike.findOne({ userId, movieId, action: 'dislike' });
    if (disliked) {
      return res.status(400).json({ error: 'Cannot add disliked movie to recently watched' });
    }

    const movieData = await getMovieData(movieId);
    if (!movieData) return res.status(404).json({ error: 'Movie not found' });

    await UserRecentlyWatched.findOneAndUpdate(
      { userId, movieId },
      { movieData, watchedAt: timestamp || new Date() },
      { upsert: true, new: true }
    );

    const recent = await UserRecentlyWatched.find({ userId }).sort({ watchedAt: -1 }).limit(20).lean();
    res.json({ userId, items: recent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function getRecentlyWatched(req, res) {
    console.log('[API] getRecentlyWatched called, user:', req.user?._id);
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.user._id.toString();
    const recent = await UserRecentlyWatched.find({ userId })
      .sort({ watchedAt: -1 })
      .limit(20)
      .lean();
    res.json({ userId, items: recent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// src/controllers/personalisationController.js
export async function likeOrDislike(req, res) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.user._id.toString();
    const { movieId, action } = req.body;

    if (!movieId || !['like', 'dislike'].includes(action)) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    // Update like/dislike record
    await UserLike.findOneAndUpdate(
      { userId, movieId },
      { action, updatedAt: new Date() },
      { upsert: true }
    );

    // 🔥 If dislike, remove from recently watched
    if (action === 'dislike') {
      await UserRecentlyWatched.deleteOne({ userId, movieId });
    }

    // Return updated liked/disliked movies (as IDs – frontend will request full objects later)
    const likes = await UserLike.find({ userId, action: 'like' }).lean();
    const dislikes = await UserLike.find({ userId, action: 'dislike' }).lean();
    res.json({
      likedMovies: likes.map(l => l.movieId),
      dislikedMovies: dislikes.map(d => d.movieId),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}