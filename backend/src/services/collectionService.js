// src/services/collectionService.js
import { demoUserId } from '../config/constants.js';
import { clean } from '../utils/helpers.js';
import {
  getTrendingMovies,
  getTopRatedMovies,
  getMoviesByGenre,
  getRandomMovies,
  getMovieById
} from './movieData.js';
import {
  getUserProfilePayload
} from './userService.js';
import { UserLike } from '../models/UserLike.js';
import { UserRecentlyWatched } from '../models/UserRecentlyWatched.js';

// Helper to get collaborative recommendations (if implemented)
async function getCollaborativeRecommendations(userId, likedMovies, limit = 8) {
  return [];
}

// In-memory catalog cache for 0ms Discover page loads
let cachedBaseCatalog = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

async function fetchBaseCatalogFromGraph() {
  const [
    trendingMoviesList,
    topRatedMoviesList,
    actionMoviesList,
    dramaMoviesList,
    exploreMoviesList
  ] = await Promise.all([
    getTrendingMovies(8).catch(() => []),
    getTopRatedMovies(8).catch(() => []),
    getMoviesByGenre('action', 8).catch(() => []),
    getMoviesByGenre('drama', 8).catch(() => []),
    getRandomMovies(8).catch(() => [])
  ]);

  const referenceMovie = trendingMoviesList[0] || exploreMoviesList[0] || {
    id: 'demo-1',
    title: 'Inception',
    year: 2010,
    posterUrl: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=500&auto=format&fit=crop&q=80',
    backdropUrl: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=1280&auto=format&fit=crop&q=80',
    genres: ['Action', 'Sci-Fi'],
    rating: 8.8,
    overview: 'A thief who steals corporate secrets through the use of dream-sharing technology is given the inverse task of planting an idea into the mind of a C.E.O.'
  };

  const primaryGenre = referenceMovie.genres?.[0] || 'Action';
  let relatedMovies = [];
  try {
    relatedMovies = await getMoviesByGenre(primaryGenre, 8);
  } catch (err) {
    relatedMovies = exploreMoviesList;
  }

  return {
    hero: referenceMovie,
    trendingMoviesList,
    topRatedMoviesList,
    actionMoviesList,
    dramaMoviesList,
    exploreMoviesList,
    relatedMovies
  };
}

export async function buildHomeCollections(userIdInput) {
  const userId = clean(userIdInput) || demoUserId;

  // 1. Check or refresh base catalog in-memory cache
  const now = Date.now();
  if (!cachedBaseCatalog || now - lastCacheTime > CACHE_TTL_MS) {
    try {
      cachedBaseCatalog = await fetchBaseCatalogFromGraph();
      lastCacheTime = now;
    } catch (err) {
      console.error('[collectionService] Error refreshing base catalog:', err);
      if (!cachedBaseCatalog) {
        // Fallback dummy to ensure endpoint never throws
        cachedBaseCatalog = {
          hero: {
            id: 'demo-1',
            title: 'Inception',
            year: 2010,
            posterUrl: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=500&auto=format&fit=crop&q=80',
            genres: ['Action', 'Sci-Fi'],
            rating: 8.8,
            overview: 'Intricate cinematic sci-fi thriller.'
          },
          trendingMoviesList: [],
          topRatedMoviesList: [],
          actionMoviesList: [],
          dramaMoviesList: [],
          exploreMoviesList: [],
          relatedMovies: []
        };
      }
    }
  }

  const {
    hero,
    trendingMoviesList,
    topRatedMoviesList,
    actionMoviesList,
    dramaMoviesList,
    exploreMoviesList,
    relatedMovies
  } = cachedBaseCatalog;

  // 2. Fetch database-recently-watched with strict 1000ms timeout guard
  let recentMovies = [];
  if (userId !== demoUserId) {
    try {
      const mongoTimeout = (promise, ms = 1000) =>
        Promise.race([
          promise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('Mongo timeout')), ms))
        ]);

      const recentlyWatchedDocs = await mongoTimeout(
        UserRecentlyWatched.find({ userId }).sort({ watchedAt: -1 }).limit(8).lean()
      ).catch(() => []);

      const dislikedMovies = await mongoTimeout(
        UserLike.find({ userId, action: 'dislike' }).lean()
      ).catch(() => []);

      const dislikedIds = new Set((dislikedMovies || []).map(d => d.movieId));
      const validRecent = (recentlyWatchedDocs || []).filter(doc => !dislikedIds.has(doc.movieId));
      recentMovies = (await Promise.all(validRecent.map(doc => getMovieById(doc.movieId)))).filter(Boolean);
    } catch (err) {
      console.warn('[collectionService] User recently watched query bypassed:', err.message);
      recentMovies = [];
    }
  }

  const response = {
    hero,
    becauseYouWatched: {
      title: `Because you watched ${hero.title}`,
      subtitle: 'A discovery rail generated directly from Neo4j graph relationships.',
      movies: (relatedMovies.length ? relatedMovies : exploreMoviesList).slice(0, 8)
    },
    recentlyWatched: {
      title: 'Recently Watched',
      subtitle: 'Titles you used as references or clicked during this frontend session.',
      movies: (recentMovies.length ? recentMovies : topRatedMoviesList.slice(1, 8)).slice(0, 8)
    },
    trending: {
      title: 'Trending Now',
      subtitle: 'Most popular movies right now across the AI Knowledge Graph',
      movies: trendingMoviesList
    },
    topRated: {
      title: 'Top Rated',
      subtitle: 'Highest rated movies of all time in the graph',
      movies: topRatedMoviesList
    },
    action: {
      title: 'Action & Thrills',
      subtitle: 'High‑octane thrill rides and kinetic cinematic adventures',
      movies: actionMoviesList
    },
    drama: {
      title: 'Critically Acclaimed Dramas',
      subtitle: 'Award‑winning cinematic depth and emotional resonance',
      movies: dramaMoviesList
    },
    explore: {
      title: 'Hidden Gems & Explorations',
      subtitle: 'Broaden your cinematic horizons with deep catalog selections',
      movies: exploreMoviesList
    }
  };

  return response;
}

export const getHomeCollections = buildHomeCollections;