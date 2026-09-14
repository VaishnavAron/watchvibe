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

export async function buildHomeCollections(userIdInput) {
  const userId = clean(userIdInput) || demoUserId;
  const profile = await getUserProfilePayload(userId);

  // Fetch all Neo4j collections concurrently directly from Graph DB
  const [
    trendingMoviesList,
    topRatedMoviesList,
    actionMoviesList,
    dramaMoviesList,
    exploreMoviesList
  ] = await Promise.all([
    getTrendingMovies(8),
    getTopRatedMovies(8),
    getMoviesByGenre('action', 8),
    getMoviesByGenre('drama', 8),
    getRandomMovies(8)
  ]);

  const referenceMovie = trendingMoviesList[0] || exploreMoviesList[0] || {
    id: 'demo-1',
    title: 'Inception',
    year: 2010,
    posterUrl: 'https://image.tmdb.org/t/p/w500/8IB2e4r4oVhHn97L9flY28uj2bT.jpg',
    genres: ['Action', 'Sci-Fi']
  };

  // Fetch related movies dynamically from Neo4j based on primary genre
  const primaryGenre = referenceMovie.genres?.[0] || 'Action';
  let relatedMovies = [];
  try {
    relatedMovies = await getMoviesByGenre(primaryGenre, 8);
  } catch (err) {
    relatedMovies = exploreMoviesList;
  }

  // Fetch database-recently-watched (excluding disliked)
  let recentMovies = [];
  if (userId !== demoUserId) {
    try {
      const recentlyWatchedDocs = await UserRecentlyWatched.find({ userId })
        .sort({ watchedAt: -1 })
        .limit(8)
        .lean();

      const dislikedMovies = await UserLike.find({ userId, action: 'dislike' }).lean();
      const dislikedIds = new Set(dislikedMovies.map(d => d.movieId));

      const validRecent = recentlyWatchedDocs.filter(doc => !dislikedIds.has(doc.movieId));
      recentMovies = (await Promise.all(validRecent.map(doc => getMovieById(doc.movieId)))).filter(Boolean);
    } catch (err) {
      console.error('[collectionService] Error fetching recently watched:', err);
      recentMovies = [];
    }
  }

  // Collaborative movies (optional)
  const collaborativeMovies = (userId !== demoUserId && profile.likedMovies?.length)
    ? await getCollaborativeRecommendations(userId, profile.likedMovies, 8)
    : [];

  const response = {
    hero: referenceMovie,
    becauseYouWatched: {
      title: `Because you watched ${referenceMovie.title}`,
      subtitle: 'A discovery row generated directly from Neo4j graph relationships.',
      movies: (relatedMovies.length ? relatedMovies : exploreMoviesList).slice(0, 8)
    },
    recentlyWatched: {
      title: 'Recently Watched',
      subtitle: 'Titles you used as references or clicked during this frontend session.',
      movies: (recentMovies.length ? recentMovies : topRatedMoviesList.slice(1, 8)).slice(0, 8)
    },
    trending: {
      title: 'Trending Now',
      subtitle: 'Most popular movies right now',
      movies: trendingMoviesList
    },
    topRated: {
      title: 'Top Rated',
      subtitle: 'Highest rated movies of all time',
      movies: topRatedMoviesList
    },
    action: {
      title: 'Action Movies',
      subtitle: 'High‑octane thrill rides',
      movies: actionMoviesList
    },
    drama: {
      title: 'Critically Acclaimed Dramas',
      subtitle: 'Award‑winning cinematic depth',
      movies: dramaMoviesList
    },
    explore: {
      title: 'Hidden Gems & Explorations',
      subtitle: 'Broaden your cinematic horizons',
      movies: exploreMoviesList
    },
    collaborative: collaborativeMovies.length ? {
      title: 'Community Favorites',
      subtitle: 'Trending among film connoisseurs',
      movies: collaborativeMovies
    } : null
  };

  return response;
}

export const getHomeCollections = buildHomeCollections;