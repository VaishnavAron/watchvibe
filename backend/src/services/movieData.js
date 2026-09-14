// src/services/movieData.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sampleMoviesPath } from '../config/constants.js';
import { normalizeMovieRecord } from './movieNormalizer.js';
import { driver } from '../core/2_config.js';
import { findClosestActor } from '../utils/stringSimilarity.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SAMPLE_MOVIES_PATH = path.join(__dirname, '../../data/enriched_all_movies_final.json');

let sampleMovies = [];
let movieIndex = new Map();

// ────────────────────────────────
// In‑memory helpers (used as fallback)
// ────────────────────────────────
function dedupeMoviesById(movies) {
  const seen = new Set();
  const uniqueMovies = [];
  for (const movie of movies) {
    const key = String(movie?.id ?? '').trim().toLowerCase();
    if (!key) {
      uniqueMovies.push(movie);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueMovies.push(movie);
  }
  return uniqueMovies;
}

export function loadSampleMovies() {
  console.log('[movieData] Loading sample movies fallback into memory...');
  try {
    const resolvedPath = path.resolve(sampleMoviesPath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`File does not exist: ${resolvedPath}`);
    }

    const fileContents = fs.readFileSync(resolvedPath, 'utf8');
    const raw = JSON.parse(fileContents);
    if (!Array.isArray(raw) || raw.length === 0) {
      throw new Error('JSON file is empty or not an array');
    }

    const normalizedMovies = raw.map((item, idx) => normalizeMovieRecord(item, idx)).filter(Boolean);
    sampleMovies = dedupeMoviesById(normalizedMovies);
    movieIndex = new Map(sampleMovies.map(m => [m.id, m]));
    console.log(`✅ Loaded ${sampleMovies.length} sample movies (Fallback Array Ready)`);
  } catch (err) {
    console.error('⚠️ Failed to load sample_movies.json:', err.message);
    sampleMovies = [normalizeMovieRecord({ title: 'Sample Movie', year: 2024 }, 0)];
    movieIndex = new Map(sampleMovies.map(m => [m.id, m]));
  }

  // Final safety net – guarantees at least one movie exists
  if (!sampleMovies.length) {
    sampleMovies = [normalizeMovieRecord({ title: 'Sample Movie', year: 2024 }, 0)];
    movieIndex = new Map(sampleMovies.map(m => [m.id, m]));
    console.warn('[movieData] Applied hard safety net fallback movie');
  }

  return { sampleMovies, movieIndex };
}

// ================== STANDARD FORMATTER ==================
const FALLBACK_POSTER = 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=500&auto=format&fit=crop&q=80';
const FALLBACK_BACKDROP = 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=1280&auto=format&fit=crop&q=80';

function sanitizeImageUrl(url, fallback) {
  if (!url || typeof url !== 'string' || url.includes('placehold.co')) {
    return fallback;
  }
  let cleanUrl = url.trim();
  // Strip duplicate TMDB prefix if present
  cleanUrl = cleanUrl.replace(/^(https?:\/\/image\.tmdb\.org\/t\/p\/[^\/]+)+(https?:\/\/image\.tmdb\.org\/t\/p\/[^\/]+)/, '$2');
  if (cleanUrl.startsWith('/')) {
    cleanUrl = `https://image.tmdb.org/t/p/w500${cleanUrl}`;
  }
  return cleanUrl;
}

export function formatNeo4jMovie(m) {
  let title = m.title || 'Unknown';
  if (title.startsWith("Based on true facts")) {
    title = "1971";
  }
  const rawPoster = m.poster_url || m.posterUrl;
  const rawBackdrop = m.backdrop_url || m.backdropUrl;
  const posterUrl = sanitizeImageUrl(rawPoster, FALLBACK_POSTER);
  const backdropUrl = sanitizeImageUrl(rawBackdrop, posterUrl || FALLBACK_BACKDROP);

  return {
    id: String(m.tmdb_id || m.id || m._id || Math.random()),
    title: title.trim(),
    year: m.year || null,
    posterUrl,
    backdropUrl,
    overview: m.overview || '',
    rating: m.rating || null,
    vote_count: m.vote_count || 0,
    popularity: m.popularity || 0,
    original_language: m.original_language || '',
    adult: m.adult || false,
    genres: m.genres || [],
    themes: m.themes || [],
    directors: m.directors || [],
    actors: m.actors || [],
    writers: m.writers || []
  };
}

// ================== ASYNC DATABASE FUNCTIONS ==================
export async function getTrendingMovies(limit = 8) {
  const session = driver.session({ defaultAccessMode: 'READ' });
  try {
    const result = await session.run(`
      MATCH (m:Movie)
      OPTIONAL MATCH (m)-[:BELONGS_TO]->(g:Genre)
      OPTIONAL MATCH (m)-[:EXPLORES]->(t:Theme)
      OPTIONAL MATCH (m)-[:DIRECTED]-(d:Director)
      OPTIONAL MATCH (m)-[:ACTED_IN]-(a:Actor)
      WITH m, collect(DISTINCT g.name) AS genres, collect(DISTINCT t.name) AS themes,
           collect(DISTINCT d.name) AS directors, collect(DISTINCT a.name) AS actors
      RETURN m {
        .*,
        genres: genres,
        themes: themes,
        directors: directors,
        actors: actors
      } AS movie
      ORDER BY m.popularity DESC
      LIMIT toInteger($limit)
    `, { limit });
    return result.records.map(r => formatNeo4jMovie(r.get('movie')));
  } finally {
    await session.close();
  }
}

export async function getTopRatedMovies(limit = 8) {
  const session = driver.session({ defaultAccessMode: 'READ' });
  try {
    const result = await session.run(`
      MATCH (m:Movie)
      WHERE m.rating IS NOT NULL AND m.vote_count > 100
      OPTIONAL MATCH (m)-[:BELONGS_TO]->(g:Genre)
      OPTIONAL MATCH (m)-[:EXPLORES]->(t:Theme)
      OPTIONAL MATCH (m)-[:DIRECTED]-(d:Director)
      OPTIONAL MATCH (m)-[:ACTED_IN]-(a:Actor)
      WITH m, collect(DISTINCT g.name) AS genres, collect(DISTINCT t.name) AS themes,
           collect(DISTINCT d.name) AS directors, collect(DISTINCT a.name) AS actors
      RETURN m {
        .*,
        genres: genres,
        themes: themes,
        directors: directors,
        actors: actors
      } AS movie
      ORDER BY m.rating DESC
      LIMIT toInteger($limit)
    `, { limit });
    return result.records.map(r => formatNeo4jMovie(r.get('movie')));
  } finally {
    await session.close();
  }
}

export async function getMoviesByGenre(genre, limit = 8) {
  const session = driver.session({ defaultAccessMode: 'READ' });
  try {
    const result = await session.run(`
      MATCH (m:Movie)-[:BELONGS_TO]->(g:Genre)
      WHERE toLower(g.name) = toLower($genre)
      OPTIONAL MATCH (m)-[:EXPLORES]->(t:Theme)
      OPTIONAL MATCH (m)-[:DIRECTED]-(d:Director)
      OPTIONAL MATCH (m)-[:ACTED_IN]-(a:Actor)
      WITH m, g.name AS genreName, collect(DISTINCT t.name) AS themes,
           collect(DISTINCT d.name) AS directors, collect(DISTINCT a.name) AS actors
      RETURN m {
        .*,
        genres: [genreName],
        themes: themes,
        directors: directors,
        actors: actors
      } AS movie
      ORDER BY rand()
      LIMIT toInteger($limit)
    `, { genre: genre.trim(), limit });
    return result.records.map(r => formatNeo4jMovie(r.get('movie')));
  } finally {
    await session.close();
  }
}

export async function getRandomMovies(limit = 8) {
  const session = driver.session({ defaultAccessMode: 'READ' });
  try {
    const result = await session.run(`
      MATCH (m:Movie)
      OPTIONAL MATCH (m)-[:BELONGS_TO]->(g:Genre)
      OPTIONAL MATCH (m)-[:EXPLORES]->(t:Theme)
      OPTIONAL MATCH (m)-[:DIRECTED]-(d:Director)
      OPTIONAL MATCH (m)-[:ACTED_IN]-(a:Actor)
      WITH m, rand() AS r, collect(DISTINCT g.name) AS genres,
           collect(DISTINCT t.name) AS themes, collect(DISTINCT d.name) AS directors,
           collect(DISTINCT a.name) AS actors
      ORDER BY r
      LIMIT toInteger($limit)
      RETURN m {
        .*,
        genres: genres,
        themes: themes,
        directors: directors,
        actors: actors
      } AS movie
    `, { limit });
    return result.records.map(r => formatNeo4jMovie(r.get('movie')));
  } finally {
    await session.close();
  }
}

// export async function getMoviesByActor(actorName) {
//   if (!actorName) return [];
//   const session = driver.session({ defaultAccessMode: 'READ' });
//   try {
//     console.log(`[ACTOR DB QUERY] "${actorName}"`);
//     const result = await session.run(`
//       MATCH (a:Actor)-[:ACTED_IN]->(m:Movie)
//       WHERE toLower(a.name) CONTAINS toLower($actorName)
//       OPTIONAL MATCH (m)-[:BELONGS_TO]->(g:Genre)
//       OPTIONAL MATCH (m)-[:EXPLORES]->(t:Theme)
//       OPTIONAL MATCH (m)-[:DIRECTED]-(d:Director)
//       WITH m, a.name AS actorName, collect(DISTINCT g.name) AS genres,
//            collect(DISTINCT t.name) AS themes, collect(DISTINCT d.name) AS directors
//       RETURN m {
//         .*,
//         actors: [actorName],
//         genres: genres,
//         themes: themes,
//         directors: directors
//       } AS movie
//       ORDER BY m.popularity DESC
//       LIMIT 20
//     `, { actorName: actorName.trim() });
//     return result.records.map(r => formatNeo4jMovie(r.get('movie')));
//   } finally {
//     await session.close();
//   }
// }

export async function getMoviesByActor(actorName) {
  if (!actorName) return [];
  const session = driver.session({ defaultAccessMode: 'READ' });
  try {
    console.log(`[ACTOR DB QUERY] "${actorName}"`);

    // 1. Try direct match (both directions, case‑insensitive)
    let result = await session.run(`
      MATCH (a:Actor)-[:ACTED_IN]->(m:Movie)
      WHERE toLower(a.name) CONTAINS toLower($actorName)
      OPTIONAL MATCH (m)-[:BELONGS_TO]->(g:Genre)
      WITH m, a.name AS actorName, collect(DISTINCT g.name) AS genres
      RETURN m { .*, actors: [actorName], genres: genres } AS movie
      ORDER BY m.popularity DESC
      LIMIT 20
    `, { actorName: actorName.trim() });

    // If no results, try opposite direction (Actor <- Movie)
    if (result.records.length === 0) {
      result = await session.run(`
        MATCH (a:Actor)<-[:ACTED_IN]-(m:Movie)
        WHERE toLower(a.name) CONTAINS toLower($actorName)
        OPTIONAL MATCH (m)-[:BELONGS_TO]->(g:Genre)
        WITH m, a.name AS actorName, collect(DISTINCT g.name) AS genres
        RETURN m { .*, actors: [actorName], genres: genres } AS movie
        ORDER BY m.popularity DESC
        LIMIT 20
      `, { actorName: actorName.trim() });
    }

    if (result.records.length > 0) {
      return result.records.map(r => formatNeo4jMovie(r.get('movie')));
    }

    // 2. Fuzzy fallback (only if both direct queries failed)
    console.log(`[ACTOR] No direct match for "${actorName}". Attempting fuzzy match...`);

    const allActorsResult = await session.run(`MATCH (a:Actor) RETURN a.name AS name`);
    const allActorNames = allActorsResult.records.map(r => r.get('name'));
    console.log(`[ACTOR] Total actor names in DB: ${allActorNames.length}`);
    console.log(`[ACTOR] Sample names:`, allActorNames.slice(0, 5));

    const correctedName = findClosestActor(actorName, allActorNames, 3);
    console.log(`[ACTOR] Fuzzy correction result: "${correctedName}"`);

    if (!correctedName) {
      console.log(`[ACTOR] No close match found. Returning empty.`);
      return [];
    }

    // 3. Query with the corrected exact name (both directions again)
    result = await session.run(`
      MATCH (a:Actor {name: $correctedName})-[:ACTED_IN]->(m:Movie)
      OPTIONAL MATCH (m)-[:BELONGS_TO]->(g:Genre)
      WITH m, a.name AS actorName, collect(DISTINCT g.name) AS genres
      RETURN m { .*, actors: [actorName], genres: genres } AS movie
      ORDER BY m.popularity DESC
      LIMIT 20
    `, { correctedName });

    if (result.records.length === 0) {
      result = await session.run(`
        MATCH (a:Actor {name: $correctedName})<-[:ACTED_IN]-(m:Movie)
        OPTIONAL MATCH (m)-[:BELONGS_TO]->(g:Genre)
        WITH m, a.name AS actorName, collect(DISTINCT g.name) AS genres
        RETURN m { .*, actors: [actorName], genres: genres } AS movie
        ORDER BY m.popularity DESC
        LIMIT 20
      `, { correctedName });
    }

    return result.records.map(r => {
      const movie = formatNeo4jMovie(r.get('movie'));
      movie.explanation = `We auto‑corrected the actor name to "${correctedName}".`;
      movie.fuzzyCorrected = true;
      return movie;
    });

  } catch (err) {
    console.error('[ACTOR DB ERROR]', err);
    return [];
  } finally {
    await session.close();
  }
}

export async function getMoviesByDirector(directorName) {
  if (!directorName) return [];
  const session = driver.session({ defaultAccessMode: 'READ' });
  try {
    console.log(`[DIRECTOR DB QUERY] "${directorName}"`);
    const result = await session.run(`
      MATCH (d:Director)-[:DIRECTED]->(m:Movie)
      WHERE toLower(d.name) CONTAINS toLower($directorName)
      OPTIONAL MATCH (m)-[:BELONGS_TO]->(g:Genre)
      OPTIONAL MATCH (m)-[:EXPLORES]->(t:Theme)
      OPTIONAL MATCH (m)-[:ACTED_IN]-(a:Actor)
      WITH m, d.name AS dirName, collect(DISTINCT g.name) AS genres,
           collect(DISTINCT t.name) AS themes, collect(DISTINCT a.name) AS actors
      RETURN m {
        .*,
        directors: [dirName],
        genres: genres,
        themes: themes,
        actors: actors
      } AS movie
      ORDER BY m.popularity DESC
      LIMIT 20
    `, { directorName: directorName.trim() });
    return result.records.map(r => formatNeo4jMovie(r.get('movie')));
  } finally {
    await session.close();
  }
}

export async function getMoviesByTags(terms, matchAll = true, limit = 50) {
  if (!terms || !terms.length) return [];
  const session = driver.session({ defaultAccessMode: 'READ' });
  try {
    const GENRE_SYNONYMS = {
      'sci-fi': 'science fiction',
      'scifi': 'science fiction',
      'science-fiction': 'science fiction',
      'sf': 'science fiction',
      'rom-com': 'romance',
      'romcom': 'romance',
    };
    const mappedTerms = terms.map(t => GENRE_SYNONYMS[t.toLowerCase()] || t.toLowerCase());
    const operator = matchAll ? 'ALL' : 'ANY';
    const result = await session.run(`
      MATCH (m:Movie)
      OPTIONAL MATCH (m)-[:BELONGS_TO]->(g:Genre)
      OPTIONAL MATCH (m)-[:EXPLORES]->(t:Theme)
      WITH m, collect(DISTINCT toLower(g.name)) AS genres, collect(DISTINCT toLower(t.name)) AS themes
      WITH m, genres, themes, genres + themes AS tags
      WHERE ${operator}(term IN $terms WHERE term IN tags OR any(t IN tags WHERE t CONTAINS term OR term CONTAINS t))
      OPTIONAL MATCH (m)-[:DIRECTED]-(d:Director)
      OPTIONAL MATCH (m)-[:ACTED_IN]-(a:Actor)
      WITH m, genres, themes, collect(DISTINCT d.name) AS directors, collect(DISTINCT a.name) AS actors
      RETURN m {
        .*,
        genres: genres,
        themes: themes,
        directors: directors,
        actors: actors
      } AS movie
      ORDER BY m.popularity DESC
      LIMIT toInteger($limit)
    `, { terms: mappedTerms, limit });
    return result.records.map(r => formatNeo4jMovie(r.get('movie')));
  } catch (err) {
    console.error("[DB ERROR] getMoviesByTags:", err);
    return [];
  } finally {
    await session.close();
  }
}

export async function getMovieById(id) {
  if (!id) return null;
  const session = driver.session({ defaultAccessMode: 'READ' });
  try {
    const result = await session.run(`
      MATCH (m:Movie)
      WHERE toString(m.tmdb_id) = toString($id) OR toString(m.id) = toString($id) OR toString(elementId(m)) = toString($id)
      OPTIONAL MATCH (m)-[:BELONGS_TO]->(g:Genre)
      OPTIONAL MATCH (m)-[:EXPLORES]->(t:Theme)
      OPTIONAL MATCH (m)-[:DIRECTED]-(d:Director)
      OPTIONAL MATCH (m)-[:ACTED_IN]-(a:Actor)
      WITH m, collect(DISTINCT g.name) AS genres, collect(DISTINCT t.name) AS themes,
           collect(DISTINCT d.name) AS directors, collect(DISTINCT a.name) AS actors
      RETURN m {
        .*,
        genres: genres,
        themes: themes,
        directors: directors,
        actors: actors
      } AS movie
      LIMIT 1
    `, { id });
    if (result.records.length === 0) return null;
    return formatNeo4jMovie(result.records[0].get('movie'));
  } catch (err) {
    console.error("[DB ERROR] getMovieById:", err);
    return null;
  } finally {
    await session.close();
  }
}

export async function getAllMovies(limit = 100) {
  const session = driver.session({ defaultAccessMode: 'READ' });
  try {
    const result = await session.run(`
      MATCH (m:Movie)
      OPTIONAL MATCH (m)-[:BELONGS_TO]->(g:Genre)
      OPTIONAL MATCH (m)-[:EXPLORES]->(t:Theme)
      OPTIONAL MATCH (m)-[:DIRECTED]-(d:Director)
      OPTIONAL MATCH (m)-[:ACTED_IN]-(a:Actor)
      WITH m, collect(DISTINCT g.name) AS genres, collect(DISTINCT t.name) AS themes,
           collect(DISTINCT d.name) AS directors, collect(DISTINCT a.name) AS actors
      RETURN m {
        .*,
        genres: genres,
        themes: themes,
        directors: directors,
        actors: actors
      } AS movie
      ORDER BY m.popularity DESC
      LIMIT toInteger($limit)
    `, { limit });
    return result.records.map(r => formatNeo4jMovie(r.get('movie')));
  } catch (err) {
    console.error("[DB ERROR] getAllMovies:", err);
    return [];
  } finally {
    await session.close();
  }
}

export async function searchMoviesInDB(query, limit = 20) {
  if (!query) return [];
  const session = driver.session({ defaultAccessMode: 'READ' });
  try {
    const result = await session.run(`
      MATCH (m:Movie)
      WHERE toLower(m.title) CONTAINS toLower($query)
      OPTIONAL MATCH (m)-[:BELONGS_TO]->(g:Genre)
      OPTIONAL MATCH (m)-[:DIRECTED]-(d:Director)
      OPTIONAL MATCH (m)-[:ACTED_IN]-(a:Actor)
      WITH m, collect(DISTINCT g.name) AS genres,
           collect(DISTINCT d.name) AS directors, collect(DISTINCT a.name) AS actors
      RETURN m {
        .*,
        genres: genres,
        directors: directors,
        actors: actors
      } AS movie
      ORDER BY m.popularity DESC
      LIMIT toInteger($limit)
    `, { query: query.trim(), limit });
    return result.records.map(r => formatNeo4jMovie(r.get('movie')));
  } catch (err) {
    console.error("[DB ERROR] searchMoviesInDB:", err);
    return [];
  } finally {
    await session.close();
  }
}

let enrichedDatasetCache = null;

function getEnrichedDatasetIndex() {
  if (enrichedDatasetCache) return enrichedDatasetCache;
  enrichedDatasetCache = new Map();
  try {
    if (fs.existsSync(SAMPLE_MOVIES_PATH)) {
      const data = JSON.parse(fs.readFileSync(SAMPLE_MOVIES_PATH, 'utf8'));
      for (const item of data) {
        const title = item.movie?.title || item.title;
        if (title) {
          enrichedDatasetCache.set(title.toLowerCase().trim(), {
            title,
            year: item.movie?.year || item.year ? Number(item.movie?.year || item.year) : null,
            poster_url: item.poster_url ?? null,
            backdrop_url: item.backdrop_url ?? null,
            overview: item.overview ?? item.enriched_overview ?? '',
            rating: typeof item.rating === 'number' ? item.rating : null,
            vote_count: item.vote_count ?? 0,
            runtime: item.runtime ?? 0,
            popularity: item.popularity ?? 0,
            adult: item.adult ?? false,
            original_language: item.original_language ?? '',
            genres: item.genres || [],
            themes: item.themes || [],
            directors: Array.isArray(item.director) ? item.director : (item.director ? [item.director] : []),
            actors: item.actors || [],
            writers: item.writers || []
          });
        }
      }
      console.log(`⚡ [movieData] Initialized in-memory metadata index (${enrichedDatasetCache.size} titles)`);
    }
  } catch (err) {
    console.warn('[movieData] Could not preload enriched dataset cache:', err.message);
  }
  return enrichedDatasetCache;
}

export async function getMoviesByTitles(titles) {
  if (!titles || !titles.length) return new Map();
  const cleanTitles = Array.from(new Set(titles.map(t => (t || '').toLowerCase().trim()).filter(Boolean)));
  const localIndex = getEnrichedDatasetIndex();
  const map = new Map();
  const missingTitles = [];

  for (const t of cleanTitles) {
    if (localIndex.has(t)) {
      map.set(t, { ...localIndex.get(t) });
    } else {
      missingTitles.push(t);
    }
  }

  // If all titles found in fast in-memory index, return in 0ms without hitting Neo4j
  if (missingTitles.length === 0) {
    return map;
  }

  const session = driver.session({ defaultAccessMode: 'READ' });
  try {
    const result = await session.run(`
      UNWIND $titles AS targetTitle
      MATCH (m:Movie)
      WHERE toLower(m.title) = targetTitle
      OPTIONAL MATCH (m)-[:BELONGS_TO]->(g:Genre)
      OPTIONAL MATCH (m)-[:EXPLORES]->(t:Theme)
      OPTIONAL MATCH (m)-[:DIRECTED]-(d:Director)
      OPTIONAL MATCH (m)-[:ACTED_IN]-(a:Actor)
      OPTIONAL MATCH (m)-[:WRITTEN_BY]-(w:Writer)
      WITH m, collect(DISTINCT g.name) AS genres, collect(DISTINCT t.name) AS themes,
           collect(DISTINCT d.name) AS directors, collect(DISTINCT a.name) AS actors,
           collect(DISTINCT w.name) AS writers
      RETURN m {
        .*,
        genres: genres,
        themes: themes,
        directors: directors,
        actors: actors,
        writers: writers
      } AS movie
    `, { titles: missingTitles });

    for (const r of result.records) {
      const raw = r.get('movie');
      if (raw && raw.title) {
        const item = {
          title: raw.title,
          year: raw.year ? Number(raw.year) : null,
          poster_url: raw.poster_url ?? null,
          overview: raw.overview ?? '',
          rating: raw.rating ?? null,
          vote_count: raw.vote_count ?? 0,
          runtime: raw.runtime ?? 0,
          popularity: raw.popularity ?? 0,
          adult: raw.adult ?? false,
          original_language: raw.original_language ?? '',
          genres: raw.genres || [],
          themes: raw.themes || [],
          directors: raw.directors || [],
          actors: raw.actors || [],
          writers: raw.writers || []
        };
        const key = raw.title.toLowerCase().trim();
        map.set(key, item);
        localIndex.set(key, item);
      }
    }
    return map;
  } catch (err) {
    console.error("[DB ERROR] getMoviesByTitles:", err);
    return map;
  } finally {
    await session.close();
  }
}

// Export both the in‑memory arrays (for safety fallback) and the async functions
export { sampleMovies, movieIndex };