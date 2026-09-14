// backend/src/engine/filter/ConstraintRelaxer.js
import { InvariantBarrier } from "./InvariantBarrier.js";
import { CooccurrenceRetriever } from "../retrieval/CooccurrenceRetriever.js";

/**
 * ConstraintRelaxer handles sparse result sets honestly.
 * If exact matches are fewer than 5, it generates clearly labeled suggestions
 * powered by Graph Co-occurrence (Item-Item CF) and principled relaxation
 * in a separate bucket without contaminating the primary exact matches.
 */
export class ConstraintRelaxer {
  /**
   * Evaluates exact candidates and generates principled relaxed recommendations if sparse.
   * @param {Array} rawCandidates - All sourced candidates
   * @param {SearchState} state - Canonical search state
   * @param {number} minDesired - Minimum desired exact matches
   * @param {Object} options - Optional overrides (e.g. dislikedMovieIds)
   */
  static async evaluate(rawCandidates = [], state, minDesired = 5, options = {}) {
    const exactMatches = InvariantBarrier.enforce(rawCandidates, state, options);

    if (exactMatches.length >= minDesired || (rawCandidates.length === 0 && !state)) {
      return {
        exactMatches,
        relaxedMatches: [],
        isSparse: false,
        relaxationSummary: null
      };
    }

    const exactTitles = new Set(exactMatches.map(m => m.title.toLowerCase().trim()));
    const remainingPool = rawCandidates.filter(m => !exactTitles.has(m.title.toLowerCase().trim()));

    const relaxedMatches = [];
    const seenRelaxed = new Set();

    function addRelaxed(movie, reason) {
      if (!movie || !movie.title) return;
      const key = movie.title.toLowerCase().trim();
      if (exactTitles.has(key) || seenRelaxed.has(key)) return;
      seenRelaxed.add(key);
      relaxedMatches.push({
        ...movie,
        isRelaxed: true,
        relaxationReason: reason
      });
    }

    let relaxationSummary = null;

    // Strategy 1: Graph Co-occurrence ("Viewers Also Loved")
    // If we have at least 1 verified exact match, traverse the Neo4j collaborative graph
    if (exactMatches.length > 0 && exactMatches.length < minDesired) {
      const topAnchor = exactMatches[0];
      try {
        const coWatched = await CooccurrenceRetriever.getCoWatched(topAnchor.title, 10);
        const safeCoWatched = InvariantBarrier.enforce(coWatched, {
          filters: {
            excludeGenres: state.filters?.excludeGenres || [],
            region: state.filters?.region || null
          }
        }, options);

        safeCoWatched.slice(0, 6).forEach(m => {
          addRelaxed(m, `Co-watched with ${topAnchor.title}`);
        });

        if (relaxedMatches.length > 0) {
          relaxationSummary = `Found ${exactMatches.length} direct match${exactMatches.length === 1 ? '' : 'es'}. Augmented with community favorites co-watched with ${topAnchor.title}.`;
        }
      } catch (err) {
        console.warn("[ConstraintRelaxer] Cooccurrence strategy error:", err.message);
      }
    }

    // Strategy 2: Temporal Near-Neighbors (if year was constrained and pool still sparse)
    if (relaxedMatches.length < 4 && (state.filters?.yearMin !== null || state.filters?.yearMax !== null)) {
      const relaxedFilters = { ...state.filters };
      if (relaxedFilters.yearMin !== null) relaxedFilters.yearMin -= 5;
      if (relaxedFilters.yearMax !== null) relaxedFilters.yearMax += 5;

      const temporalNeighbors = InvariantBarrier.enforce(remainingPool, {
        filters: relaxedFilters,
        entities: state.entities
      }, options);

      temporalNeighbors.slice(0, 6).forEach(m => {
        addRelaxed(m, `Era Expanded (${relaxedFilters.yearMin || 'Early'}–${relaxedFilters.yearMax || 'Present'})`);
      });

      if (!relaxationSummary && relaxedMatches.length > 0) {
        relaxationSummary = `Found ${exactMatches.length} direct match${exactMatches.length === 1 ? '' : 'es'}. Expanded the era bounds to include adjacent classics.`;
      }
    }

    // Strategy 3: Rating Near-Neighbors (if rating was constrained and still sparse)
    if (relaxedMatches.length < 4 && state.filters?.ratingMin !== null) {
      const relaxedFilters = { ...state.filters };
      relaxedFilters.ratingMin = Math.max(6.5, (relaxedFilters.ratingMin || 7.5) - 0.7);

      const ratingNeighbors = InvariantBarrier.enforce(remainingPool, {
        filters: relaxedFilters,
        entities: state.entities
      }, options);

      ratingNeighbors.slice(0, 6).forEach(m => {
        addRelaxed(m, `Rating Relaxed to ≥ ${relaxedFilters.ratingMin.toFixed(1)}★`);
      });

      if (!relaxationSummary && relaxedMatches.length > 0) {
        relaxationSummary = `Found ${exactMatches.length} direct match${exactMatches.length === 1 ? '' : 'es'}. Broadened rating threshold to uncover nearby gems.`;
      }
    }

    // Strategy 4: Genre-Preserved Anchor Relaxation (for niche viewing occasions like "national holiday")
    if (exactMatches.length === 0 && relaxedMatches.length < 3 && remainingPool.length > 0) {
      const targetGenreEntities = (state.entities || []).filter(e => e.label === "Genre" || e.type === "genre");
      if (targetGenreEntities.length > 0) {
        const genreRelaxedPool = InvariantBarrier.enforce(remainingPool, {
          filters: {
            ...state.filters,
            ratingMin: state.filters?.ratingMin ? Math.max(6.2, state.filters.ratingMin - 1.2) : null
          },
          entities: targetGenreEntities
        }, options);

        genreRelaxedPool.slice(0, 6).forEach(m => {
          addRelaxed(m, `Curated ${m.genres?.[0] || 'Genre'} Favorite`);
        });

        if (!relaxationSummary && relaxedMatches.length > 0) {
          relaxationSummary = `Broadened specific thematic tags to feature acclaimed ${targetGenreEntities[0].name} favorites.`;
        }
      }
    }

    return {
      exactMatches,
      relaxedMatches: relaxedMatches.slice(0, 8),
      isSparse: exactMatches.length < minDesired,
      relaxationSummary
    };
  }
}

