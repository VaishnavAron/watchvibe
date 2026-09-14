import fs from 'fs';

import { palette, sampleMoviesPath } from '../config/constants.js';
import { clean, clamp, normalizeArray, placeholder, slug, toNumber, unique } from '../utils/helpers.js';
import { fallbackSearch } from './fallbackSearch.js';

// export const sampleMovies = loadSampleMovies();
// export const movieIndex = new Map(sampleMovies.map((movie) => [movie.id, movie]));

// export function loadSampleMovies() {
//   try {
//     const rawItems = JSON.parse(fs.readFileSync(sampleMoviesPath, 'utf8'));
//     return rawItems.map((item, index) => normalizeMovieRecord(item, index)).filter(Boolean);
//   } catch (err) {
//     console.error('Could not load sample_movies.json:', err.message);
//     return [normalizeMovieRecord({ title: 'Sample Movie', year: 2024 }, 0)];
//   }
// }

export function normalizeMovieRecord(record, index = 0) {
  const movie = record?.movie && typeof record.movie === 'object' ? { ...record, ...record.movie } : record;
  if (!movie) return null;

  const title = clean(movie.title);
  if (!title) return null;

  const year = toNumber(movie.year);
  const id = clean(movie.id) || slug(`${title}-${year || index}`);
  const genres = normalizeArray(movie.genres);
  const themes = normalizeArray(movie.themes);
  const actors = normalizeArray(movie.actors ?? movie.cast);
  const directors = normalizeArray(movie.directors);
  const director = clean(movie.director?.name) || clean(movie.director) || directors[0] || 'Unknown';
  const posterUrl = clean(movie.posterUrl) || clean(movie.poster_url) || placeholder(title, '320x480');
  const score = clamp(toNumber(movie.score ?? movie.scores?.final ?? movie.matchScore) ?? (0.72 - index * 0.03), 0, 1);

  return {
    id,
    title,
    tagline: clean(movie.tagline) || `${year || 'Movie'} ${genres.slice(0, 2).join(' / ') || 'recommendation'}`,
    year: year || '',
    rating: toNumber(movie.rating) ?? 'N/A',
    genres: genres.length ? genres : ['Drama'],
    themes,
    mood: themes.length ? themes.slice(0, 3) : ['Recommended'],
    duration: toNumber(movie.duration ?? movie.runtime) ?? 120,
    violence: toNumber(movie.violence) ?? 0.35,
    popularity: toNumber(movie.popularity) ?? 50,
    original_language: clean(movie.original_language),
    director,
    actors,
    directors,
    cast: actors.length ? actors.slice(0, 4) : ['Cast unavailable'],
    accent: palette[index % palette.length],
    overview: clean(movie.overview) || 'Recommended by the graph and vector movie backend.',
    posterUrl,
    backdropUrl: clean(movie.backdropUrl) || posterUrl,
    score: Number(score.toFixed(3)),
    scoreBreakdown: {
      semanticSimilarity: Number(clamp(movie.scores?.vectorQuery ?? score * 0.9, 0, 1).toFixed(3)),
      graphScore: Number(clamp(movie.scores?.graphCoOccurrence ?? score * 0.75, 0, 1).toFixed(3)),
      userPreference: Number(clamp(movie.scores?.userBoost ? 0.5 + movie.scores.userBoost : score * 0.7, 0, 1).toFixed(3)),
      popularity: Number(clamp((toNumber(movie.popularity) ?? 50) / 100, 0, 1).toFixed(3))
    },
    explanation: buildExplanation(movie, genres, themes)
  };
}

export function buildExplanation(movie, genres, themes) {
  const paths = Array.isArray(movie.reasoning_paths) ? movie.reasoning_paths : [];
  const reasons = paths.map((pathItem) => clean(pathItem.value || pathItem.type)).filter(Boolean);
  if (clean(movie.explanation_text)) reasons.unshift(movie.explanation_text);
  if (genres.length) reasons.push(`Matches ${genres.slice(0, 2).join(', ')}`);
  if (themes.length) reasons.push(`Theme overlap: ${themes.slice(0, 2).join(', ')}`);
  const uniqueReasons = unique(reasons).slice(0, 4);
  return uniqueReasons.length ? uniqueReasons : ['Ranked from graph, vector, and metadata signals'];
}

export function normalizeBackendResults(result, query) {
  const records = Array.isArray(result?.recommendations)
    ? result.recommendations.map((entry) => ({
        ...entry.movie,
        score: entry.scores?.final,
        scores: entry.scores,
        reasoning_paths: entry.reasoning_paths,
        explanation_text: entry.explanation_text
      }))
    : Array.isArray(result?.data)
      ? flattenGraphData(result.data)
      : [];

  const normalized = records.map((record, index) => normalizeMovieRecord(record, index)).filter(Boolean);

 // console.log(normalized);
  return normalized.length ? normalized : fallbackSearch(query);
}

export function flattenGraphData(data) {
  return data.flatMap((record) => {
    if (record?.title) return [record];
    if (Array.isArray(record?.movies)) return record.movies;
    return [];
  });
}

// function fallbackSampleSearch(query) {
//   const tokens = query.toLowerCase().split(/\W+/).filter(Boolean);
//   return sampleMovies
//     .map((movie) => ({
//       movie,
//       hits: tokens.filter((token) => `${movie.title} ${movie.overview} ${movie.genres.join(' ')} ${movie.mood.join(' ')}`.toLowerCase().includes(token)).length
//     }))
//     .filter((entry) => entry.hits > 0)
//     .sort((left, right) => right.hits - left.hits)
//     .map((entry) => entry.movie)
//     .slice(0, 8);
// }
