// backend/src/engine/filter/InvariantBarrier.js

const ADULT_KEYWORDS = ["erotic", "erotica", "nymphomaniac", "xxx", "porn", "adult movie", "sex movie", "softcore", "hardcore"];
const ADULT_THEMES = ["erotica", "nymphomania", "xxx", "pornography", "adult film", "striptease"];
const ADULT_TITLES = [
  "nymphomaniac", "how to have sex", "straight a's to xxx", "fifty shades", "secretary",
  "365 days", "after we fell", "love 3d"
];

const INDIAN_LANGS = ["hi", "te", "ta", "ml", "kn", "bn", "mr", "pa"];

/**
 * InvariantBarrier guarantees that candidates returned to the user strictly satisfy
 * all active hard constraints in the canonical SearchState.
 * ZERO LEAKAGE: No movies with out-of-bounds years, low ratings, excluded genres,
 * or adult explicit content can pass general queries.
 */
export class InvariantBarrier {
  /**
   * Applies strict boolean invariant filters.
   * @param {Array} candidates - Raw candidate movies from retrieval stage
   * @param {SearchState} state - Canonical search state
   * @param {Object} options - Optional overrides (e.g. dislikedMovieIds)
   * @returns {Array} Strictly verified movies
   */
  static enforce(candidates = [], state, options = {}) {
    if (!Array.isArray(candidates) || candidates.length === 0) return [];
    if (!state) return candidates;

    const filters = state.filters || {};
    const minYear = typeof filters.yearMin === "number" ? filters.yearMin : null;
    const maxYear = typeof filters.yearMax === "number" ? filters.yearMax : null;
    const minRating = typeof filters.ratingMin === "number" ? filters.ratingMin : null;
    const excludedGenres = Array.isArray(filters.excludeGenres) 
      ? filters.excludeGenres.map(g => g.toLowerCase().trim()) 
      : [];
    const region = filters.region ? String(filters.region).toLowerCase().trim() : null;

    // Dislike blacklisting: passed via options or state
    const dislikedIds = options.dislikedMovieIds || state.dislikedMovieIds || [];
    const minRelevanceCutoff = typeof options.minConfidenceCutoff === "number" ? options.minConfidenceCutoff : 0.58;

    // SafeSearch check: Is the user explicitly looking for adult content?
    const queryText = (state.intentSummary || "").toLowerCase();
    const isExplicitAdultQuery = ADULT_KEYWORDS.some(kw => queryText.includes(kw));

    // Extract hard anchor themes for semantic consistency
    const hardAnchorThemes = (state.entities || [])
      .filter(e => e.label === "Theme" || e.type === "theme")
      .map(e => e.name.toLowerCase().trim())
      .filter(Boolean);

    return candidates.filter((movie) => {
      if (!movie || !movie.title) return false;
      const lowerTitle = (movie.title || "").toLowerCase().trim();

      // 0. Reference Movie Self-Exclusion Invariant (Never recommend the query movie to itself)
      if (state.referenceMovie) {
        const refTitle = state.referenceMovie.toLowerCase().trim();
        if (lowerTitle === refTitle) return false;
      }

      // 1. SafeSearch & Adult Quarantine Invariant
      if (!isExplicitAdultQuery) {
        const isAdultTitle = ADULT_TITLES.some(bad => lowerTitle.includes(bad));
        if (isAdultTitle) return false;

        const movieThemes = (movie.themes || []).map(t => (t || "").toLowerCase().trim());
        const hasAdultTheme = movieThemes.some(t => ADULT_THEMES.includes(t));
        if (hasAdultTheme) return false;

        if (movie.adult === true) return false;
      }

      // 2. Dislike Blacklisting Invariant
      if (Array.isArray(dislikedIds) && dislikedIds.length > 0) {
        const id = String(movie.id || movie._id || "");
        if (dislikedIds.includes(id) || dislikedIds.includes(lowerTitle)) {
          return false;
        }
      }

      // 3. Year Invariant
      if (minYear !== null) {
        if (!movie.year || movie.year < minYear) return false;
      }
      if (maxYear !== null) {
        if (!movie.year || movie.year > maxYear) return false;
      }

      // 4. Rating Invariant (Strict: No secret dilution)
      if (minRating !== null) {
        const r = typeof movie.rating === "number" ? movie.rating : parseFloat(movie.rating);
        if (isNaN(r) || r < minRating) return false;
      }

      // 5. Excluded Genres Invariant
      if (excludedGenres.length > 0) {
        const movieGenres = (movie.genres || []).map(g => (g || "").toLowerCase().trim());
        const hasExcluded = movieGenres.some(g => excludedGenres.includes(g));
        if (hasExcluded) return false;
      }

      // 5a. Excluded Thematic Modifiers Invariant (e.g. demonic possession, exorcism, gore, slasher, torture)
      const excludedThemes = (state.modifiers?.less || []).map(t => (t || "").toLowerCase().trim()).filter(Boolean);
      if (excludedThemes.length > 0) {
        const movieThemes = (movie.themes || []).map(t => (t || "").toLowerCase().trim());
        const hasExcludedTheme = excludedThemes.some(et => {
          return movieThemes.some(mt => mt === et || (et.length > 3 && mt.includes(et)) || (mt.length > 3 && et.includes(mt)));
        });
        if (hasExcludedTheme) return false;
      }

      // 5b. Primary Target Genre Invariant
      // If user's intent explicitly targets core macro-genres (e.g. romance, horror, family, thriller, animation, sci-fi, comedy)
      // 5b. Primary Target Genre & Subgenre Invariant
      // Evaluated strictly against canonical TMDB genres
      const targetGenres = Array.from(new Set([
        ...(state.canonicalGenres || []).map(g => g.toLowerCase().trim()),
        ...(state.entities || []).filter(e => e.label === "Genre" || e.type === "genre").map(e => e.name.toLowerCase().trim())
      ])).filter(Boolean);

      if (targetGenres.length > 0) {
        const movieGenres = (movie.genres || []).map(g => (g || "").toLowerCase().trim());
        const movieThemes = (movie.themes || []).map(t => (t || "").toLowerCase().trim());
        const allTags = [...movieGenres, ...movieThemes];
        const titleLower = (movie.title || "").toLowerCase();

        const queryLower = (state.intentSummary || "").toLowerCase();
        const isExplicitHybrid = (genreKey) => {
          return queryLower.includes(genreKey) || (state.modifiers?.more || []).some(m => m.includes(genreKey));
        };

        const hasGenreMatch = targetGenres.some(tg => {
          return movieGenres.includes(tg) ||
                 allTags.includes(tg) ||
                 allTags.some(tag => tag.includes(tg) || tg.includes(tag));
        });

        if (!hasGenreMatch) {
          return false;
        }

        // 5b.2: Implicit Anti-Affinity Gate
        // Unless user explicitly requested an action rom-com or sci-fi romance, drop conflicting dominant genres
        const isRomComTarget = targetGenres.some(tg => tg === "romantic comedy" || tg === "rom-com" || tg === "romcom" || tg === "romance");
        if (isRomComTarget) {
          if (!isExplicitHybrid("action") && !isExplicitHybrid("sci-fi") && !isExplicitHybrid("science fiction")) {
            if (movieGenres.includes("science fiction") || movieGenres.includes("action") || movieThemes.includes("alien") || movieThemes.includes("superhero")) {
              return false;
            }
          }
          if (!isExplicitHybrid("horror") && !isExplicitHybrid("slasher") && !isExplicitHybrid("thriller")) {
            if (movieGenres.includes("horror") || movieThemes.includes("serial killer") || movieThemes.includes("gore")) {
              return false;
            }
          }
          if (!isExplicitHybrid("war")) {
            if (movieGenres.includes("war")) {
              return false;
            }
          }
        }

        const isFamilyTarget = targetGenres.some(tg => tg === "family" || tg === "kids" || tg === "children");
        if (isFamilyTarget) {
          if (!isExplicitHybrid("horror") && !isExplicitHybrid("war") && !isExplicitHybrid("crime")) {
            if (movieGenres.includes("horror") || movieGenres.includes("crime") || movieThemes.includes("gore") || movieThemes.includes("erotica")) {
              return false;
            }
          }
        }
      }

      // 6. Region / Language Invariant
      if (region === "south") {
        const lang = (movie.original_language || "").toLowerCase();
        if (!["te", "ta", "ml", "kn"].includes(lang)) return false;
      } else if (region === "north" || region === "bollywood") {
        const lang = (movie.original_language || "").toLowerCase();
        if (lang !== "hi") return false;
      } else if (region === "india" || region === "indian") {
        const lang = (movie.original_language || "").toLowerCase();
        const country = (movie.country || "").toLowerCase();
        const isIndian = INDIAN_LANGS.includes(lang) || country.includes("india") || (Array.isArray(movie.origin_country) && movie.origin_country.includes("IN"));
        if (!isIndian) return false;
      }

      // 7. Hard Anchor Consistency Guard
      // For narrow semantic themes (e.g. "patriotism", "time loop", "superhero"), reject completely unanchored generic movies
      // But allow legitimate genre matches (e.g. thrillers for psychological thrillers) if semantic affinity exists
      const NON_EXCLUSIVE_ANCHORS = [
        "psychological", "dark", "mind bending", "mind-bending", "cerebral", "epic",
        "high octane", "high-octane", "blockbuster", "blockbusters", "action", "adrenaline",
        "fast paced", "intense", "national holiday", "holiday", "celebration", "celebrate",
        "kids", "family", "weekend", "party", "festival", "night", "evening", "day", "new york", "nyc",
        "dark historical", "historical", "history", "period", "classic"
      ];
      const specificAnchors = hardAnchorThemes.filter(a => !NON_EXCLUSIVE_ANCHORS.includes(a));
      if (specificAnchors.length > 0) {
        const allMovieText = `${lowerTitle} ${(movie.genres || []).join(" ")} ${(movie.themes || []).join(" ")} ${movie.overview || ""}`.toLowerCase();
        const hasAnchorMatch = specificAnchors.some(anchor => {
          if (allMovieText.includes(anchor)) return true;
          // Match key semantic tokens (e.g. "mind bending plot twists" matches if text has "twist" or "mind bending")
          const tokens = anchor.split(/\s+/).filter(w => w.length > 3);
          return tokens.length > 1 && tokens.some(t => allMovieText.includes(t));
        });
        const vectorSim = movie.scoreBreakdown?.semanticSimilarity || (movie.score || 0);

        // Reject if completely disjoint from the specific anchor and low confidence
        if (!hasAnchorMatch && vectorSim < 0.60) {
          return false;
        }
      }

      // 8. Low-Confidence Cutoff
      const finalScore = typeof movie.score === "number" ? movie.score : 0.85;
      if (finalScore < minRelevanceCutoff) {
        return false;
      }

      return true;
    });
  }
}

