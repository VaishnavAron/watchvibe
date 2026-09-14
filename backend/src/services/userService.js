import { getMovieById, getTrendingMovies, getRandomMovies } from './movieData.js';
import { palette } from '../config/constants.js';
import { User } from '../models/userSchema.js';
import { UserLike } from '../models/UserLike.js';
import { UserRecentlyWatched } from '../models/UserRecentlyWatched.js';

const sessions = new Map();
const interactions = new Map();

export function ensureInteractionState(userId) {
  if (!interactions.has(userId)) {
    interactions.set(userId, {
      recentSearches: [],
      clickedMovieIds: [],
      recentInteractions: []
    });
  }
  return interactions.get(userId);
}

export async function getUserProfilePayload(userId) {
  // ----- DEMO USER (no database call) -----
  if (userId === 'demo-user') {
    const session = sessions.get(userId) || { userId, name: 'Demo User', email: '' };
    const state = ensureInteractionState(userId);
    const clickedMovies = (await Promise.all(state.clickedMovieIds.map(id => getMovieById(id)))).filter(Boolean);
    const clickedGenres = [...new Set(clickedMovies.flatMap(m => m.genres || []))];
    return {
      userId,
      name: session.name,
      email: session.email,
      preferredGenres: [...new Set([...clickedGenres, 'Action', 'Sci-Fi', 'Drama'])].slice(0, 6),
      avoidedGenres: [],
      likedMovies: state.clickedMovieIds.slice(0, 8),
      dislikedMovies: [],
      watchHistory: state.clickedMovieIds.slice(0, 12),
      durationPreference: 'balanced',
      violenceTolerance: 'medium',
      interactionCount: state.recentInteractions.length
    };
  }

  // ----- REAL USER (MongoDB) -----
  try {
    const user = await User.findById(userId).select('favoriteGenres favoriteThemes name emailid');
    if (!user) {
      return {
        userId,
        name: 'User',
        email: '',
        preferredGenres: ['Action', 'Sci-Fi', 'Drama'],
        avoidedGenres: [],
        likedMovies: [],
        dislikedMovies: [],
        watchHistory: [],
        durationPreference: 'balanced',
        violenceTolerance: 'medium',
        interactionCount: 0,
      };
    }

    const likes = await UserLike.find({ userId, action: 'like' }).lean();
    const likedMoviesFull = (await Promise.all(likes.map(l => getMovieById(l.movieId)))).filter(Boolean);
    const dislikes = await UserLike.find({ userId, action: 'dislike' }).lean();
    const watchHistoryDocs = await UserRecentlyWatched.find({ userId })
      .sort({ watchedAt: -1 })
      .limit(12)
      .lean();
    const watchHistory = watchHistoryDocs.map(w => w.movieId);

    return {
      userId,
      name: user.name || user.emailid,
      email: user.emailid,
      preferredGenres: user.favoriteGenres?.length ? user.favoriteGenres : ['Action', 'Sci-Fi', 'Drama'],
      avoidedGenres: [],
      likedMovies: likedMoviesFull,
      dislikedMovies: dislikes.map(d => d.movieId),
      watchHistory,
      durationPreference: 'balanced',
      violenceTolerance: 'medium',
      interactionCount: watchHistory.length,
    };
  } catch (err) {
    console.error('[userService] Error fetching profile for userId:', userId, err);
    return {
      userId,
      name: 'User',
      email: '',
      preferredGenres: ['Action', 'Sci-Fi', 'Drama'],
      avoidedGenres: [],
      likedMovies: [],
      dislikedMovies: [],
      watchHistory: [],
      durationPreference: 'balanced',
      violenceTolerance: 'medium',
      interactionCount: 0,
    };
  }
}

export async function getUserContextPayload(userId) {
  const state = ensureInteractionState(userId);
  const profile = await getUserProfilePayload(userId);
  const clickedMovies = (await Promise.all(state.clickedMovieIds.map(id => getMovieById(id)))).filter(Boolean);
  return {
    profile,
    recentSearches: state.recentSearches,
    clickedMovies,
    recentInteractions: state.recentInteractions
  };
}

export function createSession(userId, name, email) {
  const session = { userId, name, email };
  sessions.set(userId, session);
  ensureInteractionState(userId);
  return session;
}

export async function getReferenceMovie(state, profile) {
  const clicked = (await Promise.all((state.clickedMovieIds || []).map(id => getMovieById(id)))).find(Boolean);
  if (clicked) return clicked;
  const trending = await getTrendingMovies(1);
  return trending[0] || null;
}

export async function getRelatedMovies(referenceMovie, profile) {
  return await getRandomMovies(8);
}