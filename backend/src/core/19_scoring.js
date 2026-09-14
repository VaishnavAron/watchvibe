// 19_scoring.js - Pure scoring logic (deterministic + personalisation)
// No external dependencies except Node.js built-ins.

function toLowerClean(value) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function createCaseInsensitiveLookup(values = []) {
  const lookup = new Map();
  for (const value of values) {
    const cleaned = typeof value === "string" ? value.trim() : "";
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (!lookup.has(key)) lookup.set(key, cleaned);
  }
  return lookup;
}

function getIntersectionValues(sourceValues = [], candidateValues = []) {
  const sourceLookup = createCaseInsensitiveLookup(sourceValues);
  const candidateLookup = createCaseInsensitiveLookup(candidateValues);
  const shared = [];
  for (const [key, candidateValue] of candidateLookup.entries()) {
    if (sourceLookup.has(key)) shared.push(candidateValue || sourceLookup.get(key));
  }
  return shared;
}

export function jaccardIndex(arrA = [], arrB = []) {
  const setA = new Set(arrA.map(toLowerClean).filter(Boolean));
  const setB = new Set(arrB.map(toLowerClean).filter(Boolean));
  if (setA.size === 0 && setB.size === 0) return 0.5;
  const intersection = [...setA].filter(v => setB.has(v)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

export function graphCoOccurrenceScore(
  sourceDirectors = [],
  sourceActors = [],
  candidateDirectors = [],
  candidateActors = []
) {
  const commonDirectors = getIntersectionValues(sourceDirectors, candidateDirectors).length;
  const commonActors = getIntersectionValues(sourceActors, candidateActors).length;
  const score = commonDirectors * 0.5 + commonActors * 0.5;
  return Math.min(score, 1.0);
}

/**
 * Compute base score using enriched signals + original deterministic weights
 */
// export function computeBaseScore(sourceMeta, candidateMeta, vectorSource, vectorQuery, themeEntity) {
//   // Original signals
//   const genreJaccard = jaccardIndex(sourceMeta.genres, candidateMeta.genres);
//   const graphScore = graphCoOccurrenceScore(
//     sourceMeta.directors,
//     sourceMeta.actors,
//     candidateMeta.directors,
//     candidateMeta.actors
//   );
//   const combinedVector = vectorSource * 0.5 + vectorQuery * 0.3;

//   // New enriched signals (semantic tags, themes, mood)
//   const themeJaccard = jaccardIndex(sourceMeta.themes || [], candidateMeta.themes || []);
//   const tagJaccard   = jaccardIndex(sourceMeta.semantic_tags || [], candidateMeta.semantic_tags || []);
//   const moodJaccard  = jaccardIndex(sourceMeta.mood || [], candidateMeta.mood || []);

//   // Combine with updated weights
//   let baseScore =
//     combinedVector * 0.55 +          // vector similarity (slightly reduced)
//     genreJaccard    * 0.08 +         // genre (down from 0.15)
//     themeJaccard    * 0.12 +         // theme (now explicit)
//     tagJaccard      * 0.10 +         // semantic tags (new)
//     moodJaccard     * 0.08 +         // mood (new)
//     graphScore      * 0.07;          // graph (unchanged)

//   // Theme entity bonus (when user explicitly asks for a theme)
//   if (themeEntity) {
//     const userTheme = themeEntity.nodeName.toLowerCase();
//     if (candidateMeta.themes.some(t => t.toLowerCase() === userTheme)) {
//       baseScore += 0.1;
//     }
//   }

//   return baseScore;
// }

export function computeBaseScore(sourceMeta, candidateMeta, vectorSource, vectorQuery, themeEntity) {
  // ── Helper: Dice coefficient (2 * |A∩B| / (|A|+|B|)) ──
  const dice = (arrA = [], arrB = []) => {
    const setA = new Set(arrA.map(toLowerClean).filter(Boolean));
    const setB = new Set(arrB.map(toLowerClean).filter(Boolean));
    if (setA.size === 0 && setB.size === 0) return 0.5;
    const intersection = [...setA].filter(v => setB.has(v)).length;
    const sum = setA.size + setB.size;
    return sum === 0 ? 0 : (2 * intersection) / sum;
  };

  // ── original signals ──
  const genreJaccard = jaccardIndex(sourceMeta.genres, candidateMeta.genres);
  const graphScore = graphCoOccurrenceScore(
    sourceMeta.directors,
    sourceMeta.actors,
    candidateMeta.directors,
    candidateMeta.actors
  );

  // ── enriched signals (Dice, not Jaccard) ──
  const themeDice = dice(sourceMeta.themes || [], candidateMeta.themes || []);
  const tagDice   = dice(sourceMeta.semantic_tags || [], candidateMeta.semantic_tags || []);
  const moodDice  = dice(sourceMeta.mood || [], candidateMeta.mood || []);

  // ── combine with industry‑balanced weights ──
  // Vectors carry enriched embedding information → they remain dominant
  let baseScore =
    vectorSource * 0.35 +             // source vector similarity
    vectorQuery * 0.25 +              // query vector similarity
    tagDice       * 0.15 +            // semantic tags (Dice)
    themeDice     * 0.10 +            // themes (Dice)
    moodDice      * 0.07 +            // mood (Dice)
    genreJaccard  * 0.05 +            // genre (reduced further)
    graphScore    * 0.03;             // graph (unchanged)

  // theme‑entity bonus (unchanged)
  if (themeEntity) {
    const userTheme = themeEntity.nodeName.toLowerCase();
    if (candidateMeta.themes.some(t => t.toLowerCase() === userTheme)) {
      baseScore += 0.1;
    }
  }

  return baseScore;
}

/**
 * Compute item-item collaborative filtering affinity based on shared graph paths with user liked movies
 */
export function computeCollaborativeScore(candidateMeta, likedMovies = []) {
  if (!Array.isArray(likedMovies) || likedMovies.length === 0) {
    return { cfScore: 0.5, bestAnchor: null };
  }

  let maxAffinity = 0;
  let bestAnchor = null;

  for (const liked of likedMovies) {
    if (!liked) continue;
    let affinity = 0;

    // Direct match (already liked, will be filtered out or handled)
    if (liked.title && candidateMeta.title && liked.title.toLowerCase() === candidateMeta.title.toLowerCase()) {
      return { cfScore: 1.0, bestAnchor: liked.title };
    }

    // Shared director
    const sharedDirectors = getIntersectionValues(liked.directors || [], candidateMeta.directors || []);
    if (sharedDirectors.length > 0) affinity += 0.40;

    // Shared actors
    const sharedActors = getIntersectionValues(liked.actors || [], candidateMeta.actors || []);
    if (sharedActors.length > 0) affinity += 0.30;

    // Shared themes
    const sharedThemes = getIntersectionValues(liked.themes || [], candidateMeta.themes || []);
    if (sharedThemes.length > 0) affinity += 0.20;

    // Shared genres
    const sharedGenres = getIntersectionValues(liked.genres || [], candidateMeta.genres || []);
    if (sharedGenres.length > 0) affinity += 0.10;

    if (affinity > maxAffinity) {
      maxAffinity = affinity;
      bestAnchor = liked.title || "your liked movies";
    }
  }

  return { 
    cfScore: Math.min(1.0, Math.max(0.2, maxAffinity)), 
    bestAnchor 
  };
}

/**
 * Apply personalisation (filtering, boosts, penalties, collaborative filtering)
 * Returns { finalScore, userReasonPaths, userBoost }
 */
export function applyPersonalisation(baseScore, userProfile, candidateMeta, movieKey) {
  if (!userProfile) {
    return { finalScore: baseScore, userReasonPaths: [], userBoost: 0 };
  }

  // Filter out watched movies
  if (userProfile.watchedKeys && userProfile.watchedKeys.has(movieKey)) {
    return { finalScore: 0, userReasonPaths: [{ type: "WATCHED", value: "already seen" }], userBoost: 0 };
  }

  // Strong penalty for disliked/downvoted movies
  if (userProfile.dislikedKeys && userProfile.dislikedKeys.has(movieKey)) {
    return { 
      finalScore: baseScore * 0.2, 
      userReasonPaths: [{ type: "USER_DISLIKED", value: "previously downvoted" }], 
      userBoost: -0.8 
    };
  }

  let userBoost = 0;
  const userReasonPaths = [];

  // Collaborative filtering boost from upvoted/liked movies
  if (userProfile.likedMovies && userProfile.likedMovies.length > 0) {
    const { cfScore, bestAnchor } = computeCollaborativeScore(candidateMeta, userProfile.likedMovies);
    if (cfScore > 0.4 && bestAnchor) {
      userBoost += (cfScore * 0.25);
      userReasonPaths.push({ 
        type: "COLLABORATIVE_AFFINITY", 
        value: `Recommended because you liked "${bestAnchor}"` 
      });
    }
  }

  // Boost for favourite genres
  const matchingGenres = candidateMeta.genres.filter(g =>
    userProfile.favoriteGenres?.some(fg => fg.toLowerCase() === g.toLowerCase())
  );
  if (matchingGenres.length) {
    userBoost += 0.15;
    userReasonPaths.push({ type: "USER_FAV_GENRE", value: matchingGenres[0] });
  }

  // Boost for favourite actors
  const matchingActors = candidateMeta.actors.filter(a =>
    userProfile.favoriteActors?.some(fa => fa.toLowerCase() === a.toLowerCase())
  );
  if (matchingActors.length) {
    userBoost += 0.15;
    userReasonPaths.push({ type: "USER_FAV_ACTOR", value: matchingActors[0] });
  }

  // Boost from top search keyword
  if (userProfile.searchHistory && userProfile.searchHistory.length) {
    const sortedKeywords = [...userProfile.searchHistory].sort((a, b) => b.frequency - a.frequency);
    const topKeyword = sortedKeywords[0]?.keyword.toLowerCase();
    if (topKeyword) {
      const matchesGenre = candidateMeta.genres.some(g => g.toLowerCase() === topKeyword);
      const matchesTheme = candidateMeta.themes.some(t => t.toLowerCase() === topKeyword);
      if (matchesGenre || matchesTheme) {
        userBoost += 0.10;
        userReasonPaths.push({ type: "USER_TOP_SEARCH", value: topKeyword });
      }
    }
  }

  let finalScore = baseScore + userBoost;

  return { finalScore, userReasonPaths, userBoost };
}