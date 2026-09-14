// src/services/recommendationService.js (FINAL)
import { embedText, pineconeIndex } from "../core/2_config.js";
import { backendDemoUserId } from "../config/constants.js";
import { handleGraphQuery } from "../core/11_graphHandler.js";
import { handleSimilarityQuery } from "../core/12_similarityHandler.js";
import {
  fallbackSearch,
  getReferenceMovieFromQuery,
} from "./fallbackSearch.js";
import { normalizeBackendResults } from "./movieNormalizer.js";
import {
  sampleMovies,
  getMoviesByActor,
  getMoviesByDirector,
  getMoviesByTags,          // 🔥 IMPORT ADDED
} from "./movieData.js";
import { getUserProfilePayload } from "./userService.js";
import { understandQuery } from "./queryUnderstanding.js";
import { extractFilters } from "../utils/queryPreprocessor.js";

// ---------- Helper: apply filters (year, rating, region, exclude) ----------
function applyFiltersAndModifiers(movies, filters) {
  let filtered = movies;
  if (filters.yearMin !== null) {
    filtered = filtered.filter((m) => m.year && m.year >= filters.yearMin);
  }
  if (filters.yearMax !== null) {
    filtered = filtered.filter((m) => m.year && m.year <= filters.yearMax);
  }
  if (filters.ratingMin !== null) {
    filtered = filtered.filter(
      (m) => typeof m.rating === "number" && m.rating >= filters.ratingMin
    );
  }
  if (filters.excludeGenres.length > 0) {
    filtered = filtered.filter(
      (m) =>
        !m.genres?.some((g) => filters.excludeGenres.includes(g.toLowerCase()))
    );
  }
  if (filters.region === "south") {
    filtered = filtered.filter((m) =>
      ["te", "ta", "ml", "kn"].includes(m.original_language?.toLowerCase())
    );
  } else if (filters.region === "north") {
    filtered = filtered.filter(
      (m) => m.original_language?.toLowerCase() === "hi"
    );
  }
  return filtered;
}

// ---------- Helper: modifier boosts (more/less) ----------
function applyModifierBoosts(movies, modifiers) {
  if (!modifiers || (modifiers.more.length === 0 && modifiers.less.length === 0)) return movies;
  return movies.map(movie => {
    let boost = 1.0;
    // Boost for 'more' terms (e.g., more comedy) – increase to 1.5
    modifiers.more.forEach(term => {
      if (movie.genres?.some(g => g.toLowerCase().includes(term))) boost *= 1.5;
      if (movie.themes?.some(t => t.toLowerCase().includes(term))) boost *= 1.5;
    });
    // Penalty for 'less' terms – reduce to 0.6
    modifiers.less.forEach(term => {
      if (movie.genres?.some(g => g.toLowerCase().includes(term))) boost *= 0.6;
      if (movie.themes?.some(t => t.toLowerCase().includes(term))) boost *= 0.6;
    });
    if (movie.score) movie.score *= boost;
    return movie;
  }).sort((a,b) => (b.score || b.popularity || 0) - (a.score || a.popularity || 0));
}

// ---------- Helper: vector search with poster enrichment (for free‑text) ----------
async function vectorSearchAndEnrich(query, topK = 10) {
  const emb = await embedText(query);
  const results = await pineconeIndex.query({
    vector: emb,
    topK,
    includeMetadata: true,
  });
  const enriched = [];
  for (const match of results.matches) {
    const meta = match.metadata || {};
    const title = meta.title || meta.movie?.title;
    if (!title) continue;
    // Try to find exact match in sampleMovies
    let movie = sampleMovies.find(
      (m) => m.title && m.title.toLowerCase() === title.toLowerCase()
    );
    if (!movie) {
      // Fallback: first word match
      const firstWord = title.split(/\s+/)[0].toLowerCase();
      movie = sampleMovies.find(
        (m) => m.title && m.title.toLowerCase().startsWith(firstWord)
      );
    }
    if (movie) {
      enriched.push({
        ...movie,
        score: match.score,
        scoreBreakdown: {
          semanticSimilarity: match.score,
          graphScore: 0,
          userPreference: 0,
          popularity: movie.popularity || 0,
        },
        explanation: ["Matched by semantic similarity"],
      });
    } else {
      enriched.push({
        id: meta.id || meta._id || `vec_${Date.now()}_${Math.random()}`,
        title: title,
        posterUrl:
          meta.posterUrl ||
          meta.poster_url ||
          "https://placehold.co/320x480/1f2937/f9fafb?text=No+Poster",
        year: meta.year,
        genres: meta.genres || [],
        themes: meta.themes || [],
        score: match.score,
        scoreBreakdown: {
          semanticSimilarity: match.score,
          graphScore: 0,
          userPreference: 0,
          popularity: 0,
        },
        explanation: [],
      });
    }
  }
  // deduplicate by id
  const seen = new Set();
  return enriched.filter((m) => (m.id && !seen.has(m.id) ? seen.add(m.id) : true));
}

// ---------- Main export ----------
export async function buildRecommendationPayload(query, userId) {
  console.log("[DEBUG] buildRecommendationPayload called");
  console.log("QUERY : " + query);

  // Fast‑path: single‑word exact movie title (same as before)
  if (query.trim().split(/\s+/).length === 1) {
    const singleWordMatch = sampleMovies.find(m => 
      m.title && m.title.trim().toLowerCase() === query.trim().toLowerCase()
    );
    if (singleWordMatch) {
      console.log(`[FAST] Single‑word exact movie title match: "${singleWordMatch.title}"`);
      const resolved = {
        entities: [{ label: 'Movie', nodeName: singleWordMatch.title, searchTerm: singleWordMatch.title, matchType: 'exact' }],
        unresolved: [],
      };
      const filters = extractFilters(query); // define filters here (needed for the branch)
      let backendResult = await handleSimilarityQuery(query, resolved, {
        includeLLMExplanation: true,
        userId: toBackendUserId(userId),
      });
      let results = normalizeBackendResults(backendResult, query);
      results = applyFiltersAndModifiers(results, filters);
      results = applyModifierBoosts(results, filters.modifiers);
      const referenceMovie = singleWordMatch;
      const parsedQueryFinal = buildParsedQuery(query, resolved, referenceMovie);
      return {
        query,
        parsedQuery: parsedQueryFinal,
        userProfile: await getUserProfilePayload(userId),
        ragContext: { source: 'single_word_fastpath' },
        referenceMovie,
        results: results.slice(0, 8),
      };
    }
  }

  try {
    const filters = extractFilters(query);
    console.log("[PRE] Filters:", filters);

    const { entities, queryType } = await understandQuery(query);
    console.log("[LLM] Entities:", entities);
    console.log("[LLM] Query type:", queryType);

    const rawEntities = entities || [];
    const validEntities = rawEntities.filter(
      (e) => e.name && typeof e.name === "string" && e.name.trim().length > 0
    );
    console.log("[LLM] Valid entities after filtering:", validEntities);

    const hasMovieEntity = validEntities.some((e) => e.label === "Movie");
    const hasActorEntity = validEntities.some((e) => e.label === "Actor");
    const hasDirectorEntity = validEntities.some((e) => e.label === "Director");
    const hasGenreOrTheme = validEntities.some(
      (e) => e.label === "Genre" || e.label === "Theme"
    );

    // ----- MOVIE BRANCH (with safety net) -----
    if (hasMovieEntity) {
      const movieEntity = validEntities.find((e) => e.label === "Movie");
      const movieName = movieEntity.name;
      console.log(`[ROUTE] Movie entity → similarity pipeline for "${movieName}"`);
      const resolved = {
        entities: validEntities.map((e) => ({
          label: e.label,
          nodeName: e.name,
          searchTerm: e.name,
          matchType: "llm_extracted",
        })),
        unresolved: [],
      };

      let backendResult = await handleSimilarityQuery(query, resolved, {
        includeLLMExplanation: true,
        userId: toBackendUserId(userId),
      });
      let results = normalizeBackendResults(backendResult, query);
      if (!Array.isArray(results)) results = [];

      results = applyFiltersAndModifiers(results, filters);
      results = applyModifierBoosts(results, filters.modifiers);

      const refMovie = await getReferenceMovieFromQuery(query);
      const referenceMovie = refMovie ?? results[0] ?? sampleMovies[0] ?? { title: 'Unknown' };
      const parsedQueryFinal = buildParsedQuery(query, resolved, referenceMovie);

      return {
        query,
        parsedQuery: parsedQueryFinal,
        userProfile: await getUserProfilePayload(userId),
        ragContext: { source: "graph-vector-backend" },
        referenceMovie,
        results: results.slice(0, 8),
      };
    }

    // ----- ACTOR BRANCH -----
    if (hasActorEntity) {
      const actorEntity = validEntities.find((e) => e.label === "Actor");
      const actorName = actorEntity.name;
      console.log(`[ROUTE] Actor query: ${actorName}`);
      let results = await getMoviesByActor(actorName);
      results = applyFiltersAndModifiers(results, filters);
      results = applyModifierBoosts(results, filters.modifiers);
      const profile = await getUserProfilePayload(userId);
      const parsedQuery = { /* ... unchanged ... */ };
      return {
        query, parsedQuery, userProfile: profile,
        ragContext: { source: "actor_filter" },
        referenceMovie: null, results: results.slice(0, 8),
      };
    }

    // ----- DIRECTOR BRANCH -----
    if (hasDirectorEntity) {
      const directorEntity = validEntities.find((e) => e.label === "Director");
      const directorName = directorEntity.name;
      console.log(`[ROUTE] Director query: ${directorName}`);
      let results = await getMoviesByDirector(directorName);
      results = applyFiltersAndModifiers(results, filters);
      results = applyModifierBoosts(results, filters.modifiers);
      const profile = await getUserProfilePayload(userId);
      const parsedQuery = { /* ... unchanged ... */ };
      return {
        query, parsedQuery, userProfile: profile,
        ragContext: { source: "director_filter" },
        referenceMovie: null, results: results.slice(0, 8),
      };
    }

    // ----- GENRE/THEME BRANCH (FIXED) -----
    if (hasGenreOrTheme) {
      console.log("[ROUTE] Genre/Theme → database filter");
      const terms = validEntities
        .filter(e => e.label === "Genre" || e.label === "Theme")
        .map(e => e.name.toLowerCase());
      console.log(`[GENRE-THEME] Terms: ${terms.join(", ")}`);

      let filteredMovies = await getMoviesByTags(terms, true, 50); // AND first
      let usedLogic = "AND";
      if (filteredMovies.length === 0) {
        filteredMovies = await getMoviesByTags(terms, false, 50); // OR fallback
        usedLogic = "OR";
      }

      // If still empty, vector fallback
      if (filteredMovies.length === 0) {
        console.log("[GENRE-THEME] No matches, falling back to vector similarity");
        let results = await vectorSearchAndEnrich(query, 30);
        const profile = await getUserProfilePayload(userId);
        const parsedQuery = { /* ... fallback parsed query ... */ };
        return {
          query, parsedQuery, userProfile: profile,
          ragContext: { source: 'free_text_fallback' },
          referenceMovie: null, results: results.slice(0, 8),
        };
      }

      // Apply filters and scoring (no need for matchesTerm)
      filteredMovies = applyFiltersAndModifiers(filteredMovies, filters);
      // Simple popularity-based score, or use terms match count from DB? We'll just use popularity
      filteredMovies = filteredMovies.map(movie => ({
        ...movie,
        score: (movie.popularity || 0) / 100, // normalise
      }));
      filteredMovies = applyModifierBoosts(filteredMovies, filters.modifiers);
      filteredMovies.sort((a, b) => (b.score || 0) - (a.score || 0));

      const profile = await getUserProfilePayload(userId);
      const parsedQuery = {
        rawTokens: query.toLowerCase().split(/\W+/).filter(Boolean),
        genres: validEntities.filter(e => e.label === "Genre").map(e => e.name),
        moods: validEntities.filter(e => e.label === "Theme").map(e => e.name),
        lessViolent: /less violent|low violence|soft|lighter/i.test(query),
        referenceMovieId: null,
        graphHints: { sameActor: false, sameDirector: false },
      };
      console.log(`[GENRE-THEME] Using ${usedLogic} logic, final ${filteredMovies.length} movies`);
      return {
        query, parsedQuery, userProfile: profile,
        ragContext: { source: `genre_theme_filter_${usedLogic.toLowerCase()}` },
        referenceMovie: null, results: filteredMovies.slice(0, 8),
      };
    }

    // ----- FREE TEXT / NO ENTITIES -----
    if (validEntities.length === 0 || query.length > 50) {
      console.log("[ROUTE] Free‑text query → vector similarity");
      let results = await vectorSearchAndEnrich(query, 30);
      results = applyFiltersAndModifiers(results, filters);
      results = applyModifierBoosts(results, filters.modifiers);
      const profile = await getUserProfilePayload(userId);
      const parsedQuery = { /* ... */ };
      return {
        query, parsedQuery, userProfile: profile,
        ragContext: { source: "free_text_similarity" },
        referenceMovie: null, results: results.slice(0, 8),
      };
    }

    // ----- ULTIMATE FALLBACK -----
    console.log("[ROUTE] No clear entity – fallback to similarity");
    const resolvedFallback = { entities: [], unresolved: [] };
    let backendResult = await handleSimilarityQuery(query, resolvedFallback, {
      includeLLMExplanation: true,
      userId: toBackendUserId(userId),
    });
    let results = normalizeBackendResults(backendResult, query);
    if (!Array.isArray(results)) results = [];
    if (!results.length) results = await fallbackSearch(query);
    results = applyFiltersAndModifiers(results, filters);
    results = applyModifierBoosts(results, filters.modifiers);
    const refMovie = await getReferenceMovieFromQuery(query);
    const referenceMovie = refMovie ?? results[0] ?? sampleMovies[0] ?? { title: 'Unknown' };
    const parsedQueryFinal = { /* ... */ };
    return {
      query, parsedQuery: parsedQueryFinal,
      userProfile: await getUserProfilePayload(userId),
      ragContext: { source: "fallback_similarity" },
      referenceMovie, results: results.slice(0, 8),
    };
  } catch (err) {
    console.error("[FATAL] buildRecommendationPayload error:", err);
    return buildFallbackRecommendationPayload(query, userId, err.message);
  }
}

// ---------- Fallback (unchanged) ----------
// ---------- Fallback (unchanged) ----------
export async function buildFallbackRecommendationPayload(query, userId, reason) { // ✅ ADDED 'async'
  console.log("[DEBUG] buildFallbackRecommendationPayload called, reason:", reason);

  // 🔥 ADD AWAIT HERE
  const results = await fallbackSearch(query);
  const refMovie = await getReferenceMovieFromQuery(query);
  const referenceMovie = refMovie ?? results[0] ?? { title: 'Unknown', id: null };

  return {
    query,
    parsedQuery: {
      rawTokens: query.toLowerCase().split(/\W+/).filter(Boolean),
      genres: [],
      moods: [],
      lessViolent: /less violent|low violence|soft|lighter/i.test(query),
      referenceMovieId: referenceMovie?.id ?? null,
      graphHints: {
        sameActor: /actor|cast/i.test(query),
        sameDirector: /director/i.test(query),
      },
    },
    userProfile: await getUserProfilePayload(userId), // 🔥 Make sure this has await too if it's an async call
    ragContext: { source: "adapter-fallback", reason },
    referenceMovie,
    results: results.slice(0, 8),
  };
}

// ---------- Helpers ----------
function buildParsedQuery(query, resolved, referenceMovie) {
  const lowered = query.toLowerCase();
  return {
    rawTokens: lowered.split(/\W+/).filter(Boolean),
    genres: resolved.entities
      .filter((e) => e.label === "Genre")
      .map((e) => e.nodeName),
    moods: resolved.entities
      .filter((e) => e.label === "Theme")
      .map((e) => e.nodeName),
    lessViolent: /less violent|low violence|soft|lighter/i.test(query),
    referenceMovieId: referenceMovie?.id ?? null,
    graphHints: {
      sameActor: /actor|cast/i.test(query),
      sameDirector: /director/i.test(query),
    },
  };
}

function toBackendUserId(userId) {
  return /^[a-f\d]{24}$/i.test(userId) ? userId : backendDemoUserId;
}