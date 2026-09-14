// =====================================================================
// 10_queryClassifier.js - FIXED: Better classification for vague queries
// =====================================================================

import { llm } from "../../src/core/2_config.js";

function responseToText(content) {
  if (Array.isArray(content)) {
    return content
      .filter((block) => typeof block === "string" || block.type === "text")
      .map((block) => (typeof block === "string" ? block : block.text))
      .join("\n");
  }
  return String(content ?? "");
}

function extractFirstJsonObject(text) {
  const cleaned = text.replace(/```json\n?/gi, "").replace(/```\n?/g, "").trim();
  const startIndex = cleaned.indexOf("{");
  if (startIndex === -1) throw new Error("No JSON object found.");
  let depth = 0, inString = false, isEscaped = false;
  for (let i = startIndex; i < cleaned.length; i++) {
    const char = cleaned[i];
    if (inString) {
      if (isEscaped) isEscaped = false;
      else if (char === "\\") isEscaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') { inString = true; continue; }
    if (char === "{") depth++;
    if (char === "}") depth--;
    if (depth === 0) return cleaned.slice(startIndex, i + 1);
  }
  throw new Error("Incomplete JSON object.");
}

async function classifyQuery(query, resolvedEntities) {
  const hasResolvedEntities = resolvedEntities.entities.length > 0;
  const entityContext = hasResolvedEntities
    ? resolvedEntities.entities
        .map(e => `"${e.searchTerm}" = ${e.label} (exact: "${e.nodeName}")`)
        .join("\n")
    : "No specific movies, actors, or directors were recognized in the query.";

  const unresolvedContext = resolvedEntities.unresolved.length > 0
    ? `\nUnrecognized terms: ${resolvedEntities.unresolved.join(", ")}`
    : "";

  const prompt = `You are a query classifier for a movie system.

RESOLVED ENTITIES (already looked up in database):
${entityContext}${unresolvedContext}

User query: "${query}"

Decide if this query should go to:
- "graph" → exact, factual questions about specific movies, actors, directors, genres, or relationships.
  Examples: "movies by Nolan", "who acted in Inception", "sci-fi movies", "how is DiCaprio related to Nolan"
- "similarity" → taste-based, subjective, vague, or descriptive queries where the user wants recommendations based on mood, theme, or style.
  Examples: "dark psychological thrillers", "funny sci-fi movies", "emotional time travel films", "movies like Inception"

IMPORTANT RULES:
- If the query contains a specific movie title, actor name, or director name (resolved entities), it's almost always "graph".
- If the query has no resolved entities OR contains descriptive words (dark, funny, emotional, twist, psychological, feel-good, scary, etc.), it should be "similarity".
- Queries asking for "similar", "like", "recommend" are always "similarity".

Respond ONLY with valid JSON: {"type":"graph" or "similarity","reasoning":"one sentence"}`;

  const response = await llm.invoke([
    { role: "system", content: prompt },
    { role: "human", content: query },
  ]);

  try {
    const rawText = responseToText(response.content);
    const jsonObject = extractFirstJsonObject(rawText);
    const parsed = JSON.parse(jsonObject);
    const resultType = (parsed.type === "similarity") ? "similarity" : "graph";
    return { type: resultType, reasoning: parsed.reasoning || "LLM decision" };
  } catch (err) {
    // Fallback: if parsing fails, decide based on presence of resolved entities
    if (hasResolvedEntities) {
      console.warn("⚠️ Classification parsing failed, but resolved entities exist → defaulting to graph.");
      return { type: "graph", reasoning: "Has resolved entities (fallback)" };
    } else {
      console.warn("⚠️ Classification parsing failed, no resolved entities → defaulting to similarity.");
      return { type: "similarity", reasoning: "No entities, vague query (fallback)" };
    }
  }
}

export { classifyQuery };