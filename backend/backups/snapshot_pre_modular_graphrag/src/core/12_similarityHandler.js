// =====================================================================
// 12_similarityHandler.js - SIMILARITY: Hybrid retrieval + scoring (personalised)
// =====================================================================

import { embedText, pineconeIndex, driver } from "../../src/core/2_config.js";
import { generateRecommendationExplanations } from "../../src/core/14_explanationGenerator.js";
import { getUserProfile } from './17_userProvider.js';
import { computeBaseScore, applyPersonalisation, jaccardIndex, graphCoOccurrenceScore } from './19_scoring.js';
import { getCoWatchedWeight } from '../services/cooccurrenceGraphService.js';
import * as redisModule from '../../src/config/redis.js'; // Path check kar lena 
const redisclient = redisModule.default || redisModule;
const SKIP_CACHE = process.env.SKIP_REDIS_CACHE === 'true';

// ---------- Helper functions (unchanged) ----------
function cleanString(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function toLowerClean(value) {
  return cleanString(value).toLowerCase();
}

function uniqueStrings(values = []) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const cleaned = cleanString(value);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
  }
  return result;
}

function createCaseInsensitiveLookup(values = []) {
  const lookup = new Map();
  for (const value of values) {
    const cleaned = cleanString(value);
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

function normaliseMovieYear(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getMovieKey(title, year) {
  const cleanTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '_');
  return `${cleanTitle}_${year}`;
}

// function buildMovieChunkFromMeta(title, year, meta = {}) {
//   const safeTitle = cleanString(title) || "Unknown";
//   const safeYear = year ?? "Unknown";
//   const director = meta.directors?.length ? meta.directors.join(", ") : "Unknown";
//   const writers = meta.writers?.length ? meta.writers.join(", ") : "Unknown";
//   const cast = meta.actors?.length ? meta.actors.join(", ") : "Unknown";
//   const genres = meta.genres?.length ? meta.genres.join(", ") : "Unknown";
//   const overview = cleanString(meta.overview) || `${safeTitle} is a ${genres} movie.`;
//   const rating = meta.rating ?? 0;
//   const runtime = meta.runtime ?? 0;
//   const popularity = meta.popularity ?? 0;
//   const adult = meta.adult ? "Adult" : "Family Friendly";
//   const language = cleanString(meta.original_language) || "Unknown";
//   const voteCount = meta.vote_count ?? 0;

//   return [
//     `Movie Title: ${safeTitle}`,
//     `Release Year: ${safeYear}`,
//     `Director: ${director}`,
//     `Writers: ${writers}`,
//     `Cast: ${cast}`,
//     `Genres: ${genres}`,
//     `Overview: ${overview}`,
//     `Rating: ${rating}/10 (${voteCount} votes)`,
//     `Runtime: ${runtime} minutes`,
//     `Popularity Score: ${popularity}`,
//     `Audience: ${adult}`,
//     `Original Language: ${language}`,
//   ].join("\n");
// }

function buildMovieChunkFromMeta(title, year, meta = {}) {
  const safeTitle = cleanString(title) || "Unknown";
  const safeYear = year ?? "Unknown";
  const director = meta.directors?.length ? meta.directors.join(", ") : "Unknown";
  const writers = meta.writers?.length ? meta.writers.join(", ") : "Unknown";
  const cast = meta.actors?.length ? meta.actors.join(", ") : "Unknown";
  const genres = meta.genres?.length ? meta.genres.join(", ") : "Unknown";
  const overview = cleanString(meta.overview) || `${safeTitle} is a ${genres} movie.`;
  const rating = meta.rating ?? 0;
  const runtime = meta.runtime ?? 0;
  const popularity = meta.popularity ?? 0;
  const adult = meta.adult ? "Adult" : "Family Friendly";
  const language = cleanString(meta.original_language) || "Unknown";
  const voteCount = meta.vote_count ?? 0;

  const lines = [
    `Movie Title: ${safeTitle}`,
    `Release Year: ${safeYear}`,
    `Director: ${director}`,
    `Writers: ${writers}`,
    `Cast: ${cast}`,
    `Genres: ${genres}`,
    `Overview: ${overview}`,
  ];

  // 🔥 Add enriched fields if they exist
  if (meta.semantic_tags && meta.semantic_tags.length) {
    lines.push(`Semantic Tags: ${meta.semantic_tags.join(", ")}`);
  }
  if (meta.mood && meta.mood.length) {
    lines.push(`Mood: ${meta.mood.join(", ")}`);
  }
  if (meta.enriched_overview) {
    lines.push(`Enriched Overview: ${meta.enriched_overview}`);
  }

  lines.push(
    `Rating: ${rating}/10 (${voteCount} votes)`,
    `Runtime: ${runtime} minutes`,
    `Popularity Score: ${popularity}`,
    `Audience: ${adult}`,
    `Original Language: ${language}`,
  );

  return lines.join("\n");
}

async function getMovieMetadataFromNeo4j(movieTitle, movieYear = null) {
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const result = await session.run(
      `
      MATCH (m:Movie)
      WHERE toLower(m.title) = toLower($title)
        AND ($year IS NULL OR m.year = $year OR m.year IS NULL OR m.year = 0)
      OPTIONAL MATCH (m)-[:BELONGS_TO]-(g:Genre)
      OPTIONAL MATCH (m)-[:EXPLORES]-(t:Theme)
      OPTIONAL MATCH (m)-[:DIRECTED]-(d:Director)
      OPTIONAL MATCH (m)-[:ACTED_IN]-(a:Actor)
      OPTIONAL MATCH (m)-[:WROTE]-(w:Writer)
      RETURN
        m.title AS title,
        m.year AS year,
        m.poster_url AS poster_url,
        m.overview AS overview,
        m.rating AS rating,
        m.vote_count AS vote_count,
        m.runtime AS runtime,
        m.popularity AS popularity,
        m.adult AS adult,
        m.original_language AS original_language,
        m.semantic_tags AS semantic_tags,
        m.mood AS mood,
        m.enriched_overview AS enriched_overview,
        collect(DISTINCT g.name) AS genres,
        collect(DISTINCT t.name) AS themes,
        collect(DISTINCT d.name) AS directors,
        collect(DISTINCT a.name) AS actors,
        collect(DISTINCT w.name) AS writers
      ORDER BY
        CASE WHEN $year IS NOT NULL AND m.year = $year THEN 0 ELSE 1 END,
        coalesce(m.popularity, 0) DESC,
        coalesce(m.vote_count, 0) DESC
      LIMIT 1
      `,
      {
        title: movieTitle,
        year: normaliseMovieYear(movieYear),
      }
    );
    const record = result.records[0];
    if (!record) return null;
    return {
      title: cleanString(record.get("title")) || cleanString(movieTitle),
      year: normaliseMovieYear(record.get("year")),
      poster_url: record.get("poster_url") ?? null,
      overview: record.get("overview") ?? "",
      rating: record.get("rating") ?? null,
      vote_count: record.get("vote_count") ?? 0,
      runtime: record.get("runtime") ?? 0,
      popularity: record.get("popularity") ?? 0,
      adult: record.get("adult") ?? false,
      original_language: record.get("original_language") ?? "",
      genres: uniqueStrings(record.get("genres") || []),
      themes: uniqueStrings(record.get("themes") || []),
      directors: uniqueStrings(record.get("directors") || []),
      actors: uniqueStrings(record.get("actors") || []),
      writers: uniqueStrings(record.get("writers") || []),
      semantic_tags: record.get("semantic_tags") || [],
      mood: record.get("mood") || [],
      enriched_overview: record.get("enriched_overview") || "",
    };
  } finally {
    await session.close();
  }
}

function buildMetadataFilter(sourceTitle, sourceGenres, sourceThemes) {
  const orConditions = [];
  if (sourceGenres.length > 0) orConditions.push({ genres: { $in: sourceGenres } });
  if (sourceThemes.length > 0) orConditions.push({ themes: { $in: sourceThemes } });
  if (orConditions.length === 0) return { title: { $ne: sourceTitle } };
  return { $and: [{ title: { $ne: sourceTitle } }, { $or: orConditions }] };
}

function buildReasoningPaths(sourceMeta = {}, candidateMeta = {}) {
  const sharedDirectors = getIntersectionValues(sourceMeta.directors, candidateMeta.directors);
  const sharedActors = getIntersectionValues(sourceMeta.actors, candidateMeta.actors);
  const sharedGenres = getIntersectionValues(sourceMeta.genres, candidateMeta.genres);
  const sharedThemes = getIntersectionValues(sourceMeta.themes, candidateMeta.themes);
  const paths = [];
  if (sharedDirectors.length) paths.push({ type: "SAME_DIRECTOR", value: sharedDirectors[0] });
  if (sharedActors.length) paths.push({ type: "SAME_ACTOR", value: sharedActors[0] });
  if (sharedGenres.length) paths.push({ type: "SAME_GENRE", value: sharedGenres[0] });
  if (sharedThemes.length) paths.push({ type: "SAME_THEME", value: sharedThemes[0] });
  return paths;
}

async function getBatchMovieMetadataFromNeo4j(titles) {
  if (!titles || !titles.length) return new Map();
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const cleanTitles = Array.from(new Set(titles.map(t => cleanString(t).toLowerCase()).filter(Boolean)));
    const result = await session.run(
      `
      UNWIND $titles AS targetTitle
      MATCH (m:Movie)
      WHERE toLower(m.title) = targetTitle
      OPTIONAL MATCH (m)-[:BELONGS_TO]-(g:Genre)
      OPTIONAL MATCH (m)-[:EXPLORES]-(t:Theme)
      OPTIONAL MATCH (m)-[:DIRECTED]-(d:Director)
      OPTIONAL MATCH (m)-[:ACTED_IN]-(a:Actor)
      OPTIONAL MATCH (m)-[:WROTE]-(w:Writer)
      WITH m,
        collect(DISTINCT g.name) AS genres,
        collect(DISTINCT t.name) AS themes,
        collect(DISTINCT d.name) AS directors,
        collect(DISTINCT a.name) AS actors,
        collect(DISTINCT w.name) AS writers
      RETURN
        m.title AS title,
        m.year AS year,
        m.poster_url AS poster_url,
        m.overview AS overview,
        m.rating AS rating,
        m.vote_count AS vote_count,
        m.runtime AS runtime,
        m.popularity AS popularity,
        m.adult AS adult,
        m.original_language AS original_language,
        m.semantic_tags AS semantic_tags,
        m.mood AS mood,
        m.enriched_overview AS enriched_overview,
        genres, themes, directors, actors, writers
      `,
      { titles: cleanTitles }
    );
    const map = new Map();
    for (const record of result.records) {
      const title = cleanString(record.get("title"));
      if (title) {
        map.set(title.toLowerCase(), {
          title,
          year: normaliseMovieYear(record.get("year")),
          poster_url: record.get("poster_url") ?? null,
          overview: record.get("overview") ?? "",
          rating: record.get("rating") ?? null,
          vote_count: record.get("vote_count") ?? 0,
          runtime: record.get("runtime") ?? 0,
          popularity: record.get("popularity") ?? 0,
          adult: record.get("adult") ?? false,
          original_language: record.get("original_language") ?? "",
          genres: uniqueStrings(record.get("genres") || []),
          themes: uniqueStrings(record.get("themes") || []),
          directors: uniqueStrings(record.get("directors") || []),
          actors: uniqueStrings(record.get("actors") || []),
          writers: uniqueStrings(record.get("writers") || []),
          semantic_tags: record.get("semantic_tags") || [],
          mood: record.get("mood") || [],
          enriched_overview: record.get("enriched_overview") || "",
        });
      }
    }
    return map;
  } catch (err) {
    console.error("Error in getBatchMovieMetadataFromNeo4j:", err);
    return new Map();
  } finally {
    await session.close();
  }
}

async function getEligibleMovieKeysFromNeo4j(sourceMeta) {
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const { genres, themes, title, year } = sourceMeta;
    const genreNames = (genres || []).map(g => g.toLowerCase());
    const themeNames = (themes || []).map(t => t.toLowerCase());

    if (!genreNames.length && !themeNames.length) return new Set();

    const result = await session.run(
      `
      MATCH (g:Genre)<-[:BELONGS_TO]-(m:Movie)
      WHERE toLower(g.name) IN $genreList AND toLower(m.title) <> toLower($sourceTitle)
      RETURN DISTINCT m.title AS title, m.year AS year
      UNION
      MATCH (t:Theme)<-[:EXPLORES]-(m:Movie)
      WHERE toLower(t.name) IN $themeList AND toLower(m.title) <> toLower($sourceTitle)
      RETURN DISTINCT m.title AS title, m.year AS year
      `,
      {
        sourceTitle: title || '',
        genreList: genreNames,
        themeList: themeNames,
      }
    );

    const keys = new Set();
    for (const record of result.records) {
      const movieTitle = cleanString(record.get("title"));
      const movieYear = normaliseMovieYear(record.get("year"));
      if (movieTitle) {
        const key = getMovieKey(movieTitle, movieYear ?? 0);
        keys.add(key);
      }
    }
    console.log(`   Pre‑filtering: found ${keys.size} eligible movies in Neo4j sharing genres/themes`);
    return keys;
  } catch (err) {
    console.error("Error fetching eligible movies:", err);
    return new Set();
  } finally {
    await session.close();
  }
}

// ---------- Diagnostic: fetch a few actual Pinecone _id values ----------
async function samplePineconeIds(limit = 10) {
  try {
    const result = await pineconeIndex.query({
      vector: new Array(1536).fill(0), // dummy vector
      topK: limit,
      includeMetadata: true
    });
    const ids = result.matches.map(m => m.id); // Pinecone's native id (not metadata)
    const metadataIds = result.matches.map(m => m.metadata?._id).filter(Boolean);
    console.log(`   Sample Pinecone vector IDs:`, ids);
    console.log(`   Sample Pinecone metadata _id:`, metadataIds);
    return { ids, metadataIds };
  } catch (err) {
    console.error("   Could not sample Pinecone IDs:", err.message);
    return { ids: [], metadataIds: [] };
  }
}



async function handleSimilarityQuery(query, resolvedEntities, options = { includeLLMExplanation: true, userId: null }) {

  // 🔥 THE CACHE CHECK (Add this at the very beginning)
  const normalizedQuery = query.toLowerCase().trim().replace(/\s+/g, '_');
  const userId = options.userId || 'guest';
  const cacheKey = `sim_engine:${normalizedQuery}_usr_${userId}`;

  // ---------- CACHE READ (skip if SKIP_CACHE) ----------
  if (!SKIP_CACHE) {
    try {
      const cachedResult = await redisclient.get(cacheKey);
      if (cachedResult) {
        console.log(`⚡ [REDIS ENGINE HIT] Instant recommendation for: "${normalizedQuery}"`);
        // return JSON.parse(cachedResult);
         return { ...JSON.parse(cachedResult), cacheHit: true };
      }
    } catch (err) {
      console.warn(`⚠️ [REDIS ENGINE ERROR]`, err.message);
    }
  }



  // 1. Resolve source movie (same as before)
  const movieEntity = resolvedEntities.entities.find(e => e.label === "Movie");
  if (!movieEntity) return { error: "No source movie found", recommendations: [] };

  const requestedTitle = movieEntity.nodeName;
  const requestedYear = normaliseMovieYear(movieEntity.year);
  console.log(`Finding movies similar to: "${requestedTitle}" (${requestedYear ?? "year unknown"})`);

  const sourceMeta = await getMovieMetadataFromNeo4j(requestedTitle, requestedYear);

  if (!sourceMeta) return { error: `Movie "${requestedTitle}" not found.`, recommendations: [] };
  
                                                   //debug

 console.log("Source meta:", JSON.stringify({title: sourceMeta.title, year: sourceMeta.year, genres: sourceMeta.genres, directors: sourceMeta.directors}));

  const sourceTitle = sourceMeta.title;
  const sourceYear = sourceMeta.year;
  console.log(`   Source: genres=${sourceMeta.genres.join(", ")} | directors=${sourceMeta.directors.join(", ")}`);

  // 2. Hybrid retrieval (same as before)
  const sourceChunk = buildMovieChunkFromMeta(sourceTitle, sourceYear, sourceMeta);


                                                      //debug
  console.log("Chunk:\n", sourceChunk);


  // Parallelize embedding generation
  const metadataFilter = buildMetadataFilter(sourceTitle, sourceMeta.genres, sourceMeta.themes);
  const [queryVector, userQueryVector] = await Promise.all([
    embedText(sourceChunk),
    embedText(query)
  ]);

  // Parallelize Pinecone vector lookups
  const [searchResults, thematicResults] = await Promise.all([
    pineconeIndex.query({ vector: queryVector, topK: 80, includeMetadata: true, filter: metadataFilter }),
    pineconeIndex.query({ vector: userQueryVector, topK: 30, includeMetadata: true })
  ]);

  const candidatesMap = new Map();
  for (const match of searchResults.matches) {
    const title = match.metadata?.title, year = match.metadata?.year;
    if (!title) continue;
    const key = `${title.toLowerCase()}_${year}`;
    candidatesMap.set(key, { match, scoreSource: match.score, scoreQuery: 0 });
  }
  for (const match of thematicResults.matches) {
    const title = match.metadata?.title, year = match.metadata?.year;
    if (!title) continue;
    const key = `${title.toLowerCase()}_${year}`;
    if (candidatesMap.has(key)) candidatesMap.get(key).scoreQuery = match.score;
    else candidatesMap.set(key, { match, scoreSource: 0, scoreQuery: match.score });
  }

  const allCandidates = Array.from(candidatesMap.values());
  if (allCandidates.length === 0) return { error: "No similar movies found.", recommendations: [] };
  console.log(`   Received ${allCandidates.length} candidates from Pinecone`);

  // 3. Fetch user profile (if needed)
  let userProfile = null;
  if (options.userId) {
    userProfile = await getUserProfile(options.userId);
    if (userProfile) console.log(`   Personalising for user: ${userProfile.name}`);
  }

  const themeEntity = resolvedEntities.entities.find(e => e.label === "Theme");

  // 4. Batch hydrate and score candidates (0ms loop vs 15s waterfall)
  const candidateTitles = allCandidates
    .map(c => cleanString(c.match.metadata?.title))
    .filter(Boolean);
  const metadataMap = await getBatchMovieMetadataFromNeo4j(candidateTitles);

  const candidatesWithScores = [];
  for (const candidate of allCandidates) {
    const match = candidate.match;
    const vectorSource = candidate.scoreSource;
    const vectorQuery = candidate.scoreQuery;

    const candidateTitle = cleanString(match.metadata?.title);
    const candidateYear = normaliseMovieYear(match.metadata?.year);
    if (!candidateTitle) continue;

    // Self-exclusion check: If user requested a franchise/collection or specified allowSourceMovie, keep the title!
    const allowSourceMovie = Boolean(
      options.allowSourceMovie || 
      options.isFranchise || 
      /(?:all|every)?\s*\w*\s*(?:movies?|films?|franchise|series|universe)/i.test(query)
    );
    if (!allowSourceMovie) {
      if (toLowerClean(candidateTitle) === toLowerClean(sourceTitle) &&
          (sourceYear === null || candidateYear === null || candidateYear === sourceYear)) continue;
    }

    let candidateMeta = metadataMap.get(toLowerClean(candidateTitle));
    if (!candidateMeta) {
      candidateMeta = {
        title: candidateTitle,
        year: candidateYear,
        poster_url: match.metadata?.poster_url ?? null,
        rating: match.metadata?.rating ?? null,
        genres: match.metadata?.genres || [],
        themes: match.metadata?.themes || [],
        directors: match.metadata?.directors || [],
        actors: match.metadata?.actors || [],
        writers: []
      };
    }

    // Compute base score (non-personalised)
    let baseScore = computeBaseScore(sourceMeta, candidateMeta, vectorSource, vectorQuery, themeEntity);

    // 🔥 Real MovieLens 32M collaborative co-occurrence boost
    const coWatchAffinity = getCoWatchedWeight(sourceMeta.title, candidateMeta.title);
    if (coWatchAffinity > 0) {
      baseScore += coWatchAffinity * 0.25;
    }

    // Apply personalisation (if userProfile exists, else returns baseScore)
    const movieKey = getMovieKey(candidateMeta.title, candidateMeta.year);
    const { finalScore, userReasonPaths, userBoost } = applyPersonalisation(baseScore, userProfile, candidateMeta, movieKey);

    if (coWatchAffinity > 0) {
      userReasonPaths.push({
        type: "COLLABORATIVE_GRAPH",
        value: `MovieLens 32M: Frequently co-watched with ${sourceMeta.title} (${Math.round(coWatchAffinity * 100)}% affinity)`
      });
    }

    if (finalScore <= 0) continue; // skip watched movies (score 0)

    candidatesWithScores.push({
      movie: {
        title: candidateMeta.title,
        year: candidateMeta.year,
        poster_url: candidateMeta.poster_url ?? match.metadata?.poster_url ?? null,
        rating: candidateMeta.rating ?? match.metadata?.rating ?? null,
        genres: candidateMeta.genres,
      },
      scores: {
        vectorSource,
        vectorQuery,
        genreOverlap: jaccardIndex(sourceMeta.genres, candidateMeta.genres),
        graphCoOccurrence: graphCoOccurrenceScore(sourceMeta.directors, sourceMeta.actors, candidateMeta.directors, candidateMeta.actors),
        baseScore,
        final: finalScore,
        userBoost,
      },
      candidateMeta,
      userReasonPaths,
    });
  }

  // 5. Sort and take top 5
  candidatesWithScores.sort((a, b) => b.scores.final - a.scores.final);
  const topCandidates = candidatesWithScores.slice(0, 30);

  const recommendations = topCandidates.map(cand => ({
    movie: cand.movie,
    scores: cand.scores,
    reasoning_paths: [
      ...buildReasoningPaths(sourceMeta, cand.candidateMeta),
      ...cand.userReasonPaths,
    ],
    explanation_text: null,
  }));

  // // 6. Generate LLM explanations (optional)
  // if (options.includeLLMExplanation && recommendations.length) {
  //   console.log("   Generating LLM explanations...");
  //   const explanations = await generateRecommendationExplanations(
  //     { title: sourceTitle, year: sourceYear ?? "Unknown" },
  //     recommendations
  //   );
  //   for (let i = 0; i < recommendations.length && i < explanations.length; i++) {
  //     recommendations[i].explanation_text = explanations[i];
  //   }
  // }

   // 6. Generate LLM explanations (optional, globally toggleable)
  const EXPLANATIONS_ENABLED = process.env.ENABLE_LLM_EXPLANATIONS !== 'false';   // defaults to true
  if (EXPLANATIONS_ENABLED && options.includeLLMExplanation && recommendations.length) {
    console.log("   Generating LLM explanations...");
    const explanations = await generateRecommendationExplanations(
      { title: sourceTitle, year: sourceYear ?? "Unknown" },
      recommendations
    );
    for (let i = 0; i < recommendations.length && i < explanations.length; i++) {
      recommendations[i].explanation_text = explanations[i];
    }
  }
  
  console.log(`[SIM] Found ${candidatesWithScores.length} candidates, top score: ${candidatesWithScores[0]?.scores.final}`);


  // 🔥 THE CACHE SAVE (Replace the final return statement with this)
  const finalPayload = {
    query: {
      original: query,
      parsed: { type: "similarity", sourceMovie: `${sourceTitle} (${sourceYear ?? "?"})` },
    },
    recommendations,
    metadata_for_personalization: {
      source_movie_id: `${sourceTitle}_${sourceYear ?? "unknown"}`,
      genres_used: sourceMeta.genres,
      themes_used: sourceMeta.themes,
      directors_used: sourceMeta.directors,
    },
  };

  // ---------- CACHE WRITE (skip if SKIP_CACHE) ----------
  if (!SKIP_CACHE) {
    try {
      if (typeof redisclient.setEx === 'function') {
        await redisclient.setEx(cacheKey, 3600, JSON.stringify(finalPayload));
      } else {
        await redisclient.set(cacheKey, JSON.stringify(finalPayload), 'EX', 3600);
      }
      console.log(`💾 [REDIS ENGINE SET] Saved for 1 hour.`);
    } catch (err) {
      console.warn(`⚠️ [REDIS ENGINE WRITE ERROR]`, err.message);
    }
  }

  // return finalPayload;
    return { ...finalPayload, cacheHit: false };
}


  /*return {
    query: {
      original: query,
      parsed: { type: "similarity", sourceMovie: `${sourceTitle} (${sourceYear ?? "?"})` },
    },
    recommendations,
    metadata_for_personalization: {
      source_movie_id: `${sourceTitle}_${sourceYear ?? "unknown"}`,
      genres_used: sourceMeta.genres,
      themes_used: sourceMeta.themes,
      directors_used: sourceMeta.directors,
    },
  };*/


async function attributeQueryHandler(query) {
  return { query: { original: query }, recommendations: [], error: "Attribute queries not implemented" };
}

export { handleSimilarityQuery, attributeQueryHandler, buildMovieChunkFromMeta };