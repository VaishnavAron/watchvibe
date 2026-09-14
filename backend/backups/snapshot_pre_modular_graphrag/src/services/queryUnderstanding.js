// src/services/queryUnderstanding.js
import { llm } from '../core/2_config.js';
import * as redisModule from '../config/redis.js';

const redisclient = redisModule.default || redisModule;
const SKIP_CACHE = process.env.SKIP_REDIS_CACHE === 'true';

// ─────────────── helpers ───────────────
function responseToText(content) {
  if (Array.isArray(content)) {
    return content
      .filter((block) => typeof block === 'string' || block.type === 'text')
      .map((block) => (typeof block === 'string' ? block : block.text))
      .join('\n');
  }
  return String(content ?? '');
}

function extractFirstJsonObject(text) {
  const cleaned = text.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();
  const startIndex = cleaned.indexOf('{');
  if (startIndex === -1) throw new Error('No JSON object found.');
  let depth = 0, inString = false, isEscaped = false;
  for (let i = startIndex; i < cleaned.length; i++) {
    const char = cleaned[i];
    if (inString) {
      if (isEscaped) isEscaped = false;
      else if (char === '\\') isEscaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') { inString = true; continue; }
    if (char === '{') depth++;
    if (char === '}') depth--;
    if (depth === 0) return cleaned.slice(startIndex, i + 1);
  }
  throw new Error('Incomplete JSON object.');
}

function removeGenericMovieEntities(entities) {
  const genericWords = new Set([
    'action', 'comedy', 'drama', 'horror', 'sci-fi', 'science fiction',
    'thriller', 'romance', 'animation', 'documentary', 'fantasy',
    'adventure', 'mystery', 'crime', 'musical', 'war', 'western',
    'movie', 'film', 'flick', 'movies', 'films', 'cinema', 'feature'
  ]);
  return entities.filter(e => {
    if (e.label !== 'Movie') return true;
    const name = e.name.toLowerCase().trim();
    if (genericWords.has(name)) return false;
    const words = name.split(/\s+/);
    return !words.every(w => genericWords.has(w));
  });
}

// ─────────────── main export ───────────────
export async function understandQuery(query, conversationHistory = []) {
  const normalizedQuery = query.toLowerCase().trim().replace(/\s+/g, ' ');
  const historyKeySuffix = conversationHistory.length 
    ? `_ctx${conversationHistory.length}` 
    : '';
  const cacheKey = `llm_extract_v2:${normalizedQuery}${historyKeySuffix}`;

  // Cache read (skip if SKIP_CACHE=true)
  if (!SKIP_CACHE) {
    try {
      const cachedData = await redisclient.get(cacheKey);
      if (cachedData) {
        console.log(`⚡ [REDIS HIT] Bypassed Groq LLM for query: "${normalizedQuery}"`);
        const parsed = JSON.parse(cachedData);
        parsed.cacheHit = true;
        return parsed;
      }
    } catch (err) {
      console.warn(`⚠️ [REDIS CACHE READ ERROR]`, err.message);
    }
  }

  console.log(`🐌 [REDIS MISS] Calling Groq LLM for: "${normalizedQuery}" (Context turns: ${conversationHistory.length})`);

  // Robust multi-turn prompt
  const systemPrompt = `You are an expert cinematic conversational copilot and GraphRAG intent orchestrator.
Extract structured semantic intent from the user's movie query, handling conversational follow-ups, tone qualifiers, negative feedback, and taste refinements.

Output ONLY a single valid JSON object (no markdown, no prose, no backticks):
{
  "interactionType": "NEW_SEARCH" | "REFINEMENT" | "NEGATIVE_FEEDBACK" | "CONVERSATIONAL",
  "assistantMessage": "A natural, helpful 1-2 sentence response to display to the user in chat (e.g., 'Got it, pivoting away from comedies towards darker psychological thrillers.')",
  "entities": [
    { "label": "Movie" | "Actor" | "Director" | "Genre" | "Theme", "name": "..." }
  ],
  "referenceMovie": "Title of reference film or null",
  "modifiers": {
    "more": ["terms to boost"],
    "less": ["terms to diminish"]
  },
  "excludeGenres": ["genres to reject"],
  "ratingMin": null,
  "yearMin": null,
  "yearMax": null,
  "queryType": "graph" | "similarity" | "hybrid",
  "intentSummary": "1-sentence distillation of cinematic desire"
}

STRICT RULES:
1. "ratingMin": Minimum rating. If user says "high rated", "top rated", "no low rated", "critically acclaimed", set to 7.0. If user gives specific number (e.g. "rated above 8"), extract that number (e.g. 8.0). Otherwise null.
2. "interactionType":
   - "NEGATIVE_FEEDBACK": User expresses dissatisfaction with current results (e.g., "this is not the result i wanted", "none of these", "I don't like comedies", "give me something completely different"). Set this whenever the user rejects recommendations!
   - "REFINEMENT": User narrows down previous request (e.g., "make it darker", "less violent", "from the 90s").
   - "NEW_SEARCH": Brand new film topic or query.
   - "CONVERSATIONAL": General greeting, thank you, or chit-chat.
2. "assistantMessage": Always provide a warm, expert assistant message directly answering the user's remark and explaining how the cinematic engine is responding.
3. "Movie": ONLY specific, real, named movie titles (e.g., "Inception", "Interstellar", "The Dark Knight"). NEVER label generic words as Movie.
4. "Actor" / "Director": Real named individuals (e.g., "Christopher Nolan", "Tom Cruise").
5. "Genre": Real film genres in lowercase (e.g., "action", "sci-fi", "thriller", "drama", "comedy", "crime").
6. "Theme": Atmospheric or tonal keywords (e.g., "philosophical", "cyberpunk", "high tension", "existential", "slow burn", "neo-noir", "mind-bending", "dark").
7. "referenceMovie": If the user says "movies like X" or explicitly asks for more titles similar to an earlier film, extract X here. IMPORTANT: If the user pivots to a new genre, mood, or theme (e.g., "actually not in the mood for crime, give me mind-bending sci-fi", "switch to comedies", "give me anime instead"), you MUST set "referenceMovie": null and "interactionType": "NEW_SEARCH" so the search is NOT constrained to the previous movie!
8. If interactionType is "NEGATIVE_FEEDBACK" and user did not specify a new movie, suggest pivoting to a contrasting genre (e.g. from comedy to dark mystery) and set modifiers.less accordingly so Pinecone does NOT search for the phrase "this is not the result i wanted"!
9. PIVOT & FRANCHISE RULE: If the user pivots to a new franchise, movie universe, or character (e.g. "i actually like spiderman movies", "switch to Batman", "give me Harry Potter"), set "interactionType": "NEW_SEARCH", "referenceMovie": null, and reset "yearMin" and "yearMax" to null so previous temporal restrictions are NOT carried over into modern franchises!`;

  const messages = [
    { role: 'system', content: systemPrompt }
  ];

  // Feed recent conversation context (last 3-4 turns) if available
  if (Array.isArray(conversationHistory) && conversationHistory.length > 0) {
    const recent = conversationHistory.slice(-4);
    recent.forEach((turn) => {
      const role = (turn.sender === 'user' || turn.role === 'user') ? 'user' : 'assistant';
      const content = turn.text || turn.content || '';
      if (content) {
        messages.push({ role, content });
      }
    });
  }

  messages.push({ role: 'user', content: query });

  let finalResult = {
    interactionType: 'NEW_SEARCH',
    assistantMessage: `Exploring cinematic recommendations for: "${query}".`,
    entities: [],
    referenceMovie: null,
    modifiers: { more: [], less: [] },
    excludeGenres: [],
    yearMin: null,
    yearMax: null,
    queryType: 'similarity',
    intentSummary: query,
    cacheHit: false
  };

  try {
    const response = await llm.invoke(messages);
    const rawText = responseToText(response.content);
    const jsonObj = extractFirstJsonObject(rawText);
    const parsed = JSON.parse(jsonObj);

    let entities = parsed.entities || [];
    entities = removeGenericMovieEntities(entities);

    const interactionType = parsed.interactionType || (
      /not\s+what|not\s+the\s+result|don't\s+like|none\s+of\s+these|different/i.test(query)
        ? 'NEGATIVE_FEEDBACK'
        : 'NEW_SEARCH'
    );

    let defaultAssistantMsg = `Exploring cinematic recommendations for: "${query}".`;
    if (interactionType === 'NEGATIVE_FEEDBACK') {
      defaultAssistantMsg = `Understood! Pivoting away from previous suggestions toward atmospheric psychological mysteries and critically acclaimed thrillers.`;
    } else if (interactionType === 'REFINEMENT') {
      defaultAssistantMsg = `Refining your search with your latest preferences.`;
    }

    finalResult = {
      interactionType,
      assistantMessage: parsed.assistantMessage || defaultAssistantMsg,
      entities,
      referenceMovie: parsed.referenceMovie || null,
      modifiers: {
        more: Array.isArray(parsed.modifiers?.more) ? parsed.modifiers.more : [],
        less: Array.isArray(parsed.modifiers?.less) ? parsed.modifiers.less : []
      },
      excludeGenres: Array.isArray(parsed.excludeGenres) ? parsed.excludeGenres : [],
      ratingMin: typeof parsed.ratingMin === 'number' ? parsed.ratingMin : (/(?:high|top|best)\s*rated|critically\s*acclaimed|(?:don'?t\s*want|no)\s*low\s*rated/i.test(query) ? 7.0 : null),
      yearMin: parsed.yearMin || null,
      yearMax: parsed.yearMax || null,
      queryType: ['graph', 'similarity', 'hybrid'].includes(parsed.queryType) ? parsed.queryType : 'similarity',
      intentSummary: parsed.intentSummary || query,
      cacheHit: false
    };
  } catch (parseError) {
    console.error(`❌ [LLM PARSE ERROR] Groq failed. Falling back to generic similarity.`, parseError.message);
    if (/not\s+what|not\s+the\s+result|don't\s+like|none\s+of\s+these|different/i.test(query)) {
      finalResult.interactionType = 'NEGATIVE_FEEDBACK';
      finalResult.assistantMessage = "Understood! Let's pivot away from those titles and explore alternative top-rated cinematic gems.";
      finalResult.modifiers.less = ["comedy", "spoof"];
      finalResult.modifiers.more = ["thriller", "mystery", "psychological"];
    }
    return finalResult;
  }

  // Cache write (24 hours)
  if (!SKIP_CACHE) {
    try {
      if (typeof redisclient.setEx === 'function') {
        await redisclient.setEx(cacheKey, 86400, JSON.stringify(finalResult));
      } else {
        await redisclient.set(cacheKey, JSON.stringify(finalResult), 'EX', 86400);
      }
      console.log(`💾 [REDIS SET] Cached Groq response for 24 hours.`);
    } catch (err) {
      console.warn(`⚠️ [REDIS WRITE ERROR]`, err.message);
    }
  }

  return finalResult;
}