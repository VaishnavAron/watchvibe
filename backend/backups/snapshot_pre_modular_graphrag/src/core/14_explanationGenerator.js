import { llm } from "../../src/core/2_config.js";

// 🔥 REDIS IMPORT
import * as redisModule from '../config/redis.js';
const redisclient = redisModule.default || redisModule;

// 🔥 HELPER FOR REDIS CACHE KEY
function makeSafeKey(title, year) {
  const safeTitle = (title || "unknown").toLowerCase().replace(/[^a-z0-9]/g, "_");
  return `${safeTitle}_${year || "unknown"}`;
}

// 20 diverse templates – feel free to add more
const TEMPLATES = [
  "If you liked {source}, you'll enjoy {rec} because {facts}.",
  "Fans of {source} often love {rec} – {facts}.",
  "Since you watched {source}, try {rec}: {facts}.",
  "Why {rec}? {facts} – perfect after {source}.",
  "Here's a great follow‑up to {source}: {rec}. {facts}.",
  "Loved {source}? Then {rec} is for you. {facts}.",
  "What makes {rec} similar to {source}? {facts}.",
  "You might also like {rec}, because {facts}. (similar to {source})",
  "From {source} to {rec}: {facts}.",
  "{rec} shares {facts} with {source}.",
  "Like {source}? {rec} offers {facts}.",
  "{rec} is recommended – {facts}. Think {source} but different.",
  "Because of {facts}, {rec} is a natural next watch after {source}.",
  "If {source} hooked you, don't miss {rec}. {facts}.",
  "See why {rec} is similar: {facts} (from {source} fan perspective).",
  "{rec} – {facts}. A must for {source} admirers.",
  "Following the vibe of {source}, try {rec}: {facts}.",
  "The connection? {facts}. That's why {rec} works for {source} fans.",
  "You asked for movies like {source} – {rec} fits because {facts}.",
  "Another great choice: {rec}. {facts} (similar to {source})"
];

function buildFactsString(paths) {
  const parts = [];
  for (const p of paths) {
    if (p.type === 'SAME_DIRECTOR') parts.push(`same director (${p.value})`);
    else if (p.type === 'SAME_ACTOR') parts.push(`stars ${p.value}`);
    else if (p.type === 'SAME_GENRE') parts.push(`shares the ${p.value} genre`);
    else if (p.type === 'SAME_THEME') parts.push(`explores the theme of ${p.value}`);
    else if (p.type === 'USER_FAV_GENRE') parts.push(`matches your favourite genre (${p.value})`);
    else if (p.type === 'USER_FAV_ACTOR') parts.push(`features your favourite actor (${p.value})`);
    else if (p.type === 'USER_TOP_SEARCH') parts.push(`related to your frequent search "${p.value}"`);
  }
  if (parts.length === 0) return "it's recommended";
  return parts.join(", ");
}

function buildFallbackExplanation(rec) {
  const paths = Array.isArray(rec.reasoning_paths) ? rec.reasoning_paths : [];
  
  // Separate graph paths and user paths
  const graphPaths = paths.filter(p => p.type?.startsWith('SAME_'));
  const userPaths = paths.filter(p => p.type?.startsWith('USER_'));
  
  const parts = [];
  for (const p of graphPaths) {
    if (p.type === 'SAME_DIRECTOR') parts.push(`shares director ${p.value}`);
    if (p.type === 'SAME_ACTOR') parts.push(`stars ${p.value}`);
    if (p.type === 'SAME_GENRE') parts.push(`shares the ${p.value} genre`);
    if (p.type === 'SAME_THEME') parts.push(`explores the theme of ${p.value}`);
  }
  for (const p of userPaths) {
    if (p.type === 'USER_FAV_GENRE') parts.push(`matches your favourite genre ${p.value}`);
    if (p.type === 'USER_FAV_ACTOR') parts.push(`features your favourite actor ${p.value}`);
    if (p.type === 'USER_TOP_SEARCH') parts.push(`related to your frequent search "${p.value}"`);
  }
  
  if (parts.length === 0) return "Similar based on overall content.";
  return `${rec.movie.title} ${parts.join(", ")}.`;
}

function buildPrompt(sourceMovie, recommendations) {
  const recLines = recommendations.map((rec, idx) => {
    const paths = rec.reasoning_paths || [];
    const facts = paths.map(p => `- ${p.type.replace('_', ' ')}: ${p.value}`).join('\n      ');
    return `${idx + 1}. ${rec.movie.title} (${rec.movie.year})\n   Facts:\n      ${facts || 'No specific facts'}`;
  }).join('\n\n');

  return `You are a movie recommendation explainer. The user liked "${sourceMovie.title} (${sourceMovie.year})".

Here are 5 recommended movies with their exact facts (reasoning paths):

${recLines}

For each recommendation (1 to 5), write ONE short, natural sentence that explains why it is similar. You MUST mention EVERY fact listed (e.g., if there is a "same actor" fact, you must include the actor's name; if there is a "same theme", include the theme; if multiple facts, combine them naturally).

Do not invent any facts. Do not mention scores or technical terms. Use only the facts provided.

Example output format (JSON array of strings):
["Explanation for movie 1", "Explanation for movie 2", "Explanation for movie 3", "Explanation for movie 4", "Explanation for movie 5"]

Now produce the JSON array:`;
}

async function generateSingleExplanation(sourceMovie, rec) {
  const paths = rec.reasoning_paths || [];
  if (paths.length === 0) {
    return buildFallbackExplanation(rec);
  }
  
  // 🔥 REDIS: CHECK CACHE BEFORE DOING ANYTHING
  const sourceKey = makeSafeKey(sourceMovie.title, sourceMovie.year);
  const recKey = makeSafeKey(rec.movie.title, rec.movie.year);
  const cacheKey = `xai_explain:${sourceKey}_to_${recKey}`;

  try {
    const cachedExplanation = await redisclient.get(cacheKey);
    if (cachedExplanation) {
      console.log(`⚡ [REDIS XAI HIT] Cached reason for: "${rec.movie.title}"`);
      return cachedExplanation;
    }
  } catch (err) {
    console.warn(`⚠️ [REDIS XAI ERROR] Cache read failed:`, err.message);
  }

  // Extract unique fact strings
  const factStrings = [];
  for (const p of paths) {
    if (p.type === 'SAME_DIRECTOR') factStrings.push(`same director (${p.value})`);
    else if (p.type === 'SAME_ACTOR') factStrings.push(`same actor (${p.value})`);
    else if (p.type === 'SAME_GENRE') factStrings.push(`same genre (${p.value})`);
    else if (p.type === 'SAME_THEME') factStrings.push(`same theme (${p.value})`);
    else if (p.type === 'USER_FAV_GENRE') factStrings.push(`matches your favorite genre (${p.value})`);
    else if (p.type === 'USER_FAV_ACTOR') factStrings.push(`features your favorite actor (${p.value})`);
    else if (p.type === 'USER_TOP_SEARCH') factStrings.push(`related to your frequent search "${p.value}"`);
  }
  
  if (factStrings.length === 0) return buildFallbackExplanation(rec);
  
  const facts = factStrings.join(', ');
  const prompt = `Facts for "${rec.movie.title} (${rec.movie.year})":
${facts}

Write ONE short sentence explaining why this movie is similar to "${sourceMovie.title} (${sourceMovie.year})". 
- Do NOT use "I recommend", "you'll like", or any first/second person.
- Do NOT mention the source movie title again – use "this movie" or rephrase.
- Start directly with the reason (e.g., "Shares the same director and action genre.").
- Keep it under 20 words.`;

  try {
    console.log(`🐌 [REDIS XAI MISS] Calling Groq LLM for: "${rec.movie.title}"`);
    const response = await llm.invoke([ { role: "system", content: "You are a concise movie recommender. Output only the sentence, no extra text." },
  { role: "user", content: prompt }]);
    let text = response.content?.trim();
    if (!text || text.length < 5) return buildFallbackExplanation(rec);

    // 🔥 REDIS: SAVE TO CACHE FOR 30 DAYS
    try {
      if (typeof redisclient.setEx === 'function') {
        await redisclient.setEx(cacheKey, 2592000, text);
      } else {
        await redisclient.set(cacheKey, text, 'EX', 2592000);
      }
    } catch (err) {
      console.warn(`⚠️ [REDIS XAI WRITE ERROR]`, err.message);
    }

    return text;
  } catch (err) {
    return buildFallbackExplanation(rec);
  }
}


async function generateRecommendationExplanations(sourceMovie, recommendations) {
  if (!recommendations.length) return [];
  const limited = recommendations.slice(0, 10);
  const explanations = new Array(limited.length);
  const uncachedIndices = [];
  const uncachedRecs = [];

  // Step 1: Check Redis cache for all movies in parallel
  await Promise.all(
    limited.map(async (rec, idx) => {
      const sourceKey = makeSafeKey(sourceMovie.title, sourceMovie.year);
      const recKey = makeSafeKey(rec.movie.title, rec.movie.year);
      const cacheKey = `xai_explain:${sourceKey}_to_${recKey}`;
      try {
        const cached = await redisclient.get(cacheKey);
        if (cached) {
          explanations[idx] = cached;
          return;
        }
      } catch (err) {
        // Redis read failure ignored
      }
      uncachedIndices.push(idx);
      uncachedRecs.push(rec);
    })
  );

  // If all were cached, return instantly
  if (uncachedIndices.length === 0) {
    return explanations;
  }

  // Step 2: Batch synthesize the remaining uncached explanations in ONE single LLM call
  try {
    const prompt = buildPrompt(sourceMovie, uncachedRecs);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1600); // 1.6s maximum cap

    const response = await Promise.race([
      llm.invoke([
        { role: "system", content: "You are a concise movie curation assistant. Return strictly a JSON array of strings containing one short explanation per movie. No markdown fences, no chit-chat." },
        { role: "user", content: prompt }
      ]),
      new Promise((_, reject) => setTimeout(() => reject(new Error("LLM Timeout")), 1600))
    ]);
    clearTimeout(timeout);

    let parsed = [];
    try {
      const cleaned = (response.content || '').replace(/```json/g, '').replace(/```/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      // Parse fallback if format varies
      parsed = (response.content || '').split('\n').filter(Boolean);
    }

    for (let i = 0; i < uncachedIndices.length; i++) {
      const origIdx = uncachedIndices[i];
      const rec = uncachedRecs[i];
      const text = (Array.isArray(parsed) && parsed[i]) ? String(parsed[i]).trim() : buildFallbackExplanation(rec);
      explanations[origIdx] = text;

      // Asynchronously cache for future requests
      const sourceKey = makeSafeKey(sourceMovie.title, sourceMovie.year);
      const recKey = makeSafeKey(rec.movie.title, rec.movie.year);
      const cacheKey = `xai_explain:${sourceKey}_to_${recKey}`;
      try {
        if (typeof redisclient.setEx === 'function') {
          redisclient.setEx(cacheKey, 2592000, text).catch(() => {});
        } else {
          redisclient.set(cacheKey, text, 'EX', 2592000).catch(() => {});
        }
      } catch {}
    }
  } catch (err) {
    console.warn(`⚡ [Fast Fallback] Explanation LLM bypassed (${err.message}). Using deterministic graph paths.`);
    for (let i = 0; i < uncachedIndices.length; i++) {
      const origIdx = uncachedIndices[i];
      explanations[origIdx] = buildFallbackExplanation(uncachedRecs[i]);
    }
  }

  return explanations;
}

export { generateRecommendationExplanations };