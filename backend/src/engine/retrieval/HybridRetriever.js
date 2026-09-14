// backend/src/engine/retrieval/HybridRetriever.js
import { GraphRetriever } from "./GraphRetriever.js";
import { CooccurrenceRetriever } from "./CooccurrenceRetriever.js";
import { searchVectors } from "./VectorRetriever.js";

/**
 * HybridRetriever coordinates candidate sourcing across Graph, Collaborative,
 * and Pushdown-Filtered Vector channels using Tier-1 Parallel Fan-Out and
 * Reciprocal Rank Fusion (RRF).
 */
export class HybridRetriever {
  /**
   * Sources candidate movies matching the SearchState
   * @param {SearchState} state - Canonical search state
   * @param {number} candidateTarget - Target candidate pool size
   */
  static async retrieveCandidates(state, candidateTarget = 40) {
    const candidateMap = new Map(); // key -> { movie, rrfScore, sources: Set, channelRanks: Map }

    function recordChannelResults(channelName, movies = []) {
      if (!Array.isArray(movies)) return;
      movies.forEach((m, idx) => {
        if (!m || !m.title) return;
        const key = m.title.toLowerCase().trim();
        const rank = idx + 1;
        const rrfDelta = 1.0 / (60.0 + rank);

        if (!candidateMap.has(key)) {
          candidateMap.set(key, {
            movie: { ...m },
            rrfScore: rrfDelta,
            sources: new Set([channelName]),
            channelRanks: new Map([[channelName, rank]]),
            bestVectorScore: m.scoreBreakdown?.semanticSimilarity || (channelName.includes("vector") ? (m.score || 0.85) : 0),
            matchedAnchors: Array.isArray(m.matchedTerms) ? [...m.matchedTerms] : []
          });
        } else {
          const existing = candidateMap.get(key);
          existing.rrfScore += rrfDelta;
          existing.sources.add(channelName);
          existing.channelRanks.set(channelName, rank);

          // Merge metadata
          if (m.scoreBreakdown?.semanticSimilarity && m.scoreBreakdown.semanticSimilarity > existing.bestVectorScore) {
            existing.bestVectorScore = m.scoreBreakdown.semanticSimilarity;
          }
          if (Array.isArray(m.matchedTerms)) {
            existing.matchedAnchors = Array.from(new Set([...existing.matchedAnchors, ...m.matchedTerms]));
          }
          // Merge genres/themes if existing is sparse
          if ((!existing.movie.genres || existing.movie.genres.length === 0) && m.genres?.length) {
            existing.movie.genres = m.genres;
          }
          if ((!existing.movie.themes || existing.movie.themes.length === 0) && m.themes?.length) {
            existing.movie.themes = m.themes;
          }
          if (!existing.movie.directors?.length && m.directors?.length) {
            existing.movie.directors = m.directors;
          }
        }
      });
    }

    // Identify Primary Genre Anchors, Thematic Anchors, and Spatial Settings
    const hardAnchors = (state.entities || [])
      .filter(e => e.label === "Theme" || e.type === "theme" || e.label === "Franchise" || e.type === "movie")
      .map(e => e.name.toLowerCase().trim())
      .filter(Boolean);

    const macroGenres = Array.from(new Set([
      ...(state.canonicalGenres || []).map(g => g.toLowerCase().trim()),
      ...(state.entities || []).filter(e => e.label === "Genre" || e.type === "genre").map(e => e.name.toLowerCase().trim())
    ])).filter(Boolean);

    const settings = (state.entities || [])
      .filter(e => e.label === "Setting" || e.type === "setting")
      .map(e => e.name.toLowerCase().trim())
      .filter(Boolean);

    const allTagEntities = Array.from(new Set([...hardAnchors, ...macroGenres, ...settings]));

    console.log(`[HybridRetriever] Anchors: [${hardAnchors.join(", ")}], Genres: [${macroGenres.join(", ")}], Settings: [${settings.join(", ")}]`);

    // Prepare Parallel Retrieval Tasks
    const tasks = [];

    // Channel 1: Franchise / Universe Matching
    if (state.franchise) {
      tasks.push((async () => {
        const matches = await GraphRetriever.findMoviesByTitlePattern(state.franchise, 25);
        recordChannelResults("franchise_graph", matches);
      })());

      tasks.push((async () => {
        const coWatched = await CooccurrenceRetriever.getCoWatched(state.franchise, 20);
        recordChannelResults("franchise_cowatched", coWatched);
      })());
    }

    // Channel 2: Director Traversal
    const directorEntity = (state.entities || []).find(e => e.label === "Director" || e.type === "director");
    if (directorEntity?.name) {
      tasks.push((async () => {
        const directorMovies = await GraphRetriever.findMoviesByDirector(directorEntity.name, 30);
        recordChannelResults("director_graph", directorMovies);
      })());
    }

    // Channel 3: Neo4j Tag Traversal (with Anchor Protection & Pushdown Filters)
    if (allTagEntities.length > 0) {
      tasks.push((async () => {
        // Try strict ALL match first with pushdown filters
        const strictMatches = await GraphRetriever.findMoviesByTags(allTagEntities, true, 35, [], state.filters);
        recordChannelResults("graph_tags_all", strictMatches);

        // If strict is sparse, run relaxed match with Hard Anchor conditioning and pushdown filters
        if (strictMatches.length < 15) {
          const relaxedMatches = await GraphRetriever.findMoviesByTags(allTagEntities, false, 40, hardAnchors, state.filters);
          recordChannelResults("graph_tags_relaxed", relaxedMatches);

          // If still sparse under hard filters (e.g. rare era or high rating), source unconstrained pool for principled relaxation
          if (strictMatches.length + relaxedMatches.length < 5 && (state.filters?.yearMin !== null || state.filters?.ratingMin !== null)) {
            const unconstrainedTagMatches = await GraphRetriever.findMoviesByTags(allTagEntities, false, 40, hardAnchors, {
              excludeGenres: state.filters?.excludeGenres,
              region: state.filters?.region
            });
            recordChannelResults("graph_tags_unconstrained", unconstrainedTagMatches);
          }
        }
      })());
    }

    // Channel 4: Pinecone Vector ANN with Pushdown Predicates (ALWAYS RUN IN PARALLEL)
    tasks.push((async () => {
      try {
        const vectorMatches = await searchVectors(state, 40);
        recordChannelResults("vector_ann", vectorMatches);
      } catch (err) {
        console.warn("[HybridRetriever] Vector ANN channel error:", err.message);
      }
    })());

    // Channel 5: Reference Movie - Graph Thematic Traversal + Co-occurrence
    if (state.referenceMovie) {
      tasks.push((async () => {
        try {
          const graphSimilar = await GraphRetriever.findSimilarByGraph(state.referenceMovie, 25);
          recordChannelResults("graph_reference_themes", graphSimilar);
        } catch (err) {
          console.warn("[HybridRetriever] Graph reference traversal error:", err.message);
        }
      })());

      tasks.push((async () => {
        try {
          const coWatched = await CooccurrenceRetriever.getCoWatched(state.referenceMovie, 25);
          recordChannelResults("cowatched_reference", coWatched);
        } catch (err) {
          console.warn("[HybridRetriever] Cooccurrence channel error:", err.message);
        }
      })());
    }

    // Execute all channels concurrently
    await Promise.allSettled(tasks);

    console.log(`[HybridRetriever] Parallel fan-out complete. Sourced unique titles: ${candidateMap.size}`);

    if (candidateMap.size === 0) return [];

    // Rank candidates by Reciprocal Rank Fusion (RRF)
    const sortedEntries = Array.from(candidateMap.values())
      .sort((a, b) => b.rrfScore - a.rrfScore);

    const maxRrf = sortedEntries[0]?.rrfScore || 0.03;
    const minRrf = sortedEntries[sortedEntries.length - 1]?.rrfScore || 0.01;
    const rrfRange = Math.max(0.001, maxRrf - minRrf);

    const candidates = sortedEntries.map(entry => {
      const { movie, rrfScore, sources, bestVectorScore, matchedAnchors } = entry;

      // Tier-1 Calibrated Constraint Coverage Model
      // 1. Primary Genre Coverage (0.45 weight)
      let genreCoverage = 1.0;
      if (macroGenres.length > 0) {
        const mgMatches = macroGenres.some(mg => {
          const mgLower = mg.toLowerCase();
          return (movie.genres || []).some(g => {
            const gLower = g.toLowerCase();
            return gLower === mgLower || gLower.includes(mgLower) || mgLower.includes(gLower);
          }) || (movie.themes || []).some(t => t.toLowerCase().includes(mgLower));
        });
        genreCoverage = mgMatches ? 1.0 : 0.0;
      }

      // 2. Spatial Setting / Thematic Coverage (0.30 weight)
      let settingThematicCoverage = 1.0;
      const allSecondary = [...hardAnchors, ...settings];
      if (allSecondary.length > 0) {
        const hasSecondary = allSecondary.some(s => {
          const sLower = s.toLowerCase();
          return (movie.themes || []).some(t => t.toLowerCase().includes(sLower)) ||
                 (movie.overview || "").toLowerCase().includes(sLower);
        });
        settingThematicCoverage = hasSecondary ? 1.0 : 0.45;
      }

      // 3. Normalized Quality Baseline (0.15 weight)
      const ratingCoverage = typeof movie.rating === "number" ? Math.min(1.0, movie.rating / 8.5) : 0.7;

      // 4. Retrieval Channel Consensus / RRF (0.10 weight)
      const rrfCoverage = (rrfScore - minRrf) / rrfRange;

      // Composite Calibrated Score
      let calibratedScore = (0.45 * genreCoverage) + (0.30 * settingThematicCoverage) + (0.15 * ratingCoverage) + (0.10 * rrfCoverage);

      // If genre coverage is 0 on a genre-specific query, penalize heavily
      if (macroGenres.length > 0 && genreCoverage === 0) {
        calibratedScore = Math.min(0.35, calibratedScore);
      }

      // Continuous Feature Combination
      const popBoost = Math.min(0.04, Math.log10(Math.max(1, movie.popularity || 0)) * 0.012);
      let finalScore = calibratedScore + popBoost;

      // Apply semantic modifiers
      const moreTerms = state.modifiers?.more || [];
      const lessTerms = state.modifiers?.less || [];

      for (const term of moreTerms) {
        if (movie.genres?.some(g => g.toLowerCase().includes(term))) finalScore *= 1.10;
        if (movie.themes?.some(t => t.toLowerCase().includes(term))) finalScore *= 1.10;
      }
      for (const term of lessTerms) {
        if (movie.genres?.some(g => g.toLowerCase().includes(term))) finalScore *= 0.45;
        if (movie.themes?.some(t => t.toLowerCase().includes(term))) finalScore *= 0.45;
      }

      const clampedScore = Math.min(0.98, Math.max(0.30, parseFloat(finalScore.toFixed(2))));
      const sourceList = Array.from(sources);

      // Tier-1 Logarithmic Bayesian Quality Prior:
      // FinalScore = 0.70 * Relevance + 0.30 * (IMDb / 10)
      const rawRating = typeof movie.rating === "number" && movie.rating > 0 ? movie.rating : 6.8;
      const normalizedQuality = Math.min(1.0, Math.max(0.1, rawRating / 10.0));
      const bayesianCompositeScore = parseFloat((0.70 * clampedScore + 0.30 * normalizedQuality).toFixed(4));

      return {
        ...movie,
        score: clampedScore,
        bayesianScore: bayesianCompositeScore,
        ragSource: `rrf_fusion [${sourceList.join(", ")}]`,
        scoreBreakdown: {
          semanticSimilarity: parseFloat((bestVectorScore || (clampedScore * 0.9)).toFixed(2)),
          graphScore: parseFloat((calibratedScore * 0.95).toFixed(2)),
          qualityPrior: parseFloat(normalizedQuality.toFixed(2)),
          userPreference: 0.85,
          popularity: movie.popularity || 0,
          rrfScore: parseFloat(rrfScore.toFixed(4))
        },
        explanation: [
          `Multi-Channel Sourced (${sourceList.join(" + ")})`,
          matchedAnchors.length > 0 ? `Anchors: ${matchedAnchors.slice(0, 3).join(", ")}` : "High Semantic Affinity"
        ]
      };
    });

    return candidates.sort((a, b) => (b.bayesianScore ?? b.score ?? 0) - (a.bayesianScore ?? a.score ?? 0));
  }
}
