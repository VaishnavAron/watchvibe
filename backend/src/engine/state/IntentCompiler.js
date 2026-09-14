// backend/src/engine/state/IntentCompiler.js
import { llm } from "../../core/2_config.js";
import { classifyTopicTransition } from "./TopicClassifier.js";

/**
 * The 19 Canonical TMDB Genres present in our catalog.
 * The Intent Compiler strictly maps all natural language genres and vibes to these canonical names.
 */
export const CANONICAL_GENRES = [
  "Action", "Adventure", "Animation", "Comedy", "Crime",
  "Documentary", "Drama", "Family", "Fantasy", "History",
  "Horror", "Music", "Mystery", "Romance", "Science Fiction",
  "TV Movie", "Thriller", "War", "Western"
];

const CANONICAL_LOOKUP = new Map(
  CANONICAL_GENRES.map(g => [g.toLowerCase(), g])
);

// Common conversational genre synonyms safely normalized to canonical TMDB genres
const SYNONYM_MAP = {
  "sci-fi": "Science Fiction",
  "scifi": "Science Fiction",
  "science-fiction": "Science Fiction",
  "rom-com": "Romance",
  "romcom": "Romance",
  "romantic comedy": "Romance",
  "dark psychological noir": "Thriller",
  "psychological thriller": "Thriller",
  "neo-noir": "Thriller",
  "noir": "Crime",
  "superhero": "Action",
  "superheroes": "Action"
};

/**
 * Normalizes a genre string to its canonical TMDB genre name, or null if unknown.
 */
export function normalizeCanonicalGenre(input) {
  if (!input || typeof input !== "string") return null;
  const clean = input.trim().toLowerCase();
  if (CANONICAL_LOOKUP.has(clean)) return CANONICAL_LOOKUP.get(clean);
  if (SYNONYM_MAP[clean]) return SYNONYM_MAP[clean];
  return null;
}

/**
 * Deterministic local parser for temporal, rating, and modifier constraints.
 * Used as a fail-safe fallback when LLM is unavailable or for emergency guardrails.
 */
export function compileDeterministicFilters(query) {
  const lower = query.toLowerCase().trim();
  const filters = {
    yearMin: null,
    yearMax: null,
    ratingMin: null,
    excludeGenres: [],
    region: null,
  };
  const modifiers = { more: [], less: [] };

  // Compound era recognition
  const decadeMatches = [...lower.matchAll(/\b('?[0-9]{2}s|[12][0-9]{3}s)\b/gi)];
  if (decadeMatches.length > 0) {
    const years = [];
    for (const dm of decadeMatches) {
      const raw = dm[1].replace("'", "").toLowerCase();
      if (raw === "90s" || raw === "1990s") { years.push(1990, 1999); }
      else if (raw === "80s" || raw === "1980s") { years.push(1980, 1989); }
      else if (raw === "70s" || raw === "1970s") { years.push(1970, 1979); }
      else if (raw === "2000s") { years.push(2000, 2009); }
      else if (raw === "2010s") { years.push(2010, 2019); }
      else if (raw === "2020s") { years.push(2020, 2029); }
    }
    if (years.length > 0) {
      filters.yearMin = Math.min(...years);
      filters.yearMax = Math.max(...years);
    }
  }

  // Rating extraction
  const ratingMatch = lower.match(/(?:rating\s*(?:>=?|above|>)|rated\s*above|above\s*)(\d+(?:\.\d+)?)/i);
  if (ratingMatch) {
    filters.ratingMin = parseFloat(ratingMatch[1]);
  } else if (/(?:critically\s*acclaimed|top\s*rated|high\s*rated)/i.test(lower)) {
    filters.ratingMin = 7.5;
  }

  // Region recognition
  if (/\b(?:south\s+indian|tollywood|kollywood|tamil|telugu|malayalam|kannada)\b/i.test(lower)) {
    filters.region = "south";
  } else if (/\b(?:bollywood|hindi)\b/i.test(lower)) {
    filters.region = "north";
  } else if (/\b(?:indian|india)\b/i.test(lower)) {
    filters.region = "india";
  }

  return { filters, modifiers };
}

/**
 * Extract JSON safely from LLM text
 */
function extractJson(rawText) {
  if (!rawText || typeof rawText !== "string") return null;
  const cleaned = rawText.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  const jsonSlice = cleaned.slice(start, end + 1);
  try {
    return JSON.parse(jsonSlice);
  } catch (e1) {
    try {
      // Fix unquoted keys e.g. label: "Theme", name: "val"
      const fixed = jsonSlice
        .replace(/([{,]\s*)([a-zA-Z0-9_$]+)\s*:/g, '$1"$2":')
        .replace(/"{2,}([a-zA-Z0-9_$]+)"{2,}:/g, '"$1":')
        .replace(/,\s*([}\]])/g, '$1');
      return JSON.parse(fixed);
    } catch (e2) {
      return null;
    }
  }
}

/**
 * Compiles a natural language user query and history into a formal SearchAction
 * using Tier-1 Schema-Grounded Query Planning.
 */
export async function compileIntent(query, currentState, history = []) {
  const localParsed = compileDeterministicFilters(query);
  const transition = classifyTopicTransition(query, currentState);

  const systemPrompt = `You are the Tier-1 Semantic Query Planner for WatchVibe GraphRAG.
Convert conversational movie queries into a strictly typed, schema-grounded SearchAction.
You MUST use valid JSON with double quotes around ALL keys and ALL string values. Example: {"label": "Theme", "name": "dreams"}

CANONICAL TMDB GENRES (You MUST ONLY choose from this exact list):
[Action, Adventure, Animation, Comedy, Crime, Documentary, Drama, Family, Fantasy, History, Horror, Music, Mystery, Romance, Science Fiction, TV Movie, Thriller, War, Western]

OUTPUT ONLY VALID JSON:
{
  "actionType": "NEW_SEARCH" | "REFINEMENT" | "SWITCH_TOPIC",
  "canonicalGenres": ["Romance", "Comedy"],
  "excludeGenres": ["Horror", "Thriller"],
  "vectorQuery": "A rich, descriptive 1-2 sentence narrative describing the movie tone, plot tropes, emotional atmosphere, and aesthetic to match movie synopses in Pinecone. NEVER include conversational filler, day of the week, or negative commands.",
  "referenceMovie": "Specific movie title mentioned by user as reference (e.g. 'Knives Out') or null",
  "franchise": "Specific franchise/universe or null",
  "entities": [
    { "label": "Director" | "Actor" | "Setting" | "Theme", "name": "..." }
  ],
  "filters": {
    "yearMin": number or null,
    "yearMax": number or null,
    "ratingMin": number or null,
    "region": "india" | "south" | "north" | null
  },
  "modifiers": { "more": [], "less": [] },
  "intentSummary": "Brief distillation of cinematic desire"
}

CRITICAL RULES:
1. OCCASIONS & SOCIAL CONTEXT (ZERO KEYWORD HIJACKING):
   - Phrases like "Friday date night", "rainy afternoon", "watch with family" are OCCASIONS, NOT genres or movie titles.
   - For "Friday date night with someone who gets easily scared":
     canonicalGenres: ["Romance", "Comedy"]
     excludeGenres: ["Horror", "Thriller"]
     vectorQuery: "Charming, heartwarming romantic comedy with witty dialogue, cozy feel-good humor, and lovable characters."
     NEVER create entities named "Date Night" or "Friday".
2. EXCLUSIONS & NEGATIONS:
   - "without funny humor or comedy" -> excludeGenres: ["Comedy"], modifiers.less: ["comedy", "humor"]
   - "someone easily scared" / "not scary" (when NO horror requested, e.g. date night) -> excludeGenres: ["Horror", "Thriller"]
   - "horror movies but not scary" / "spooky but not scary" / "mild horror" / "light horror" ->
     canonicalGenres: ["Horror", "Comedy"]
     entities: [{ "label": "Theme", "name": "comedy" }, { "label": "Theme", "name": "dark comedy" }]
     modifiers.more: ["comedy", "dark humor", "spooky fun", "campy", "satire"]
     modifiers.less: ["demonic possession", "exorcism", "gore", "slasher", "torture", "extreme terror", "jump scares"]
     vectorQuery: "Lighthearted horror comedy, fun spooky movie with dark humor, campy gothic fun, playful supernatural mystery, entertaining horror with laughs and zero terror."
3. VECTOR QUERY POSITIVE AESTHETIC RULE (CRITICAL):
   - Dense vector embeddings CANNOT parse grammatical negation like "rather than jump scares" or "without gore".
   - Embedding models treat those words as POSITIVE semantic signals!
   - Therefore, vectorQuery MUST NEVER mention forbidden negative concepts (dread, terror, jump scares, gore, visceral, scary).
   - Translate the negative requirement into the POSITIVE AESTHETIC the user actually desires (e.g. "lighthearted comedy, playful mystery, fun, humor").
4. ERA & DECADE GROUNDING:
   - "80s or 90s" -> yearMin: 1980, yearMax: 1999
   - "90s" -> yearMin: 1990, yearMax: 1999
   - "classic sci-fi from 80s or 90s no comedy" ->
     canonicalGenres: ["Science Fiction"], excludeGenres: ["Comedy"], yearMin: 1980, yearMax: 1999,
     vectorQuery: "Epic, serious science fiction space exploration and extraterrestrial adventure."
5. VIBE ARCHETYPES:
   - "Dark Psychological Noir" -> canonicalGenres: ["Thriller", "Crime", "Mystery"], vectorQuery: "Dark, gritty psychological neo-noir with morally complex characters, intense cerebral tension, and shocking twists."
   - "Mind-Bending Sci-Fi" -> canonicalGenres: ["Science Fiction", "Mystery"], vectorQuery: "Mind-bending, cerebral science fiction with quantum paradoxes, cosmic scope, and philosophical depth."
6. GEOGRAPHIC SETTINGS:
   - Cities and places (e.g. 'New York', 'Paris', 'Space') MUST be labeled as 'Setting', NEVER as 'Genre'.
7. REFINEMENTS VS NEW SEARCH:
   - If user pivots to a new theme/genre/movie, set actionType: "SWITCH_TOPIC".
   - If user refines existing search (e.g. "set in a snowy storm", "only rated > 7.5"), set actionType: "REFINEMENT".`;

  const messages = [
    { role: "system", content: systemPrompt }
  ];

  if (Array.isArray(history) && history.length > 0) {
    history.slice(-4).forEach(turn => {
      messages.push({
        role: turn.sender === "user" || turn.role === "user" ? "user" : "assistant",
        content: turn.text || turn.content || ""
      });
    });
  }
  messages.push({ role: "user", content: query });

  let action = {
    type: transition.isTopicSwitch ? "NEW_SEARCH" : "REFINEMENT",
    interactionType: transition.isTopicSwitch ? "NEW_SEARCH" : "REFINEMENT",
    intentSummary: query,
    canonicalGenres: [],
    vectorQuery: "",
    entities: [],
    referenceMovie: null,
    franchise: null,
    filters: { ...localParsed.filters },
    modifiers: { ...localParsed.modifiers }
  };

  try {
    const response = await llm.invoke(messages);
    console.log("[IntentCompiler] RAW LLM:", response.content);
    const parsed = extractJson(response.content || "");
    console.log("[IntentCompiler] PARSED JSON:", parsed);
    if (parsed) {
      action.type = parsed.actionType || action.type;
      action.interactionType = action.type;
      action.intentSummary = parsed.intentSummary || action.intentSummary;
      action.referenceMovie = parsed.referenceMovie || null;
      action.franchise = parsed.franchise || null;

      // 1. Strictly validate canonical genres
      const rawGenres = Array.isArray(parsed.canonicalGenres) ? parsed.canonicalGenres : [];
      const canonicalSet = new Set();
      for (const g of rawGenres) {
        const norm = normalizeCanonicalGenre(g);
        if (norm) canonicalSet.add(norm);
      }
      action.canonicalGenres = Array.from(canonicalSet);

      // 2. Strictly validate exclude genres
      const rawExcludes = Array.isArray(parsed.excludeGenres) ? parsed.excludeGenres : [];
      const excludeSet = new Set();
      for (const eg of rawExcludes) {
        const norm = normalizeCanonicalGenre(eg);
        if (norm) excludeSet.add(norm);
      }
      action.filters.excludeGenres = Array.from(excludeSet);

      // 3. Vector Query: Latent descriptive expansion
      action.vectorQuery = typeof parsed.vectorQuery === "string" ? parsed.vectorQuery.trim() : "";

      // 4. Entities: Real settings, actors, directors, themes (excluding conversational traps)
      const TRAP_WORDS = ["date night", "friday", "non-horror", "scary", "not scary"];
      action.entities = (Array.isArray(parsed.entities) ? parsed.entities : [])
        .filter(e => e?.name && !TRAP_WORDS.includes(e.name.toLowerCase().trim()));

      // 5. Filters: LLM values take precedence, local parser fills gaps
      const isRefinement = action.type === "REFINEMENT";
      action.filters.yearMin = (typeof parsed.filters?.yearMin === "number")
        ? parsed.filters.yearMin
        : (localParsed.filters.yearMin ?? (isRefinement ? currentState?.filters?.yearMin ?? null : null));

      action.filters.yearMax = (typeof parsed.filters?.yearMax === "number")
        ? parsed.filters.yearMax
        : (localParsed.filters.yearMax ?? (isRefinement ? currentState?.filters?.yearMax ?? null : null));

      action.filters.ratingMin = (typeof parsed.filters?.ratingMin === "number")
        ? parsed.filters.ratingMin
        : (localParsed.filters.ratingMin ?? (isRefinement ? currentState?.filters?.ratingMin ?? null : null));

      const isIndianContext = /\b(?:indian|india|bollywood|hindi|south indian|tollywood|kollywood|tamil|telugu|malayalam|kannada)\b/i.test(query);
      action.filters.region = isIndianContext 
        ? (parsed.filters?.region || localParsed.filters.region || null)
        : null;

      // 6. Modifiers
      action.modifiers.more = Array.isArray(parsed.modifiers?.more) ? parsed.modifiers.more : [];
      action.modifiers.less = Array.isArray(parsed.modifiers?.less) ? parsed.modifiers.less : [];

      // Preserve active state context if query is generic (e.g. "suggest some picks")
      if (action.canonicalGenres.length === 0 && currentState && Array.isArray(currentState.canonicalGenres) && currentState.canonicalGenres.length > 0 && !transition.isTopicSwitch) {
        action.canonicalGenres = [...currentState.canonicalGenres];
      }
      if (action.entities.length === 0 && currentState && Array.isArray(currentState.entities) && currentState.entities.length > 0 && !transition.isTopicSwitch) {
        action.entities = [...currentState.entities];
      }
    }
  } catch (err) {
    console.warn("[IntentCompiler] LLM parsing failed, using deterministic local action:", err.message);
  }

  return action;
}
