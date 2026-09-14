// backend/src/engine/retrieval/VectorRetriever.js
import { embedText, pineconeIndex } from "../../core/2_config.js";
import { getMoviesByTitles } from "../../services/movieData.js";

/**
 * Builds native Pinecone metadata filter predicates from SearchState filters.
 * Ensures pushdown filtering occurs inside the vector engine before vectors are returned.
 */
export function buildPineconeFilter(filters = {}) {
  const conditions = {};

  if (typeof filters.yearMin === "number" && typeof filters.yearMax === "number") {
    conditions.year = { $gte: filters.yearMin, $lte: filters.yearMax };
  } else if (typeof filters.yearMin === "number") {
    conditions.year = { $gte: filters.yearMin };
  } else if (typeof filters.yearMax === "number") {
    conditions.year = { $lte: filters.yearMax };
  }

  // Pushdown minimum rating (or baseline quality guardrail of 5.5 to eliminate garbage)
  const minRating = typeof filters.ratingMin === "number" ? filters.ratingMin : 5.5;
  conditions.rating = { $gte: minRating };

  return Object.keys(conditions).length > 0 ? conditions : undefined;
}

/**
 * Extracts the persistent semantic concept from SearchState.
 * NEVER embeds conversational commands (e.g. "keep only titles from the 90s").
 */
export function extractSemanticQuery(state) {
  if (!state) return "";
  
  // 1. Tier-1 Grounded Latent Vector Query: Prioritize rich descriptive narrative
  if (state.vectorQuery && typeof state.vectorQuery === "string" && state.vectorQuery.trim().length > 0) {
    return state.vectorQuery.trim();
  }

  // 2. Reference movie fallback
  if (state.referenceMovie) return `movies like ${state.referenceMovie}`;

  // 3. Gather active canonical genres and positive modifiers
  const genreTerms = (state.canonicalGenres || []).filter(Boolean);
  const moreTerms = state.modifiers?.more || [];
  const combined = Array.from(new Set([...genreTerms, ...moreTerms])).join(" ").trim();
  if (combined.length > 0) return combined;

  // 4. Fallback to clean intent summary
  return (state.intentSummary || "")
    .replace(/\b(keep|only|titles|from|the|before|after|in|rated|rating|critically|acclaimed)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Executes vector search with native metadata pushdown filters.
 */
export async function searchVectors(state, topK = 30) {
  const semanticQuery = extractSemanticQuery(state);
  if (!semanticQuery || semanticQuery.trim().length === 0) {
    return [];
  }

  const filter = buildPineconeFilter(state.filters);
  const vector = await embedText(semanticQuery);
  if (!vector || !Array.isArray(vector) || vector.length === 0) {
    console.warn("[VectorRetriever] Vector embedding unavailable, returning empty vector candidates.");
    return [];
  }

  const queryOptions = {
    vector,
    topK,
    includeMetadata: true,
  };
  if (filter) {
    queryOptions.filter = filter;
  }

  let pineconeResponse;
  try {
    pineconeResponse = await pineconeIndex.query(queryOptions);
  } catch (err) {
    console.warn("[VectorRetriever] Pinecone query with filter failed, retrying relaxed:", err.message);
    try {
      pineconeResponse = await pineconeIndex.query({ vector, topK, includeMetadata: true });
    } catch (e2) {
      console.error("[VectorRetriever] Pinecone fallback query also failed:", e2.message);
      return [];
    }
  }

  const matches = pineconeResponse?.matches || [];
  if (matches.length === 0) return [];

  const candidateTitles = matches
    .map(m => m.metadata?.title || m.metadata?.movie?.title)
    .filter(Boolean);

  const dbMoviesMap = await getMoviesByTitles(candidateTitles);

  const candidates = [];
  for (const match of matches) {
    const title = match.metadata?.title || match.metadata?.movie?.title;
    if (!title) continue;

    const dbMovie = dbMoviesMap.get(title.toLowerCase().trim());
    if (dbMovie) {
      candidates.push({
        ...dbMovie,
        score: match.score || 0.85,
        ragSource: "vector_pushdown_ann",
        scoreBreakdown: {
          semanticSimilarity: parseFloat((match.score || 0.85).toFixed(2)),
          graphScore: 0,
          userPreference: 0,
          popularity: dbMovie.popularity || 0,
        },
        explanation: ["Semantic Theme Alignment", `Vector Similarity: ${Math.round((match.score || 0.85) * 100)}%`],
      });
    }
  }

  return candidates;
}
